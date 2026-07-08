# Implementation Plan: LLM Bullshit Detector v3 — "Fix what's silently broken, then simplify"

> **Who this is for:** An LLM coding assistant executing changes to this repo. Work through the
> milestones **in order**. Each milestone leaves the app fully working. Do not skip ahead, do not
> invent features, do not add dependencies. If the code you find contradicts an instruction,
> **stop and report the discrepancy** instead of improvising.
>
> **Verify after every milestone:** `npm install && npm test` is green, and
> `python3 -m http.server 8080` → open `http://localhost:8080` → zero console errors on load.
> You cannot run WebGPU inference headlessly — where a step needs a real browser run, say so in
> your report instead of claiming it works.

---

## 1. ARCHITECTURAL DECISIONS

**The current architecture is right and stays.** Static site (GitHub Pages) + one Cloudflare
Worker + in-browser WebLLM, plain ES modules, no framework, no bundler. At ~1,200 lines of
frontend JS a framework would add cost without benefit. This plan does **not** restructure —
it fixes five features that are silently broken in production, then deletes roughly a quarter
of the codebase that is dead or redundant.

Key decisions and why:

1. **Fix before beautify.** A code review found several features that *look* implemented but
   cannot work: the Worker never answers CORS preflight so every `POST /fetch` from the browser
   fails (evidence gathering and the URL-check feature silently do nothing); `main.js` reads
   `result.content` from a Worker that returns `result.text`; the second "Detect" click calls an
   undefined function `runPipeline`; BYO-key mode is dead on exactly the no-WebGPU browsers it
   was built for; and the claim checkboxes can verify the *wrong claims* because the UI sorts
   claims but the click handler indexes into the unsorted array. Milestone 1 fixes all of these
   with minimal diffs.

2. **One owner per screen region.** Today every renderer wipes `#app.innerHTML`, so the status
   spinner destroys the incremental verdict list on every update, and the Cancel button vanishes
   the moment the first status message arrives. The fix is two persistent regions inside `#app`
   — `#status` (spinner + message + cancel) and `#results` (everything else) — each written by
   exactly one set of functions. This removes the whole class of "renderer A erased renderer B"
   bugs with ~30 lines of change and no framework.

3. **One search path, not three.** The frontend currently tries `/search` JSON → DDG JSONP
   instant answers → legacy HTML-scrape through the Worker, and the DDG HTML parser exists in
   **three copies** (frontend, Worker, and pasted into a test). The Worker's `/search` already
   does Brave-with-DDG-fallback server-side, so the client fallbacks only duplicate it with
   worse results. Decision: the client calls `/search` and nothing else; the Worker keeps the
   single remaining DDG parser; the legacy HTML passthrough route is deleted. `search.js` drops
   from ~270 lines to ~60.

4. **No `window.*` glue.** Cross-module wiring via `window.resetApp` / inline `onclick` is
   replaced by one delegated click listener in `main.js` keyed on `data-action` attributes, and
   by explicit callbacks passed into `renderRemoteSettings`. The header stops being rewritten
   from JS — its static markup lives only in `index.html`.

5. **Tests must test the shipped code.** `test/search.test.js` currently tests a *copy* of the
   parser pasted into the test file, and the `ddg-lite.html` fixture is never read. After the
   consolidation in (3), the Worker exports its pure helpers and the tests import the real ones.

6. **Protect the Brave quota.** The free tier allows ~1 request/second and 2,000/month. Today up
   to 12 searches fire in parallel (most silently fall back to DDG after Brave 429s) and nothing
   is cached server-side. Client concurrency drops to 2 and the Worker caches `/search`
   responses via the Cache API.

Out of scope (do not build): frameworks/bundlers, embedding models, accounts/analytics,
automated LLM eval runners, PWA/offline, new features of any kind.

---

## 2. STEP-BY-STEP CHECKLISTS

### Milestone 0 — Repo hygiene (5 minutes, zero risk)

No code behavior changes. Can be one commit.

- [ ] **0.1** Untrack files that should never have been committed:
      `git rm --cached worker/.wrangler/cache/wrangler-account.json`
      `git rm -r --cached .kilo/plans` (the `.kilo/` ignore rule exists but these were committed earlier).
