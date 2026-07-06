# Implementation Plan: LLM Bullshit Detector v2

> **Who this document is for:** An LLM coding assistant (the "executor") implementing changes to this
> repository. Follow the phases **in order**. Do not skip ahead. Do not invent features that are not
> in this plan. Each task lists exactly which files to touch, what to change, and how to verify the
> change before moving on.

---

## 0. Current architecture (read this first, do not change anything yet)

The app is a static site (GitHub Pages) + one Cloudflare Worker. There is no build step and no
framework. Plain ES modules loaded from `index.html`.

```
index.html          — page shell, Tailwind via CDN, loads js/main.js as a module
js/main.js          — app orchestration: button handlers, model loading flow, runs the pipeline
js/ui.js            — all DOM rendering (loader, claim checklist, results report, errors)
js/llm.js           — WebLLM engine wrapper: checkGPUStatus(), loadModel(), runInference(messages, timeoutMs)
js/pipeline.js      — extractClaims(), verifyClaims(), JSON parsing helpers, overall score
js/search.js        — performParallelSearches(), DuckDuckGo JSONP + proxy HTML scraping, fetchURL()
js/prompts.js       — STAGE1_PROMPT (claim extraction), STAGE3_PROMPT (verdict), and two *unused* JSON schemas
js/constants.js     — SEARCH_PROXY_URL, MODEL_TIERS (Qwen2-1.5B, Phi-3-mini), humor strings, score labels
js/bandwidth.js     — download speed estimation for the model loader
css/style.css       — custom styles on top of Tailwind
worker/search-proxy.js — Cloudflare Worker: GET ?q= proxies lite.duckduckgo.com HTML; POST /fetch fetches an arbitrary URL
worker/wrangler.toml   — worker config
```

The verification pipeline is 3 stages:

1. **Extract** — local WebLLM model reads pasted text, returns `{claims: [{claim, searchQuery}]}` as free-form text that we try to parse as JSON.
2. **Search** — for each selected claim, query DuckDuckGo (JSONP instant-answer first, then the Worker proxy which scrapes `lite.duckduckgo.com` HTML with a DOM parser + regex fallback).
3. **Verdict** — for each claim, the local model compares the claim against ≤5 search snippets and returns `{claim, rating: Fresh|Smelly|Bullshit, explanation, sources}` as free-form text parsed as JSON.

Overall score = average of (Fresh=0, Smelly=50, Bullshit=100).

### The four real weaknesses this plan fixes, in priority order

1. **Unreliable JSON from small models.** `runInference` does unconstrained text generation, then
   `parseModelJson` strips code fences and regex-fixes trailing commas. WebLLM supports
   **grammar-constrained JSON output** (`response_format` with a schema) — the schemas already
   exist in `prompts.js` and are dead code. Fixing this removes an entire class of "Smelly because
   the model produced malformed output" failures. (Phase 1)
2. **Weak evidence.** DuckDuckGo instant answers are usually empty; the lite-HTML scraper is fragile
   (the codebase literally has a `DUCK_EVOLVED_MESSAGE` for when DDG changes markup) and snippets
   are 1–2 sentences. Verdicts are only as good as the evidence. Phase 2 adds a real search API in
   the Worker with DDG as fallback, and fetches the top result pages to extract relevant passages.
3. **Misleading score.** "Smelly" (unverifiable) contributes 50% toward "Bullshit %". A claim that
   search simply couldn't cover is *not* half-bullshit. Phase 3 replaces the single percentage with
   an honest breakdown and only counts contradicted claims as bullshit.
4. **Dead-end for most visitors.** No WebGPU → the app is unusable (Safari, most mobile, older
   machines). Phase 4 adds an optional "bring your own API key" mode using any OpenAI-compatible
   endpoint, which also gives power users far better verdict quality.

### Executor ground rules

- **No frameworks, no bundler, no npm dependencies in the frontend.** Everything stays plain ES
  modules served statically. The only place `npm` packages are acceptable is `devDependencies`
  for tests.
