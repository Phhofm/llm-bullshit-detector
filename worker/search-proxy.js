export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/fetch' && request.method === 'POST') {
      return handleFetch(request);
    }

    return handleSearch(url);
  }
};

async function handleSearch(url) {
  const q = url.searchParams.get('q');
  if (!q) {
    return json({ error: 'Missing ?q= parameter' }, 400);
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
      return json({ error: `DuckDuckGo returned ${ddgResp.status}` }, 502);
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
    return json({ error: 'Search request failed', detail: err.message }, 500);
  }
}

async function handleFetch(request) {
  let targetUrl;
  let maxChars = 50000;

  try {
    const body = await request.json();
    targetUrl = body.url;
    if (body.maxChars) maxChars = body.maxChars;
  } catch {
    return json({ error: 'Invalid JSON body. Send { "url": "https://..." }' }, 400);
  }

  if (!targetUrl) {
    return json({ error: 'Missing "url" in request body' }, 400);
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return json({ error: 'URL must start with http:// or https://' }, 400);
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'BullshitDetector/1.0 (+https://github.com/phhofm/llm-bullshit-detector)'
      },
      redirect: 'follow'
    });

    const contentType = resp.headers.get('content-type') || '';

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return json({
        error: `Unsupported content type: ${contentType}. Only HTML and plain text are supported.`
      }, 415);
    }

    const raw = await resp.text();

    const text = extractText(raw, maxChars);
    const title = extractTitle(raw);

    return json({
      url: targetUrl,
      finalUrl: resp.url,
      title: title,
      content: text,
      truncated: raw.length > maxChars,
      status: resp.status
    });
  } catch (err) {
    return json({ error: 'Failed to fetch URL', detail: err.message }, 500);
  }
}

function extractText(html, maxChars) {
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<\/?(?:div|span|p|br|hr|ul|ol|li|table|tr|td|th|thead|tbody|tfoot|h[1-6]|blockquote|pre|code|a|strong|em|b|i|u|s|small|sub|sup|abbr|acronym|cite|q|dfn|kbd|samp|var|time|mark|ruby|rt|rp|bdi|bdo|wbr|ins|del|details|summary|dialog|figure|figcaption|main|article|section|aside|header|footer|nav|address|fieldset|legend|form|label|input|button|select|textarea|option|optgroup|datalist|output|progress|meter|canvas|svg|math|iframe|embed|object|param|video|audio|source|track|map|area)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (stripped.length <= maxChars) return stripped;
  return stripped.slice(0, maxChars) + '...';
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    }
  });
}
