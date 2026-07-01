# LLM Bullshit Detector — Implementation Plan

## Architecture Summary

```
User Browser (GitHub Pages static site)
├── WebLLM Engine (Qwen2 models, in-browser via WebGPU)
│   ├── Stage 1: Extract factual claims + generate search queries
│   └── Stage 3: Compare claims vs search snippets → Bullshit Rating
├── Cloudflare Worker (CORS proxy → DuckDuckGo HTML scrape)
│   └── Stage 2: POST /search → DuckDuckGo lite → parse HTML → JSON
└── UI Layer (Tailwind CSS, vanilla JS)
    ├── Text input → claim extraction → checklist → results
    └── Bandwidth detection → model tier recommendation
```

**Zero API keys. Zero user accounts. Zero backend costs.** Everything runs in the user's browser except the 10-line search proxy.

## File Structure

```
llm-bullshit-detector/
├── index.html                 # Single-page app entry point
├── css/
│   └── style.css              # Tailwind-styled cynical UI (or inline Tailwind CDN)
├── js/
│   ├── main.js                # App init, UI orchestration, event handling
│   ├── llm.js                 # WebLLM engine wrapper, model loading, inference
│   ├── search.js              # Search proxy calls, DuckDuckGo HTML parsing
│   ├── pipeline.js            # 3-stage verification orchestration
│   ├── prompts.js             # Cynical system prompts for Stage 1 & Stage 3
│   ├── ui.js                  # Loading states, cynical messages, results rendering
│   └── bandwidth.js           # Bandwidth detection + model tier recommendation
├── worker/
│   ├── search-proxy.js        # Cloudflare Worker (DuckDuckGo proxy)
│   └── wrangler.toml          # Cloudflare Worker config
├── _config.yml                # GitHub Pages config
└── README.md                  # Setup instructions
```

## Data Flow

### Step-by-step pipeline

1. **User pastes text** into textarea → clicks "Detect Bullshit"
2. **Bandwidth check** (cached from page load) → model tier auto-selected based on connection speed
3. **Model loading** (if first visit) → cynical progress messages cycle while model downloads
4. **Stage 1: Claim Extraction** → WebLLM call with Stage 1 system prompt → returns JSON array of `{claim, searchQuery}` objects
5. **Claim checklist** → extracted claims displayed as checkbox list (all deselected by default). Time estimate updates as user checks claims. Button: "Sniff N claims (~Xs)"
6. **Stage 2: Parallel Search** → each selected claim's `searchQuery` sent to CF Worker proxy → parallel `fetch()` calls → parsed into `{title, url, snippet}[]` arrays
7. **Stage 3: Bullshit Verification** → each claim + its search results sent to WebLLM with Stage 3 system prompt → returns JSON with `{claim, rating, verdict, sources}`
8. **Results display** → color-coded cards (green/yellow/red) with overall Smell Rating percentage, inline source URLs

### Timeline (typical paragraph, 5 claims, all selected)
| Stage | Time |
|---|---|
| Model download (first visit, 1.5B model, 25Mbps) | ~8 min |
| Model download (subsequent visits) | 0s (cached) |
| Stage 1 — claim extraction | 3-5s |
| Stage 2 — parallel search | 1-2s |
| Stage 3 — verification | 5-10s |
| **Total (after first visit)** | **~10-17s** |

## Model Strategy

### Three tiers, bandwidth-aware

| Tier | Model | Size | Good for | When to show |
|---|---|---|---|---|
| Quick Sniff | Qwen2-0.5B-Instruct | ~1GB | Basic smell check | Slow connections (<5 Mbps) |
| Deep Dive | Qwen2-1.5B-Instruct | ~3GB | Solid verification | Medium connections (5-25 Mbps) |
| Full Autopsy | Phi-3.5-mini-instruct | ~4.5GB | Destroying credibility | Fast connections (25+ Mbps) |

**Bandwidth detection flow:**
1. On page load, fetch a ~100KB test blob from CDN, measure transfer time
2. Calculate Mbps, cache result in `sessionStorage`
3. Show estimated download times for each tier with cynical labels
4. Pre-select the recommended tier, user can override
5. If WebGPU unavailable: all tiers disabled, show "Your browser's GPU situation is... unfortunate."

**WebLLM model IDs (MLC format):**
- Qwen2-0.5B: `Qwen2-0.5B-Instruct-q4f16_1-MLC`
- Qwen2-1.5B: `Qwen2-1.5B-Instruct-q4f16_1-MLC`  
- Phi-3.5-mini: `Phi-3.5-mini-instruct-q4f16_1-MLC`

