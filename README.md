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

### Step 3: Choose detection depth

The first time you use it, you'll be asked to pick a model tier:

| Tier | Model Size | When to use |
|------|-----------|-------------|
| **Quick Sniff** | 0.5 GB | Fast checks, short texts, you're only mildly suspicious |
| **Deep Dive** | 1.5 GB | Longer texts, serious fact-checking |
| **Full Autopsy** | 2.5 GB | Dense research outputs, maximum thoroughness |

Models are cached after first download, so subsequent visits load instantly.

### Step 4: Select claims

The tool extracts verifiable factual claims automatically. Review them and select the ones you want to check. You can use **Select all** or **Deselect all**.

### Step 5: Hit "Sniff"

Click the button and watch the status updates. The tool will:
- Search the live internet for each claim
- Compare results against the claim text
- Give each claim a rating with an explanation and source links

### Step 6: Read the report

Each claim gets a verdict:
- 🟢 **Fresh** — credible sources confirm it
- 🟡 **Smelly** — sources are unclear, too weak, or don't address the claim
- 🔴 **Bullshit** — sources explicitly contradict the claim

At the top you'll see an overall "Bullshit %" score.

## Tips

- **Be patient on first visit**: The model downloads once (0.5–2.5 GB depending on tier) and is cached forever after that.
- **Desktop recommended**: Chrome or Edge on a desktop/laptop gives the best experience. Mobile works but is slower.
- **Internet required**: Search needs an active connection. The AI model itself runs entirely in your browser — no data leaves your device except search queries.

## FAQ

### Why does it take so long?

First-time use requires downloading a language model (0.5–2.5 GB). After that, everything runs locally in your browser. Claim extraction takes a few seconds per text, and verification depends on how many claims you select and your internet speed.

### Why does it say "Bullshit" for something that's actually true?

The tool is intentionally conservative. A claim is marked "Fresh" only when multiple credible sources clearly confirm it. If sources are weak, unclear, or missing, it falls back to "Smelly." This avoids false confidence.

### Does this send my data anywhere?

No. The language model runs 100% in your browser via WebGPU. The only external requests are search queries sent to the DuckDuckGo search proxy. Your pasted text never leaves your device.

### My browser says WebGPU isn't supported. What do I do?

Use **Chrome** (version 113+) or **Edge** (version 113+) on a desktop or laptop. Firefox supports WebGPU behind a flag (`about:config` → `dom.webgpu.enabled`), but it's experimental and may crash. Safari and mobile browsers are not supported.

### Can I use this on mobile?

Yes, but it's slower and may run out of memory on very large texts. Stick to "Quick Sniff" or "Deep Dive" on mobile.

### The search isn't returning results. Is it broken?

Make sure the search proxy is deployed (for site owners). If you're just a visitor and searches consistently fail, the proxy may be down. Try again later.

### Why is the overall score 100% Bullshit when some claims are Fresh?

The overall score is a simple average of individual claim ratings. If you selected mostly unverified claims, the score skews high. Try selecting fewer, more specific claims for a fairer score.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "WebGPU not available" | Switch to Chrome or Edge on a modern desktop/laptop |
| "No compatible GPU found" | Update your graphics drivers or try a different device |
| Model download stalls | Check your internet connection, refresh and try again |
| Verification fails / "model tripped over its own skepticism" | The model timed out or crashed. Try a smaller model tier ("Quick Sniff") or fewer claims |
| Searches return nothing | The DuckDuckGo API or proxy may be rate-limiting. Wait a minute and try again |
| Page looks broken | Make sure JavaScript is enabled and you're on a supported browser |

## Tech stack

- **Frontend**: Vanilla HTML/CSS/JS, Tailwind CSS
- **AI**: [WebLLM](https://github.com/MLC-AI/web-llm) — Qwen2 and Phi models running in-browser via WebGPU
- **Search**: DuckDuckGo via Cloudflare Worker proxy
- **Hosting**: GitHub Pages ($0)

## License

MIT