- [ ] **0.2** Append `.depwire/` to `.gitignore` (it currently shows as untracked noise).
- [ ] **0.3** Verify: `git status` shows no tracked files under `worker/.wrangler/` or `.kilo/`.

### Milestone 1 — Fix the five silently-broken features

Each item is an independent, minimal fix. One commit per item. After this milestone the app's
advertised features actually work.

- [ ] **1.1 Worker: answer CORS preflight** (`worker/search-proxy.js`).
      `POST /fetch` sends `Content-Type: application/json`, which triggers an `OPTIONS`
      preflight the Worker never handles — so **every browser call to `/fetch` fails CORS**,
      and evidence gathering + the URL-check feature silently do nothing.
      At the top of the `fetch(request, env)` router, before any route matching, add:
      ```js
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
          }
        });
      }
      ```
      Verify with `cd worker && npx wrangler dev`, then
      `curl -i -X OPTIONS http://localhost:8787/fetch -H "Origin: http://x" -H "Access-Control-Request-Method: POST"`
      → 204 with the three CORS headers. **Note in your report that the human must redeploy**
      (`npm run deploy:worker`) — do not deploy yourself.

- [ ] **1.2 Worker: page title is always empty** (`worker/search-proxy.js`, `handleFetch`).
      `extractTitle` is called on the *already tag-stripped* text, so `<title>` is long gone.
      Restructure: rename `extractTextStreaming` to `readBodyCapped(resp, maxChars)` and make it
      return the **raw** capped HTML string (delete the `extractText` call at its end). In
      `handleFetch` do:
      ```js
      const raw = await readBodyCapped(resp, maxChars);
      const title = extractTitle(raw);
      const text = extractText(raw, maxChars);
      ```
      Also set `truncated: text.endsWith('...')` in the response instead of the hardcoded `false`.

- [ ] **1.3 Frontend: URL-check feature reads the wrong field** (`js/main.js`,
      `runVerification`). The Worker returns `{ text, title, finalUrl }` but the code checks
      `result.content`, so `urlContent` is **always null**. Change both occurrences in the
      `if (targetUrl)` block from `result.content` to `result.text`.

- [ ] **1.4 Frontend: second Detect click crashes** (`js/main.js`, the `detectBtn` click
      handler). Line ~121 calls `await runPipeline(getInputText(), tier)` — **`runPipeline` does
      not exist**; any Detect click after a model is already loaded throws a ReferenceError.
      Delete the whole `const existing = getEngineInfo(); if (existing ...) {...}` block and let
      the handler fall through to `await loadAndRun()` unconditionally — `loadModel` already
      returns instantly when the requested model is loaded, so nothing re-downloads. Remove
      `getEngineInfo` from the import list in `main.js`.

- [ ] **1.5 Frontend: claim checkboxes can verify the wrong claims.**
      `renderClaimChecklist` (js/ui.js) sorts claims by importance and stamps
      `data-index` with the *sorted* position, but `setupChecklistListeners` (js/main.js) maps
      those indices back into the **unsorted** `extractedClaims` array — whenever the model
      returns claims in mixed importance order, the user verifies different claims than they
      checked. Fix by sorting exactly once, at the source:
      - In `js/pipeline.js` `extractClaims`, before returning the claims array, sort it:
        `const order = { high: 0, medium: 1, low: 2 };`
        `claims.sort((a, b) => (order[a.importance] ?? 2) - (order[b.importance] ?? 2));`
      - In `js/ui.js` `renderClaimChecklist`, delete the local `sorted` computation and render
        the `claims` array as given (keep the `importance !== 'low'` pre-check logic).