*Verify exact MLC model IDs against WebLLM's model registry at implementation time.*

## Stage 1: Claim Extraction Prompt

**System prompt:**

```
You are a cynical claim extractor. Your job is to read AI-generated text and pull out every standalone factual assertion, no matter how small or confidently stated.

Rules:
- Extract ONLY claims that can be verified against real-world data (dates, numbers, names, events, statistics, technical facts).
- Ignore opinions, speculation language ("might", "could", "potentially"), and purely stylistic statements.
- For each claim, generate a highly specific web search query that would find the ground truth. The query should be short, keyword-dense, and include version numbers or dates if present.
- If the text contains no verifiable claims, return an empty array. Do not invent claims.
- Be suspicious of vague numbers like "many", "several", "most" — these are not verifiable.
- Return ONLY valid JSON matching this exact schema. No markdown, no commentary, no "Here's the JSON" preamble.

Schema:
{
  "claims": [
    {
      "claim": "exact factual statement from the text",
      "searchQuery": "specific search keywords to verify this"
    }
  ]
}
```

**Example input:**
"Python 3.13 introduced a new JIT compiler that makes it 40% faster than 3.12. The release happened in October 2024 and was overseen by the Python Steering Council which has 5 members."

**Example output:**
```json
{
  "claims": [
    {"claim": "Python 3.13 introduced a new JIT compiler", "searchQuery": "Python 3.13 JIT compiler new feature"},
    {"claim": "Python 3.13 is 40% faster than Python 3.12", "searchQuery": "Python 3.13 performance benchmark vs 3.12 speed improvement"},
    {"claim": "Python 3.13 was released in October 2024", "searchQuery": "Python 3.13 release date October 2024"},
    {"claim": "The Python Steering Council has 5 members", "searchQuery": "Python Steering Council members number"}
  ]
}
```

## Stage 2: Search Implementation

### Cloudflare Worker (`worker/search-proxy.js`)

```js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');
    if (!q) return new Response('Missing ?q=', { status: 400 });

    // Fetch DuckDuckGo Lite HTML (lightweight, no JS, stable format)
    const ddgResp = await fetch(
      `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'BullshitDetector/1.0' } }
    );
    const html = await ddgResp.text();

    return new Response(html, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  }
};
```

### Browser-side HTML parser (`js/search.js`)

Parse DDG Lite HTML:
- Each result is a `<tr>` with class `result-snippet`
- Title: inside `<a>` tag with class `result-link`
- URL: `href` attribute of the title link (may be a DDG redirect — extract real URL from `uddg=` param)
- Snippet: inside `<td>` with class `result-snippet`

Return array: `[{ title, url, snippet }]`

**Edge cases:**
- DDG blocks/rate-limits → return partial results, show "DuckDuckGo is being difficult. Try again in a moment."
- DDG changes HTML structure → parser falls back to regex, then shows "Search results format changed. The duck has evolved."
- No results found → return empty array, claim gets "Smelly Bullshit" rating
- Proxy down → frontend shows "The search proxy appears to be on vacation. Probably deserved."

### Worker deployment

The CF Worker URL is a config constant in `js/search.js`:
```js
const SEARCH_PROXY_URL = 'https://your-worker.workers.dev';
```

Deploy with: `npx wrangler deploy` (from `worker/` directory)

## Stage 3: Bullshit Verification Prompt

**System prompt:**

```
You are a ruthless, skeptical fact-checker. Your sole purpose is to compare claims against live web search results and deliver an honest, occasionally funny verdict. You are the final line of defense against confident-sounding nonsense.

Rules:
1. Compare the claim STRICTLY against the provided search snippets. If the snippets don't address the claim, say so — do not use your own knowledge.
2. Credible sources: established news sites, official documentation, .gov/.edu domains, Wikipedia (with caution), reputable tech publications, company press releases.  
3. Weak sources: random blog posts, forum threads, Reddit comments, tweets, Medium articles by unknown authors, Quora answers. These can support a claim but never fully verify it.
4. If multiple credible sources agree with the claim → "0% Bullshit"
5. If multiple credible sources directly contradict the claim → "100% Bullshit"
6. If sources are weak, contradictory, or don't address the claim → "Smelly Bullshit"
7. If no search results were provided at all → "Smelly Bullshit"
8. Pay attention to subtle distinctions: "Python 3.13 is faster" vs "Python 3.13 is 40% faster". The first is vague, the second is a specific claim that requires specific evidence.
9. If the claim contains a specific number, percentage, or date, the sources must explicitly confirm that EXACT value. Close doesn't count. "About 40%" is not "40%".
10. NEVER invent or hallucinate URLs. Only cite URLs that actually appear in the provided search snippets.
11. Return ONLY valid JSON matching the schema below. No markdown, no commentary, no "Here's the JSON" preamble.