- **Do not rewrite files wholesale.** Make targeted edits. Keep the existing humor/tone in
  user-facing strings.
- **Keep the module boundaries**: DOM code only in `ui.js` and `main.js`; no DOM access in
  `pipeline.js`, `llm.js`, `prompts.js`. (`search.js` currently uses `DOMParser`/`document` for
  HTML parsing and JSONP — that is allowed to remain.)
- After every task, run the verification listed for that task. After every phase, run the full
  test suite (`npm test`, once Phase 0 exists) and load the page once via
  `python3 -m http.server 8080` → open `http://localhost:8080` and check the browser console for
  errors (a Playwright check of "page loads, no console errors, textarea and button present" is
  enough; you cannot run WebGPU inference headlessly).
- If a task's instructions conflict with what you find in the code, **stop and report the
  discrepancy** instead of improvising.

---

## Phase 0 — Test harness and evaluation fixtures

Goal: give yourself (the executor) a way to verify changes without a GPU. Pure-logic functions get
unit tests; HTML parsers get fixture tests. This phase must land before any behavior changes.

### Task 0.1 — Set up Vitest

- Edit `package.json` (repo root): add `"devDependencies": { "vitest": "^2" }` and
  `"scripts": { "test": "vitest run" }`. Keep existing content.
- Run `npm install`.
- Add `node_modules/` to `.gitignore` if not already present.

**Verify:** `npm test` runs and reports "no tests found" (or passes trivially).

### Task 0.2 — Extract pure logic so it is testable

`pipeline.js` mixes pure functions with inference calls. Move the pure parts:

- Create `js/scoring.js` exporting `parseModelJson(response, fallback)`,
  `parseStage3Response(response, item)` and `calculateOverallRating(verdicts)` — cut them out of
  `pipeline.js` verbatim (do not change behavior in this task) and import them back into
  `pipeline.js`.
- Create `test/scoring.test.js` covering at minimum:
  - `parseModelJson`: valid JSON; JSON wrapped in ```json fences; JSON with trailing commas;
    complete garbage → returns fallback; JSON preceded by prose ("Sure! Here is the JSON: {…}").
  - `parseStage3Response`: valid verdict passes through; invalid rating string → "Smelly";
    missing/empty explanation → downgraded to "Smelly" with the caution text; missing sources →
    fallback sources built from snippets.
  - `calculateOverallRating`: `[] → 0`, all Fresh → 0, all Bullshit → 100, mixed cases.

**Verify:** `npm test` green. The app still loads without console errors (imports resolved).

### Task 0.3 — Search-parser fixture tests

- Export `parseDuckDuckGoLite`, `parseDuckDuckGoRegex`, and `extractRealUrl` from `js/search.js`
  (add `export` keywords; nothing else changes).
- Save a real `lite.duckduckgo.com` response as `test/fixtures/ddg-lite.html`
  (fetch one with `curl -A "Mozilla/5.0" "https://lite.duckduckgo.com/lite/?q=eiffel+tower+height" -o test/fixtures/ddg-lite.html`;
  if the request is blocked, hand-write a fixture matching the structure the parser expects:
  `<tr>` rows containing `a.result-link` and `td.result-snippet`).
- Create `test/search.test.js`. `parseDuckDuckGoLite` uses `DOMParser`, so configure Vitest to use
  jsdom for this file: `npm i -D jsdom` and add `// @vitest-environment jsdom` at the top of the
  test file. Test: fixture yields >0 results each with non-empty `title`, `url` starting with
  `http`, and `snippet`; `extractRealUrl` decodes `uddg=` redirect URLs and passes plain URLs
  through.

**Verify:** `npm test` green.

### Task 0.4 — Prompt evaluation fixture set (data only, no runner)

Create `test/fixtures/eval-claims.json`: an array of 15 objects
`{ "claim": "...", "searchQuery": "...", "expected": "Fresh" | "Bullshit" }` — 8 well-known true
claims (e.g. "The Eiffel Tower is located in Paris", "Water boils at 100°C at sea level") and 7
clearly false ones (e.g. "The Great Wall of China is visible from the Moon with the naked eye",
"Einstein failed mathematics in school"). This file is used by the manual eval procedure in
Phase 5; creating it now locks the format.

