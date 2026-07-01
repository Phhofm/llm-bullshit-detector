export default {
  async fetch(request) {
    const url = new URL(request.url);
    const q = url.searchParams.get('q');

    if (!q) {
      return new Response(
        JSON.stringify({ error: 'Missing ?q= parameter' }),
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          }
        }
      );
    }

    try {
      const ddgResp = await fetch(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
        {
          headers: {
            'User-Agent': 'BullshitDetector/1.0 (+https://github.com/phhofm/llm-bullshit-detector)'
          }
        }
      );

      if (!ddgResp.ok) {
        return new Response(
          JSON.stringify({ error: `DuckDuckGo returned ${ddgResp.status}` }),
          {
            status: 502,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            }
          }
        );
      }

      const html = await ddgResp.text();

      return new Response(html, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=30'
        }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Search request failed', detail: err.message }),
        {
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          }
        }
      );
    }
  }
};
