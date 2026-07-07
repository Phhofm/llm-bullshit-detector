# LLM Bullshit Detector

Paste AI-generated text you don't trust. This tool extracts factual claims, searches the live internet, and tells you whether each claim holds up — or if the AI was confidently making things up.

## Why this exists

Large language models are remarkably fluent. They write with confidence, cite details, and sound authoritative — even when they're completely wrong. This tool exists because AI hallucinations are easy to miss, and blindly trusting AI output can lead to bad decisions, embarrassing mistakes, or worse.

The Bullshit Detector doesn't rely on the AI's own knowledge. It actually searches the web and compares claims against real sources, right in your browser.

## What it does

1. You paste AI-generated text
2. A small language model running in your browser extracts factual claims
3. You pick which claims to verify
4. It searches the live internet for evidence
5. You get a color-coded report: **Fresh**, **Smelly**, or **Bullshit**

## How to use it

### Step 1: Open the site

Go to the GitHub Pages URL for this repository. No downloads, no sign-ups.

### Step 2: Paste text

Paste any AI-generated output into the text box. You can optionally provide a URL if the AI made a claim about a specific web page.

### Step 3: Choose model (optional)

The tool offers three model tiers:

- **Quick Sniff** (0.5B) — Fast but less reliable. Good for quick checks.
- **Deep Dive** (1.5B, default) — Best balance of speed and accurate reasoning. Recommended for most people.
- **Full Autopsy** (Phi-3-mini, 2.5 GB) — Most thorough and reliable reasoning. Slower and heavier on memory.

Models are cached after first download, so subsequent visits load instantly.

### Step 4: Select claims

The tool extracts verifiable factual claims automatically. Claims are sorted by importance (high/medium/low) and pre-checked for high/medium importance. Review and adjust your selection.

### Step 5: Hit "Sniff"

Click the button and watch the status updates. The tool will:
- Search the live internet for each claim
- Fetch the top sources for deeper evidence (when proxy is configured)
- Compare results against the claim text
- Give each claim a rating with an explanation and source links

### Step 6: Read the report

Each claim gets a verdict:
- 🟢 **Fresh** — credible sources confirm it
- 🟡 **Smelly** — sources are unclear, too weak, or don't address the claim
- 🔴 **Bullshit** — sources explicitly contradict the claim

The report shows a breakdown with counts and a stacked bar: the "Bullshit %" only counts contradicted claims; unverified claims are tracked separately. You can copy the report as Markdown using the button below.

## Tips

- **Be patient on first visit**: The default model downloads once (~1.5 GB) and is cached forever after that.
- **Desktop recommended**: Chrome or Edge on a desktop/laptop gives the best experience. Mobile works but is slower.
- **Internet required**: Search needs an active connection. The AI model itself runs entirely in your browser — no data leaves your device except search queries.

## FAQ

### Why does it take so long?

First-time use requires downloading the default language model (~1.5 GB). After that, everything runs locally in your browser. Claim extraction takes a few seconds per text, and verification depends on how many claims you select and your internet speed.

### Why does it say "Bullshit" for something that's actually true?

The tool is intentionally conservative. A claim is marked "Fresh" only when multiple credible sources clearly confirm it. If sources are weak, unclear, or missing, it falls back to "Smelly." This avoids false confidence.

### Does this send my data anywhere?

In local mode, the language model runs 100% in your browser via WebGPU. Only search queries and fetched source URLs go through the proxy. Your pasted text never leaves your device.

In BYO-key mode (when configured), your pasted text is sent to the chosen provider. See the "Use your own API key" section for details.

### My browser says WebGPU isn't supported. What do I do?

Use **Chrome** (version 113+) or **Edge** (version 113+) on a desktop or laptop. Firefox supports WebGPU behind a flag (`about:config` → `dom.webgpu.enabled`), but it's experimental and may crash. Safari and mobile browsers are not supported.

### No WebGPU? Bring your own key

If WebGPU isn't available, click "⚙️ Use your own API key" to use any OpenAI-compatible endpoint. Your key is stored only in your browser and sent only to the provider you choose.

### Can I use this on mobile?

Yes, but it's slower and may run out of memory on very large texts. The default 1.5B model should work on most modern phones with 4+ GB RAM (e.g. Galaxy S9 and newer).

### The search isn't returning results. Is it broken?

Make sure the search proxy is deployed (for site owners). The proxy now uses Brave Search API when configured, falling back to DuckDuckGo. If you're just a visitor and searches consistently fail, the proxy may be down. Try again later.

### Why is the score only counting some claims?

The "Bullshit %" only counts contradicted claims. Unverifiable claims ("Smelly") are tracked separately as "unverified". This gives a more honest assessment: if search simply couldn't find evidence, that's not the same as the claim being false.

### Why does the app downgrade "Fresh" to "Smelly" sometimes?

Some very small models produce verdicts without writing an explanation. The app treats that as low-confidence and downgrades the rating. Using the default Deep Dive model avoids this.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "WebGPU not available" | Switch to Chrome or Edge on a modern desktop/laptop |
| "No compatible GPU found" | Update your graphics drivers or try a different device |
| Model download stalls | Check your internet connection, refresh and try again |
| Verification fails / timeout | The model timed out. Try switching to a lighter model via the dropdown, or select fewer claims |
| Searches return nothing | The search API or proxy may be rate-limiting. Wait a minute and try again |
| Page looks broken | Make sure JavaScript is enabled and you're on a supported browser |

## Tech stack

- **Frontend**: Vanilla HTML/CSS/JS, Tailwind CSS
- **AI**: [WebLLM](https://github.com/mlc-ai/web-llm) — Qwen2.5-1.5B (default), Qwen2.5-0.5B (quick), and Phi-3-mini, running in-browser via WebGPU
- **Search**: Brave Search API (preferred) with DuckDuckGo fallback via Cloudflare Worker proxy
- **Hosting**: GitHub Pages ($0)

## License

MIT