**Verify:** `node -e "JSON.parse(require('fs').readFileSync('test/fixtures/eval-claims.json'))"` exits 0.

---

## Phase 1 — Reliable structured output + better claim extraction

### Task 1.1 — Grammar-constrained JSON decoding

This is the highest-value change in the whole plan.

- In `js/llm.js`, change `runInference(messages, timeoutMs)` to
  `runInference(messages, timeoutMs, schema)` (third param optional). When `schema` is provided,
  pass it to WebLLM's chat completion call:

  ```js
  const request = {
    messages,
    temperature: 0,
    ...(schema && {
      response_format: { type: 'json_object', schema: JSON.stringify(schema) }
    })
  };
  ```

  Note: WebLLM expects the schema as a **string** (`JSON.stringify(schema)`), and the field name is
  `response_format.schema`. Check the installed WebLLM version's typings/README if the completion
  call rejects this shape; the API surface is
  `engine.chat.completions.create({ messages, response_format: { type: "json_object", schema } })`.
- In `js/prompts.js`, change `STAGE3_SCHEMA` to describe a **single verdict object**
  (`{claim, rating, explanation, sources}`) instead of the current `{verdicts: [...], overallSmellRating}`
  wrapper — the pipeline verifies one claim per call and computes the overall score itself, so the
  wrapper schema is wrong. Keep `rating` as `enum: ['Fresh', 'Bullshit', 'Smelly']` and keep
  `required: ['claim', 'rating', 'explanation', 'sources']`.
- In `js/pipeline.js`: `extractClaims` passes `STAGE1_SCHEMA`, `verifyClaims` passes the revised
  `STAGE3_SCHEMA` to `runInference`. Import both from `prompts.js`.
- **Keep** `parseModelJson` and all fallback handling exactly as-is — constrained decoding can
  still time out or the feature may be unavailable for a model; the parse fallbacks remain the
  safety net.
- Trim the now-redundant "respond with ONLY a JSON object, no markdown fences" boilerplate from
  both prompts down to one sentence each (the grammar enforces it; keeping one sentence helps the
  model plan its output). Do not touch the rating-definition text in `STAGE3_PROMPT`.

**Verify:** `npm test` still green. Manual: serve the site, open in Chrome, paste a two-sentence
text with one obvious factual claim, confirm claims are extracted and a verdict renders. (If you
cannot run a browser with WebGPU, state so in your report and mark this as needing human
verification — do not claim it works.)

### Task 1.2 — Decontextualized, higher-quality claim extraction

Small models extract claims like "It was released in 2019" — unverifiable without context. Edit
`STAGE1_PROMPT` in `js/prompts.js`, adding these instructions (keep the existing ones):

- "Each claim must be fully self-contained: resolve all pronouns and references. Write 'Python 3.12
  was released in October 2023', never 'It was released in October 2023'."
- "Split compound sentences into separate atomic claims — one checkable fact per claim."
- "Maximum 12 claims. If the text has more, keep the 12 most consequential/specific ones."
- Extend `STAGE1_SCHEMA` items with an `"importance"` property, `enum: ['high', 'medium', 'low']`,
  and add it to the prompt ("rate how central this claim is to the text's overall message").
  Add `importance` to the items' `required` list.
- In `js/ui.js` `renderClaimChecklist`, sort claims high → medium → low before rendering, and
  pre-check only `high` and `medium` claims (low-importance ones render unchecked). If the
  checklist code doesn't easily support default-unchecked, render all checked as today and skip
  that part — note it in your report.

**Verify:** `npm test` green; page loads without console errors.

### Task 1.3 — Update the model lineup

Qwen2-1.5B is outdated; Qwen2.5 (and newer) prebuilt MLC models are strictly better at instruction
following and JSON.