- [ ] **1.6 Frontend: BYO-key mode is dead on non-WebGPU browsers** (`js/main.js`, `js/ui.js`).
      `init()` reads the saved remote config but never calls `configureRemote`, so
      `checkGPUStatus()` returns `no_webgpu` on Safari/etc., renders the red error panel and
      **disables the Detect button** — locking out exactly the users BYO-key exists for. Also,
      saving a key in the settings panel doesn't clear an already-rendered GPU error.
      - In `init()` (js/main.js), as the first statement after `getRemoteConfig()`:
        `if (remoteConfig) configureRemote(remoteConfig);` — now `checkGPUStatus()` returns
        `'remote'` and the GPU gate is skipped.
      - In `js/ui.js` `showRemoteSettingsPanel`, after a successful Save (`configureRemote`
        called), and in the `clearRemoteBtn` handler after `useLocalEngine()`, call
        `location.reload()` so the app re-inits in the correct mode. Remove the bare
        `resetApp()` call from the clear handler (it only works via a window global today).

### Milestone 2 — UI regions: status and results stop fighting

This fixes two user-visible bugs — incremental verdicts being erased by every status update,
and the Cancel button disappearing during verification — and removes the `window.*` glue.
Depends on Milestone 1. Touches `index.html`, `js/ui.js`, `js/main.js` only.

- [ ] **2.1 Add persistent regions** (`index.html`). Replace
      `<div id="app" class="min-h-[200px]"></div>` with:
      ```html
      <div id="app" class="min-h-[200px]">
        <div id="status"></div>
        <div id="results"></div>
      </div>
      ```

- [ ] **2.2 Rewrite the status API** (`js/ui.js`). Replace `showLoading`, `showStatus`,
      `showCyclingStatus`, `hideLoading`, and the module-level interval with exactly two
      functions that own **only** `#status`:
      - `setStatus(messageOrMessages, { cancel = false } = {})` — if `#status` is empty, build
        the spinner block once (spinner div + `<p id="statusMessage">` + a Cancel button with
        `data-action="cancel"`, hidden unless `cancel`). If the block already exists, update
        only the message text and cancel-button visibility — **never** rebuild it. If passed an
        array, cycle through the messages on a 2.5 s interval (store the interval in a module
        variable; clear any previous interval first).
      - `clearStatus()` — clear the interval and empty `#status`.
      Keep `setLoadingText` working for the model loader (2.4).
- [ ] **2.3 Route renderers to the right region** (`js/main.js`, `js/ui.js`):
      - Everything that renders *content* — `renderGPUStatus`, `renderModelLoader`,
        `renderClaimChecklist`, `renderVerdictIncremental`, `renderResults`, `renderError` —
        writes to `document.getElementById('results')`. Simplest mechanical change: in
        `main.js`, replace the `appContainer` argument passed to those functions with a
        `resultsContainer` element; replace every `showStatus(appContainer, msg)` /
        `showCyclingStatus(...)` call with `setStatus(msg)` (no container argument).
      - In `runVerification` (js/main.js): statuses during search/evidence/verification call
        `setStatus(msg, { cancel: true })`. Verdict cards append into `#results` as they arrive
        (`renderVerdictIncremental` unchanged in spirit — but delete its "create wrapper if
        missing" fallback and have `runVerification` explicitly empty `#results` and create the
        `.verdict-list` wrapper before the loop). When verification finishes: `clearStatus()`
        then `renderResults(...)` (which rebuilds `#results` with header + all cards — that
        rebuild is fine, it happens once).
      - During claim extraction, call `setStatus(SNIFFING_MESSAGES)` (the array form — the long
        single inference is where cycling humor belongs).
- [ ] **2.4 Model loader owns its own text** (`js/ui.js` `renderModelLoader`, `js/main.js`
      `loadAndRun`). Delete the `showLoading(appContainer)` call in `loadAndRun` —
      `renderModelLoader` (rendered into `#results`) already contains a `#loadingMessage`
      element. Inside `renderModelLoader`, start a 3 s interval cycling `LOADING_MESSAGES`
      into `#loadingMessage`; `setLoadingText` (called by the download progress callback)
      stops that interval and takes over the element. Import `LOADING_MESSAGES` where needed.
