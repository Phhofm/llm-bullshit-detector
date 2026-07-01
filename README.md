# LLM Bullshit Detector

A refreshingly honest tool to detect AI-generated bullshit. Paste the output you don't trust and we'll check it against the actual, live internet — right in your browser.

**Zero API keys. Zero accounts. Zero servers. Just your browser's GPU and a healthy dose of skepticism.**

## How it works

1. **You paste AI output** into the text box
2. **We extract factual claims** using a tiny language model running locally in your browser
3. **You pick which claims to verify** (all deselected by default — we don't trust anything either)
4. **We search the live internet** for evidence supporting or contradicting each claim
5. **You get a bullshit report** with color-coded ratings, explanations, and source URLs

Everything runs in your browser via WebGPU. The only backend is a 10-line Cloudflare Worker that proxies DuckDuckGo searches (because browsers can't call search engines directly, thanks to CORS).

## Setup

### 1. Deploy the search proxy (one command)

```bash
cd worker
npx wrangler deploy
```

Copy the URL you get (e.g., `https://bullshit-detector-search-proxy.your-username.workers.dev`).

### 2. Configure the proxy URL

Edit `js/constants.js` and replace the `SEARCH_PROXY_URL` with your deployed worker URL.

### 3. Deploy to GitHub Pages

Push to `main` and enable GitHub Pages in your repo settings. Or use any static hosting.

## Requirements for users

- A browser with WebGPU support (Chrome 113+, Edge 113+, Firefox Nightly)
- ~2-4 GB of free RAM
- Patience on first visit (model downloads once, then cached forever)

## Tech stack

- **Frontend**: Vanilla HTML/CSS/JS, Tailwind CSS (CDN)
- **LLM**: WebLLM (`@mlc-ai/web-llm`) — Qwen2 and Phi models running in-browser
- **Search**: DuckDuckGo Lite via Cloudflare Worker proxy
- **Hosting**: GitHub Pages ($0)

## License

MIT