Schema:
{
  "verdicts": [
    {
      "claim": "the claim being verified",
      "rating": "0% Bullshit" | "100% Bullshit" | "Smelly Bullshit",
      "explanation": "One-sentence, slightly witty explanation of the verdict. Be specific about what the sources did or didn't confirm. Never bitter — be funny.",
      "sources": [
        { "title": "Source page title", "url": "https://...", "relevant": true|false }
      ]
    }
  ],
  "overallSmellRating": 0-100
}
```

**Example verdict:**
```json
{
  "verdicts": [
    {
      "claim": "Python 3.13 was released in October 2024",
      "rating": "0% Bullshit",
      "explanation": "Multiple sources confirm the October 7, 2024 release date. Python's own docs, several tech outlets, and even Wikipedia agree — which almost never happens.",
      "sources": [
        {"title": "Python 3.13.0 documentation", "url": "https://docs.python.org/3/whatsnew/3.13.html", "relevant": true},
        {"title": "Python Insider: Python 3.13.0 is now available", "url": "https://pythoninsider.blogspot.com/2024/10/python-3130-is-now-available.html", "relevant": true}
      ]
    }
  ],
  "overallSmellRating": 0
}
```

## Cynical UI Copy (funny, never bitter)

### Loading messages (cycled during model download and verification)

```
"Loading messages": [
  "Downloading a tiny brain. It's not much, but it's honest work.",
  "Our bullshit detector is smaller than most intern's attention spans.",
  "Loading the world's most skeptical language model.",
  "This model has trust issues. You'll like it.",
  "Teaching a 0.5B parameter model to be suspicious. It's a fast learner.",
  "Calibrating cynicism levels...",
  "The model is judging your input already. It's not impressed.",
  "Loading. Go ahead, doubt this progress bar. The model would.",
  "Downloading. Size: approximately 500 million 'I don't know' parameters.",
  "This download is still faster than an LLM realizing it hallucinated.",
  "The model weighs less than a AAA game's day-one patch.",
  "If this takes too long, your internet is the problem, not us.",
  "Still loading. The model is already skeptical of your connection speed."
]
```

### Verification status messages

```
"Isolating confident-sounding lies...",
"Separating facts from vibes...",
"Checking the actual, live internet (not the cached one)...",
"Sniffing out the hallucinations...",
"Comparing claims against reality...",
"Asking DuckDuckGo what it thinks...",
"Cross-referencing with sources that actually exist...",
"The model found something suspicious. Investigating...",
"One of these claims smells funny. The model agrees.",
"Compiling your bullshit report. It's... not great."
]
```

### No WebGPU message

```
"Your browser doesn't support WebGPU, which means it can't run language models locally. This isn't your fault — your hardware just wasn't invited to the AI party. Try Chrome, Edge, or Firefox on a device manufactured in the last 5 years."
```

### No claims found

```
"This text contains zero verifiable claims. It's either an opinion piece, poetry, or the most carefully worded corporate statement we've ever seen. Either way, nothing to fact-check here."
```

### All claims clean

```
"Surprisingly, everything checks out. The AI output appears to be... actually correct? We're as shocked as you are. Maybe buy a lottery ticket today."
```

### Error messages

```
Model load failed: "Couldn't load the detection model. Your browser might be out of memory, or the model hosting service is down. Try refreshing, or try a smaller model tier."

Search proxy down: "The search proxy appears to be on vacation. Probably deserved. Try again later."

DuckDuckGo parsing failed: "DuckDuckGo changed their HTML again. The duck has evolved beyond our parser. We'll adapt. Eventually."