- [ ] **2.5 Kill the window globals** (`js/main.js`, `js/ui.js`, `index.html`):
      - In `main.js` add one delegated listener:
        ```js
        document.addEventListener('click', (e) => {
          const action = e.target.closest('[data-action]')?.dataset.action;
          if (action === 'reset') resetApp();
          else if (action === 'cancel') cancelled = true;
        });
        ```
      - In `ui.js`, change every `onclick="window.resetApp()"` to `data-action="reset"` and the
        cancel button to `data-action="cancel"` (2.2 already does the latter).
      - Delete `window.resetApp`, `window.cancelVerification`, `window.configureRemote`,
        `window.useLocalEngine` assignments from `main.js`, and the
        `window.cancelVerification && ...` call in `ui.js`.
      - `renderRemoteSettings(remoteConfig, { onSave, onClear })`: `main.js` passes
        `onSave: (cfg) => { configureRemote(cfg); location.reload(); }` and
        `onClear: () => { useLocalEngine(); location.reload(); }`; `ui.js` calls these instead
        of `window.*`.
- [ ] **2.6 Stop rewriting the header** (`index.html`, `js/ui.js`). Move the settings button and
      an empty badge slot into the static header in `index.html`:
      ```html
      <span id="remoteBadge"></span>
      <button id="remoteSettingsBtn" class="text-xs text-amber-400 hover:text-amber-300 transition-colors mt-2 underline">⚙️ Use your own API key</button>
      ```
      `renderRemoteSettings` now only (a) fills `#remoteBadge` when remote is configured
      (keep the `escapeHtml` on the model name and the ✕ clear button) and (b) wires the two
      buttons. Delete the `existingHeader.innerHTML = ...` block entirely.
- [ ] **2.7 Reset stops destroying the user's text** (`js/main.js` `resetApp`). Do **not**
      clear `inputTextarea.value` or `inputUrl.value`. Clear `#status` and `#results`,
      re-enable the Detect button, reset `cancelled`. Additionally: re-enable the Detect
      button as soon as the claim checklist renders (end of `runWithModel` /
      `runPipelineRemote`), and disable it again at the top of `runVerification` — so a user
      can edit their text and re-detect without losing work.
- [ ] **2.8 Verify in a real browser** (or report as needing human verification): status text
      updates during verification while previously-rendered verdict cards stay visible, and the
      Cancel button remains clickable the whole time and produces the "stopped early" summary.

### Milestone 3 — Deletion sweep: one search path, no dead code

Depends on Milestone 2 (window globals already gone). The app must load cleanly after each step.

- [ ] **3.1 Collapse the search fallback chain** (`js/search.js`). Keep only: the
      `PROXY_PLACEHOLDER` guard, `fetchURL`, `performSearch` (now *only* calls
      `${SEARCH_PROXY_URL}/search?q=` and returns `data.results || []`; on any error return
      `[]`), and `performParallelSearches`. **Delete**: `searchViaJSONP`,
      `parseDDGApiResponse`, `extractTitleFromResult`, `stripTags`, `searchViaProxyHTML`,
      `parseProxyResults`, `parseDuckDuckGoLite`, `parseDuckDuckGoRegex`, `extractRealUrl`,
      and the `DUCK_EVOLVED_MESSAGE` import. The file should land at roughly 60 lines.
- [ ] **3.2 Delete the Worker's legacy HTML route** (`worker/search-proxy.js`). Remove
      `handleSearch` and make the router's final fallthrough
      `return json({ error: 'Not found' }, 404);`. (The only client of the legacy route was
      deleted in 3.1; the site and Worker deploy together.)
- [ ] **3.3 Delete dead frontend code** (verified unused by grep — re-verify before deleting):
      - `js/bandwidth.js` — entire file, imported nowhere.
      - `js/ui.js`: `unfreezeLoadingText`, `renderWebGPUWarning`, `renderWebGPUInfo`,
        `getScoreLabel`, `getRatingColor`, and the `SCORE_LABELS` import.
      - `js/llm.js`: `isModelLoading`, `waitForModel`, `isWebGPUSupported`, `getEngineInfo`,
        and the now-unused `loadProgressCallback` indirection if trivial to inline.
      - `js/constants.js`: `WEBSOCKET_WEBGPU_MESSAGE`, `SCORE_LABELS`, `DUCK_EVOLVED_MESSAGE`,
        and the `loadingLine` field on each `MODEL_TIERS` entry. Reword
        `CLAIM_NOT_FOUND_EXPLANATION` (it references "instant answers", which no longer exist):
        `'Web search came up empty for this one. The claim may be too niche, too new, or too made-up.'`
      - `js/scoring.js`: `calculateOverallRating` (app no longer uses it) **and its five tests**
        in `test/scoring.test.js`.
      - `package.json`: remove `jsdom` from devDependencies (no test uses it), run
        `npm install` to refresh the lockfile.
