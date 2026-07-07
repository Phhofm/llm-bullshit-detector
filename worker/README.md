# Search Proxy Worker

A Cloudflare Worker that proxies search requests and fetches web pages.

## Setup

1. Install dependencies:
   ```
   npm install -g wrangler
   ```

2. (Optional) Add a Brave Search API key for better search results:
   ```
   npx wrangler secret put BRAVE_API_KEY
   ```
   
   Get a free key from https://brave.com/search/api/ (Data for Search plan).

3. Deploy:
   ```
   npx wrangler deploy
   ```

## Endpoints

### GET /search?q=...

Returns JSON search results:
```json
{
  "results": [{"title": "...", "url": "...", "snippet": "..."}],
  "source": "brave" | "ddg"
}
```

If `BRAVE_API_KEY` is set, uses Brave Search API. Falls back to DuckDuckGo HTML scraping otherwise.

### POST /fetch

Fetches an arbitrary URL and returns extracted text.

Request body:
```json
{ "url": "https://example.com", "maxChars": 20000 }
```

Response:
```json
{
  "url": "https://example.com",
  "finalUrl": "https://example.com",
  "title": "Page Title",
  "text": "Extracted text content...",
  "truncated": false,
  "status": 200
}
```

## Security

- Blocks requests to private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, 0.x, ::1, fc00::/7)
- Blocks localhost, *.internal, *.local hostnames
- Rate limited to 30 requests per minute per IP
- Max response size capped at 100,000 characters