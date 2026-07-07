export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/fetch' && request.method === 'POST') {
      return handleFetch(request, env);
    }

    if (url.pathname === '/search' && request.method === 'GET') {
      return handleSearchJSON(url, env);
    }

    // Legacy HTML passthrough for backward compat
    return handleSearch(url);
  }
};

function isPrivateIP(hostname) {
  if (!hostname) return false;
  
  const lower = hostname.toLowerCase();
  
  // Check for localhost and local/internal patterns
  if (lower === 'localhost' || lower.endsWith('.localhost') || 
      lower.endsWith('.internal') || lower.endsWith('.local')) {
    return true;
  }

  // Check for IP literals
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = lower.match(ipv4Pattern);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
  }
  
  // Check for IPv6 loopback/link-local
  if (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }
  
  return false;
}

const rateLimitStore = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const minuteAgo = now - 60000;
  
  const timestamps = rateLimitStore.get(ip) || [];
  const recent = timestamps.filter(t => t > minuteAgo);
  
  if (recent.length >= 30) {
    return false;
  }
  
  recent.push(now);
  rateLimitStore.set(ip, recent);
  return true;
}

async function handleSearchJSON(url, env) {
  const q = url.searchParams.get('q');
  if (!q) {
    return json({ error: 'Missing ?q= parameter' }, 400);
  }

  const cacheKey = `search:${q.toLowerCase().trim()}`;
  
  if (env.BRAVE_API_KEY) {
    try {
      const braveResp = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8`,
        {
          headers: {
            'X-Subscription-Token': env.BRAVE_API_KEY,
            'Accept': 'application/json'
          }
        }
      );

      if (braveResp.ok) {
        const data = await braveResp.json();
        const results = (data.web?.results || []).map(r => ({
          title: r.title || '',
          url: r.url || '',
          snippet: r.description || ''
        }));
        
        return json({ results, source: 'brave' }, 200, true);
      }
    } catch (err) {
      console.warn('Brave search failed:', err.message);
    }
  }

  // Fallback to DDG
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
    const results = parseDuckDuckGoRegex(html);
    
    return json({ results, source: 'ddg' }, 200, true);
  } catch (err) {
    return json({ error: 'Search request failed', detail: err.message }, 500);
  }
}

function parseDuckDuckGoRegex(html) {
  const results = [];
  const rows = html.split(/<tr[^>]*>/i);
  let currentTitle = '';
  let currentUrl = '';

  for (const row of rows) {
    const linkMatch = row.match(/<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      currentUrl = extractRealUrl(linkMatch[1]);
      currentTitle = linkMatch[2].replace(/<[^>]+>/g, '').trim();
      continue;
    }

    const snippetMatch = row.match(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i);
    if (snippetMatch && currentTitle) {
      results.push({
        title: currentTitle,
        url: currentUrl,
        snippet: snippetMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ')
      });
      currentTitle = '';
      currentUrl = '';
    }
  }

  return results;
}

function extractRealUrl(href) {
  const uddgMatch = href.match(/uddg=([^&]*)/);
  if (uddgMatch) {
    try { return decodeURIComponent(uddgMatch[1]); } catch { return href; }
  }
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  return href;
}

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

async function handleFetch(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return json({ error: 'Rate limit exceeded. Max 30 requests per minute.' }, 429);
  }

  let targetUrl;
  let maxChars = 100000;

  try {
    const body = await request.json();
    targetUrl = body.url;
    if (body.maxChars) maxChars = Math.min(body.maxChars, 100000);
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
    const parsedUrl = new URL(targetUrl);
    if (isPrivateIP(parsedUrl.hostname)) {
      return json({ error: 'Access to private/reserved addresses is not allowed' }, 403);
    }
  } catch {
    return json({ error: 'Invalid URL format' }, 400);
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'BullshitDetector/1.0 (+https://github.com/phhofm/llm-bullshit-detector)'
      },
      redirect: 'follow'
    });

    const finalUrl = resp.url;
    
    // Check redirect target too
    try {
      const parsedFinal = new URL(finalUrl);
      if (isPrivateIP(parsedFinal.hostname)) {
        return json({ error: 'Redirect to private/reserved address is not allowed' }, 403);
      }
    } catch {}

    const contentType = resp.headers.get('content-type') || '';

    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return json({
        error: `Unsupported content type: ${contentType}. Only HTML and plain text are supported.`
      }, 415);
    }

    const text = await extractTextStreaming(resp, maxChars);
    const title = extractTitle(text);

    return json({
      url: targetUrl,
      finalUrl: finalUrl,
      title: title,
      text: text,
      truncated: false,
      status: resp.status
    });
  } catch (err) {
    return json({ error: 'Failed to fetch URL', detail: err.message }, 500);
  }
}

async function extractTextStreaming(resp, maxChars) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    raw += chunk;
    total += chunk.length;
    
    if (total >= maxChars) {
      raw = raw.slice(0, maxChars);
      break;
    }
  }

  return extractText(raw, maxChars);
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

function json(data, status, cacheable) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      ...(cacheable ? { 'Cache-Control': 'public, max-age=3600' } : {})
    }
  });
}