Generic error: "Something went wrong. The bullshit remains undetected. For now."
```

## Claim Checklist UX

1. After Stage 1, claims appear in a vertical list
2. Each claim has a checkbox (deselected by default) and the claim text
3. Estimated time updates dynamically as claims are checked/unchecked
4. Button text: "Sniff N claims (~Xs)" — disabled when N=0
5. When 0 claims: "Select claims to sniff" (disabled)
6. "Select all" and "Deselect all" links at top
7. Each claim shows its auto-generated search query in a smaller, muted font below

## Results Display

1. **Overall Smell Rating** at top: large percentage with color (green <30%, yellow 30-70%, red >70%)
2. Cynical one-liner based on score:
   - 0-10%: "Suspiciously accurate. Almost too accurate..."
   - 11-30%: "Mostly fresh. A slight whiff of bullshit."
   - 31-60%: "Something definitely smells in here."
   - 61-90%: "Strong bullshit odor detected. Open a window."
   - 91-100%: "This text is 100% organic, free-range bullshit."
3. Individual claim cards below, color-coded:
   - Green (#10B981 bg): "0% Bullshit"
   - Yellow (#F59E0B bg): "Smelly Bullshit"  
   - Red (#EF4444 bg): "100% Bullshit"
4. Each card shows: claim text, rating badge, one-line explanation, source links
5. Sources are clickable, open in new tab

## Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| No WebGPU | Detect via `navigator.gpu`, disable all model buttons, show explanation message |
| WebGPU but insufficient VRAM | Catch WebLLM load error, suggest smaller model tier |
| Model download fails mid-way | Show retry button, suggest smaller tier, cache partial progress |
| Claim extraction returns `[]` | Show "no verifiable claims" message with witty explanation |
| Search returns 0 results for a claim | Claim gets "Smelly Bullshit" with explanation: "The internet has no opinion on this. Suspicious." |
| Search proxy returns 5xx | Retry 2x, then show "proxy on vacation" error |
| DuckDuckGo HTML parsing fails | Try regex fallback parser, then show "duck evolved" error |
| Stage 3 LLM returns malformed JSON | Retry with stricter prompt, then show partial results |
| User checks 0 claims and clicks button | Button stays disabled, shows "Select at least one claim to sniff" |
| User pastes empty text | Show "Paste something first. We can't detect bullshit in a vacuum." |
| Text exceeds context window | Truncate to ~2000 chars, show note: "Your text was too long. We analyzed the first 2000 characters. The rest remains suspicious." |
| User on mobile without WebGPU | Show mobile-specific message: "Mobile WebGPU support is limited. Try on desktop for the full experience." |

## Implementation Order

### Phase 1: Static shell + proxy
1. Create `index.html` with Tailwind CDN, textarea, button, results container
2. Write `worker/search-proxy.js` + `worker/wrangler.toml`
3. Write `js/search.js` — DuckDuckGo lite HTML parser
4. Test: button click → fetches proxy → parses HTML → logs search results

### Phase 2: WebLLM integration
1. Write `js/llm.js` — WebLLM init, model loading, `createCompletion()` wrapper
2. Write `js/bandwidth.js` — speed test + tier recommendation
3. Write `js/prompts.js` — Stage 1 and Stage 3 system prompts
4. Test: model loads → Stage 1 call with test text → logs extracted claims

### Phase 3: Pipeline + UI
1. Write `js/pipeline.js` — orchestrate stages, handle claim checklist
2. Write `js/ui.js` — loading messages, checklist rendering, results display
3. Write `js/main.js` — wire everything together
4. Test: full flow from paste to results

### Phase 4: Polish
1. Cynical loading message cycler
2. Error states and fallbacks
3. Mobile responsive layout
4. README with setup instructions

## Technology Choices

| Concern | Choice | Reason |
|---|---|---|
| CSS | Tailwind CSS (CDN) | No build step, fast, familiar |
| JS framework | Vanilla JS (ES modules) | No build step, small payload |
| WebLLM | `@mlc-ai/web-llm` (CDN) | In-browser LLM, OpenAI-compatible API |
| Search proxy | Cloudflare Workers | Free tier, 100k req/day, global edge |
| Search engine | DuckDuckGo Lite HTML | Stable format, no API key, no rate limits |
| Hosting | GitHub Pages | Free, static sites, custom domain support |

## Open Questions (resolve during implementation)

1. **Exact MLC model IDs**: Verify against WebLLM's model registry. Model IDs may have changed.
2. **Qwen2-0.5B JSON reliability**: Test whether the smallest model can reliably output structured JSON. If not, use 1.5B as minimum.
3. **DuckDuckGo Lite HTML stability**: The parser needs real-world testing against DDG's current HTML structure.
4. **CF Worker rate limiting**: If the tool gets popular, the 100k/day free tier might not suffice. Plan for upgrade path.