- First, discover valid IDs: create a scratch page or run in the browser console
  `import('https://esm.run/@mlc-ai/web-llm').then(m => console.log(m.prebuiltAppConfig.model_list.map(x => x.model_id).filter(id => /qwen|llama-3.2|phi/i.test(id))))`
  — or check `node_modules`/the WebLLM version pinned in `index.html`. **Only use model IDs that
  appear in that list.** Do not guess IDs.
- In `js/constants.js` `MODEL_TIERS`, replace `Qwen2-1.5B-Instruct-q4f16_1-MLC` with the newest
  available Qwen ~1.5B instruct variant (e.g. `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` if present), and
  add a third tier `id: 'quick'` using the smallest usable model (e.g.
  `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, ~0.5 GB) labeled "Quick Sniff" with a tagline that it's
  fast but less reliable. Keep Phi-3-mini as "Full Autopsy" unless a Llama-3.2-3B variant exists
  in the list — if it does, prefer it and update the size number.
- Update the model names/sizes mentioned in `README.md` (Step 3 and Tech stack sections).

**Verify:** IDs verified against the prebuilt list (paste the matching list entries into your
report). Page loads; the tier dropdown shows three tiers.

---

## Phase 2 — Evidence quality (Worker + retrieval)

The Worker is the only server-side code; everything here is in `worker/search-proxy.js` unless
stated. **Never expose API keys in frontend code — keys live only in Worker secrets.**

### Task 2.1 — Brave Search API in the Worker, DDG as fallback

- New Worker endpoint `GET /search?q=...` that returns **JSON** (not HTML):
  `{ results: [{title, url, snippet}], source: "brave" | "ddg" }`.
- Implementation: if the env binding `BRAVE_API_KEY` is set, call
  `https://api.search.brave.com/res/v1/web/search?q=<query>&count=8` with headers
  `{ 'X-Subscription-Token': env.BRAVE_API_KEY, 'Accept': 'application/json' }`. Map
  `body.web.results[]` to `{title: r.title, url: r.url, snippet: r.description}`. On any error or
  missing key, fall back to the existing DDG-lite fetch and parse the HTML **in the Worker**
  (port `parseDuckDuckGoRegex` from `js/search.js` — the regex variant only; Workers have no
  DOMParser) and return the same JSON shape with `source: "ddg"`.
- Change the worker's `fetch` router: keep the legacy `?q=` HTML passthrough working (old clients),
  add the new `/search` route.
- Signature change: `async fetch(request, env)` — the current code ignores `env`; it's needed for
  the secret.
- Add `Cache-Control: public, max-age=3600` on `/search` responses and use the Workers Cache API
  (`caches.default`) keyed on the normalized query so repeated identical queries don't burn Brave's
  free-tier quota (2,000 queries/month).
- Document in a new `worker/README.md`: `npx wrangler secret put BRAVE_API_KEY`, where to get a key
  (https://brave.com/search/api/ — free "Data for Search" plan), and that the worker silently falls
  back to DDG without it.
- Frontend: in `js/search.js`, rewrite `performSearch(query)` to call `${SEARCH_PROXY_URL}/search?q=...`
  first and parse the JSON. Keep the JSONP instant-answer attempt as a *supplement* (merge its
  results in if any), and keep the legacy HTML-scrape path only as the final fallback when `/search`
  returns non-OK (so an un-redeployed worker still works). Deduplicate merged results by URL.

**Verify:** unit tests still green (the exported parsers are untouched). Test the worker locally:
`cd worker && npx wrangler dev`, then
`curl "http://localhost:8787/search?q=eiffel+tower+height"` returns JSON with ≥1 result (DDG
fallback path; you won't have a Brave key). Do NOT deploy — the human deploys.

### Task 2.2 — SSRF-harden and generalize `/fetch`

The `/fetch` endpoint fetches arbitrary URLs — currently only used for the user-supplied URL field,
and Task 2.3 will use it for search results. Harden it:

- Reject non-`http(s)` schemes.
- Reject hostnames that are IP literals in private/reserved ranges (`10.*`, `172.16-31.*`,
  `192.168.*`, `127.*`, `169.254.*`, `0.*`, `::1`, `fc00::/7`) and the hostnames `localhost` /
  `*.internal` / `*.local`. A hostname-string check is sufficient (Workers can't resolve DNS
  before fetching); also pass `redirect: 'follow'` and after the fetch check `resp.url` against
  the same rules, discarding the response if a redirect landed somewhere forbidden.
- Cap response read at `maxChars` **while streaming** (read the body reader in chunks, stop at the
  cap) rather than buffering the whole body; cap `maxChars` itself at 100,000.
- Strip HTML to text in the Worker (there is likely already logic for this in `handleFetch` —
  inspect it; if it returns raw HTML, add tag-stripping: remove `<script>`/`<style>` blocks, strip
  tags, collapse whitespace) and return `{ url, title, text }`.
- Add a simple per-IP rate limit using the Cache API or an in-memory Map: max 30 `/fetch` calls per
  minute per `CF-Connecting-IP`, respond 429 beyond that. Best-effort is fine (in-memory Map resets
  on isolate recycle — acceptable).

**Verify:** with `wrangler dev`: `/fetch` with `{"url": "http://169.254.169.254/"}` → 4xx;
`{"url": "https://example.com"}` → JSON containing "Example Domain" text.

### Task 2.3 — Passage retrieval: fetch top pages, rank passages, feed the best to the model

This turns thin snippets into real evidence. All frontend work.

- Create `js/retrieval.js` with:
  - `export function chunkText(text, { chunkSize = 500, overlap = 100 })` — split page text into
    overlapping character-window chunks, breaking at sentence boundaries where possible.
  - `export function rankPassages(query, chunks, topK = 3)` — lexical scoring, no ML: tokenize to
    lowercase words minus a ~50-word English stopword list; score each chunk by BM25 (implement the
    standard formula: k1=1.5, b=0.75, using the chunk set as the corpus for IDF). Return top-K
    chunks with scores.
  - `export async function gatherEvidence(claimItem, fetchURLFn)` — takes
    `{claim, searchQuery, snippets}`: pick the top 2 snippet URLs (skip obviously non-content hosts:
    youtube.com, facebook.com, x.com/twitter.com, instagram.com, tiktok.com, pinterest.com), fetch
    each via `fetchURLFn` (i.e. `fetchURL` from `search.js`) with `maxChars: 20000` and a 10 s
    `Promise.race` timeout each, run `chunkText` + `rankPassages(claim.claim + ' ' + claim.searchQuery, chunks, 2)`
    per page, and return `{ ...claimItem, passages: [{url, title, text, score}] }`. Any fetch
    failure → skip that URL silently (snippets remain the fallback evidence). The two page fetches
    run in parallel (`Promise.allSettled`).
- In `js/pipeline.js` `verifyClaims`: after the existing snippet block, if `item.passages?.length`,
  append to the user message:
  `\n\nEXTRACTED PAGE CONTENT (deeper evidence from the top sources):\n` followed by each passage as
  `[Source: <url>]\n<text>` capped at 1,200 chars per passage. Update `STAGE3_PROMPT` with one
  line: "Extracted page content is deeper evidence than the short snippets — when they conflict,
  trust the extracted page content."
- In `js/main.js`, between search and verification, call `gatherEvidence` for all selected claims
  with concurrency 3 (implement a tiny promise-pool inline; do not add a dependency), with a status
  update "Reading the top sources for claim X of Y...". If the proxy isn't configured
  (`fetchURL` throws immediately), skip evidence gathering entirely and proceed with snippets only —
  this must not break the no-proxy setup.
- Create `test/retrieval.test.js`: `chunkText` produces overlapping chunks covering the whole text;
  `rankPassages` ranks a chunk containing the query terms above unrelated chunks; stopwords don't
  dominate (query "what is the height of the eiffel tower" must rank an Eiffel chunk above a chunk
  full of "the the the what is").

**Verify:** `npm test` green. Manual browser run if possible (same caveat as 1.1).

---

## Phase 3 — Honest scoring and better report UX

### Task 3.1 — Replace the single "Bullshit %" with a breakdown

- In `js/scoring.js`, add
  `export function summarizeVerdicts(verdicts)` returning
  `{ fresh, smelly, bullshit, total, bullshitPct, uncheckedPct }` where `bullshitPct` counts **only**
  Bullshit verdicts (`round(100 * bullshit / total)`) and `uncheckedPct` is the Smelly share. Keep
  `calculateOverallRating` exported (tests use it) but stop using it in the pipeline.
- `js/pipeline.js`: return `summary: summarizeVerdicts(verdicts)` instead of / alongside
  `overallSmellRating` (check what `main.js`/`ui.js` consume and update those call sites).
- `js/ui.js` `renderResults`: replace the single percentage headline with three counters —
  "🟢 N confirmed · 🟡 N unverified · 🔴 N contradicted" — plus a horizontal stacked bar (three
  `div`s with widths proportional to counts, colors matching the existing Fresh/Smelly/Bullshit
  palette). Keep a headline verdict line driven by `SCORE_LABELS` in `constants.js`, but key it on
  `bullshitPct` and add one new label tier for "high unverified, low bullshit" (e.g. `smelly > 50%
  and bullshit < 20%` → "Couldn't verify much — that's not proof of bullshit, but don't trust it
  blindly either."). Adjust `SCORE_LABELS` text only if a label now reads wrong.
- Update `README.md` sections "Step 6" and the FAQ entry "Why is the overall score 100% Bullshit
  when some claims are Fresh?" (rewrite: the score now only counts contradicted claims; unverified
  claims are reported separately).
- Add tests for `summarizeVerdicts` in `test/scoring.test.js`.

### Task 3.2 — Stream verdicts as they complete

Currently all verdicts render at the end. `verifyClaims` already loops claim-by-claim:

- Add an `onVerdict(verdict, index, total)` callback parameter to `verifyClaims`; call it after each
  claim's verdict is finalized.
- `js/ui.js`: add `renderVerdictIncremental(container, verdict)` that appends a single verdict card
  (reuse the exact card markup from `renderResults` — extract a shared `verdictCardHTML(verdict)`
  helper so the two stay identical). `main.js` wires it: create the results container when
  verification starts, append cards as they arrive, and render the summary header (Task 3.1) last.
- Add a **Cancel** button visible during verification. Implement via an `AbortSignal`-style flag: a
  module-level `let cancelled = false` in `main.js`, checked at the top of each loop iteration in
  `verifyClaims` (pass a `shouldCancel: () => boolean` option). On cancel, render the summary over
  the verdicts collected so far with a note "(stopped early — N of M claims checked)".

### Task 3.3 — Shareable / exportable report

- Add a "Copy report as Markdown" button to the results view. Generate:

  ```markdown
  # Bullshit Report
  **N claims checked — X confirmed, Y unverified, Z contradicted**

  ## 🔴 Bullshit
  - **<claim>** — <explanation>
    - <source title>: <url>
  ## 🟡 Smelly
  ...
  ## 🟢 Fresh
  ...

  _Generated by LLM Bullshit Detector — <site URL>_
  ```

  Implement `export function reportToMarkdown(verdicts, summary)` in `js/scoring.js` (pure, testable)
  and a clipboard-write handler in `ui.js` (`navigator.clipboard.writeText`, with a "Copied!"
  confirmation state on the button). Add a test with a fixed verdicts array asserting the exact
  markdown output.

**Verify (whole phase):** `npm test` green; manual browser pass if possible.

---

## Phase 4 — "Bring your own key" mode (works without WebGPU, better quality)

Optional remote inference through any OpenAI-compatible chat-completions endpoint. The key stays in
`localStorage` and requests go directly from the browser to the provider — it must **never** touch
the Worker or any server we run.

### Task 4.1 — Remote engine in `llm.js`

- Add a module-level engine mode: `'local'` (default, WebLLM) or `'remote'`.
  `export function configureRemote({ baseUrl, apiKey, model })` and
  `export function useLocalEngine()`.
- When remote, `runInference(messages, timeoutMs, schema)` does a `fetch(baseUrl + '/chat/completions', ...)`
  with `Authorization: Bearer <key>`, body `{ model, messages, temperature: 0 }`. If `schema` is
  set, add `response_format: { type: 'json_object' }` (plain json_object — most providers don't
  accept a schema field; the existing parse fallbacks handle any looseness). Return
  `choices[0].message.content`. Respect `timeoutMs` via `AbortController`. Surface HTTP errors as
  `Error` with the provider's message so the UI shows something actionable.
- `checkGPUStatus`/model loading are bypassed entirely in remote mode: in `main.js`, when remote is
  configured, skip `loadModel` and go straight to the pipeline. The WebGPU-blocked error screens
  must now also say: "…or click 'Use your own API key' below to run without a local model."

### Task 4.2 — Settings UI

- Add a small "⚙️ Use your own API key" link/button near the model tier dropdown. It opens an inline
  panel (no modal library) with: provider preset dropdown (OpenRouter → `https://openrouter.ai/api/v1`,
  OpenAI → `https://api.openai.com/v1`, Custom → free-text base URL), model name text input, API key
  password input, Save / Clear buttons.
- Persist `{baseUrl, model}` under `localStorage['bullshit-remote-config']` and the key under
  `localStorage['bullshit-remote-key']`. On load, if present, call `configureRemote` and show a
  badge "Remote: <model>" with an ✕ to revert to local.
- Plain-language privacy note in the panel: "Your key is stored only in this browser and sent only
  to the provider you chose. In this mode your pasted text is sent to that provider."
- Update `README.md`: new section "No WebGPU? Bring your own key" explaining the mode and privacy
  trade-off.

**Verify:** `npm test` green. Manual: with an invalid key against OpenRouter, the pipeline fails
with the provider's auth error displayed, not a silent hang. (Real-key testing is for the human.)

---

## Phase 5 — Engineering hygiene and evaluation

### Task 5.1 — CI

- Add `.github/workflows/ci.yml`: on push/PR — checkout, setup-node 20, `npm ci`, `npm test`.
- Add a second job step running `node --check` over every file in `js/` and `worker/` (cheap syntax
  gate since there's no bundler): `for f in js/*.js worker/*.js; do node --check "$f"; done`.

### Task 5.2 — Manual eval procedure

- Create `docs/EVAL.md` describing how a human runs the eval: for each entry in
  `test/fixtures/eval-claims.json`, paste the claim, run verification with the default tier, and
  record verdict vs `expected` in a results table; ≥70% agreement on the 15 fixtures is the bar
  before shipping prompt changes. Include a blank markdown results table to copy.

### Task 5.3 — Documentation truth pass

- Reconcile `README.md` with everything shipped in Phases 1–4 (three model tiers, Brave-backed
  search with DDG fallback, breakdown score, markdown export, BYO-key mode, cancel button).
- Update the FAQ answer "Does this send my data anywhere?" — it must now mention that (a) in
  local mode search queries and *fetched source URLs* go through the proxy, and (b) in BYO-key mode
  the pasted text goes to the chosen provider.

**Final verification:** `npm test` green; CI workflow file passes `act`-style dry inspection (valid
YAML); site loads locally with zero console errors; a human performs one full end-to-end run per
`docs/EVAL.md`.

---

## Explicitly out of scope (do not build these)

- Accounts, saved history, databases, analytics, or any server beyond the single Worker.
- In-browser embedding models / transformers.js for passage ranking (BM25 in Task 2.3 is the
  chosen approach — do not "upgrade" it).
- Rewriting the UI in React/Vue/Svelte or adding a bundler.
- Multi-language support, browser extension, PWA/offline mode.
- Automated LLM-based eval runners (the eval is deliberately manual — WebGPU can't run in CI).

## Suggested commit granularity

One commit per task, message format: `Phase X.Y: <task title>`. Never combine tasks across phases
in one commit.