- [ ] **3.4 De-duplicate the results summary** (`js/ui.js` `renderResults`, `js/main.js`).
      `renderResults` currently ignores its `overallSmellRating` parameter and recomputes the
      summary from scratch. Change its signature to
      `renderResults(containerEl, verdicts, summary, stoppedEarly = false, totalClaims = null)`
      and use `summary.fresh/smelly/bullshit/total/bullshitPct/uncheckedPct` directly (delete
      the local recomputation). `main.js` passes the `summary` object it already gets from
      `verifyClaims`. Keep the label ladder inline as-is.
- [ ] **3.5 Fix the tier dropdown label** (`js/ui.js` `renderModelLoader`). The current
      `tier.modelId.split('-')[0]` renders Phi-3 as "Phi-2.5B" (reads like a different model).
      Replace the option text with:
      `` `${tier.label} (~${tier.sizeGB} GB) — ${tier.tagline}` ``
      and delete the hardcoded per-id `desc` ternary (`tagline` already exists in constants).
- [ ] **3.6 Small correctness fixes while passing through**:
      - `js/retrieval.js` `chunkText`: first line becomes `if (!text) return [];` then the
        existing `length <= chunkSize` single-chunk return.
      - `js/retrieval.js` `rankPassages`: hoist `avgDocLen` out of the per-document `map`
        (it is currently recomputed for every chunk — O(n²)).
      - `js/retrieval.js` `gatherEvidence`: host skipping currently does substring matching on
        the whole URL (`'x.com'` matches `xerox.com`). Replace with a hostname check:
        ```js
        function isSkippedHost(url) {
          try {
            const h = new URL(url).hostname.replace(/^www\./, '');
            return SKIP_HOSTS.includes(h);
          } catch { return true; }
        }
        ```
        and reduce `SKIP_HOSTS` to the bare domains
        `['youtube.com','facebook.com','twitter.com','x.com','instagram.com','tiktok.com','pinterest.com']`.
      - `js/llm.js` local inference: the `AbortController` there does nothing (the signal is
        never passed to WebLLM) — delete it, keep the `Promise.race` timeout, and inside the
        timeout branch call `try { engine.interruptGenerate(); } catch {}` so a timed-out
        generation doesn't keep burning the GPU and stalling the next claim.
      - `js/main.js`: `urlContent` is only used inside `runVerification` — make it a local
        `let` there and delete the module-level declaration; delete module-level
        `selectedTier` if, after 1.4, it is only ever written.
- [ ] **3.7** Run `npm test` and a browser smoke load; `node --check` every file in `js/` and
      `worker/` (CI does this too).

### Milestone 4 — Tests that test the shipped code

Depends on Milestone 3 (the parser now lives only in the Worker).

- [ ] **4.1 Export the Worker's pure helpers** (`worker/search-proxy.js`). Add at the bottom:
      `export { isPrivateIP, parseDuckDuckGoRegex, extractRealUrl, extractText, extractTitle };`
      (named exports alongside the default handler are valid for Workers and importable by Vitest).
- [ ] **4.2 Create `test/worker.test.js`** importing from `../worker/search-proxy.js`:
      - `parseDuckDuckGoRegex` against the **real fixture**: read
        `test/fixtures/ddg-lite.html` with `node:fs` `readFileSync`; assert >0 results, each
        with non-empty `title`, `url` starting with `http`, and non-empty `snippet`.
      - `extractRealUrl`: move the three existing cases (uddg decode, plain URL, `//` prefix)
        here from `test/search.test.js`.
      - `isPrivateIP`: true for `localhost`, `127.0.0.1`, `10.0.0.1`, `172.20.1.1`,
        `192.168.1.1`, `169.254.169.254`, `::1`, `foo.internal`; false for `example.com`,
        `8.8.8.8`.
      - `extractText`: strips `<script>`/`<style>` blocks and tags, decodes `&amp;`,
        collapses whitespace, appends `...` past `maxChars`.
      - `extractTitle`: pulls the title from raw HTML; empty string when absent.
- [ ] **4.3 Delete `test/search.test.js`.** Its `parseDuckDuckGoRegex` was a pasted **copy** of
      the function, not an import — it tested nothing. Everything worth keeping moved to 4.2,
      and the frontend functions it nominally covered were deleted in 3.1.
- [ ] **4.4 Add a `gatherEvidence` test** in `test/retrieval.test.js` with a stub
      `fetchURLFn`: (a) a snippet URL on a skipped host (`https://www.youtube.com/watch?v=x`)
      is never fetched; (b) a stub returning `{ text: '...long text containing the claim terms...', title: 'T' }`
      yields `passages` entries with `url`/`title`/`text`/`score`; (c) a stub that rejects
      yields `passages: []` without throwing.
- [ ] **4.5** `npm test` green; report the final test count.

### Milestone 5 — Quota protection and documentation truth

Independent of Milestone 4; depends on Milestone 3.

- [ ] **5.1 Client search concurrency** (`js/search.js` `performParallelSearches`). Replace the
      fire-all-at-once map with a pool of **2** concurrent searches (same inline batching
      pattern `main.js` uses in `gatherEvidenceBatched`: loop in slices of 2 with
      `Promise.allSettled`, calling `onProgress(done, total)` as each batch lands). Reason:
      Brave's free tier is ~1 request/second — 12 parallel calls today mean most quietly
      degrade to DDG.
- [ ] **5.2 Worker-side `/search` cache + rate limit** (`worker/search-proxy.js`):
      - Change the handler signature to `async fetch(request, env, ctx)` and pass `ctx` into
        `handleSearchJSON`.
      - In `handleSearchJSON`, before calling Brave: build
        `const cacheKey = new Request(new URL(`/search?q=${encodeURIComponent(q.toLowerCase().trim())}`, url.origin));`
        `const hit = await caches.default.match(cacheKey); if (hit) return hit;`
        After building a successful response `resp`:
        `ctx.waitUntil(caches.default.put(cacheKey, resp.clone())); return resp;`
        (the existing `Cache-Control: max-age=3600` header drives the TTL).
      - Apply the existing `checkRateLimit(ip)` (currently `/fetch`-only) to `/search` as well,
        returning the same 429 JSON.
      - Note in your report: **human must redeploy the Worker.**
- [ ] **5.3 Documentation truth pass**:
      - `index.html` footer: "No API keys, no servers, no bullshit" is no longer true (there is
        a Worker, and an optional BYO-key mode). Reword to:
        `"The AI runs in your browser — your text never touches our servers."` Also change
        "running Qwen2 / Phi-3" to "running Qwen2.5 / Phi-3".
      - `README.md`: in Troubleshooting, the "Searches return nothing" row should mention the
        30 req/min rate limit; confirm the FAQ search answer still matches reality (Brave →
        DDG fallback — it does; no change if so).
      - `worker/README.md`: add the `/search` cache behavior (1 h, per-query) and that rate
        limiting now covers both endpoints; document the removed legacy `?q=` route.
- [ ] **5.4** Full final pass: `npm test` green, browser smoke load clean, `git status` clean of
      junk. List anything requiring human action (Worker redeploy, real-browser WebGPU run per
      `docs/EVAL.md`).

---

## Known-but-deliberately-not-fixed (do not "improve" these)

- **SSRF DNS-rebinding** in `/fetch`: the hostname check can't resolve DNS first on Workers;
  Cloudflare's network blocks private-range egress anyway. Leave as-is.
- **In-memory rate limiter** resets on isolate recycle. Acceptable; do not add Durable Objects.
- **BM25 lexical ranking** in `retrieval.js` stays lexical. No embeddings.
- **Manual eval** (`docs/EVAL.md`) stays manual — WebGPU cannot run in CI.
- The humor/tone in user-facing strings is a feature. Keep it in any string you touch.

## Commit granularity

One commit per checklist item (or per closely-related pair), message format:
`M<milestone>.<item>: <short description>` — e.g. `M1.1: answer CORS preflight in worker`.
