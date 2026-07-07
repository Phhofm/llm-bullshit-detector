import { SEARCH_PROXY_URL, DUCK_EVOLVED_MESSAGE } from './constants.js';

const PROXY_PLACEHOLDER = 'REPLACE_WITH_YOUR_WORKER_URL';
const hasProxyConfigured = !SEARCH_PROXY_URL.includes(PROXY_PLACEHOLDER);

export async function fetchURL(url, maxChars = 50000) {
  if (!hasProxyConfigured) {
    throw new Error('URL fetching requires the search proxy to be deployed. Run: npx wrangler deploy');
  }

  const resp = await fetch(`${SEARCH_PROXY_URL}/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, maxChars })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(err.error || `Failed to fetch URL: HTTP ${resp.status}`);
  }

  return resp.json();
}

async function performSearch(query) {
  try {
    const results = await searchViaProxyJSON(query);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn('JSON search failed:', err.message);
  }

  try {
    const results = await searchViaJSONP(query);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn('JSONP search failed:', err.message);
  }

  try {
    const results = await searchViaProxyHTML(query);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn('HTML fallback search failed:', err.message);
  }

  return [];
}

async function searchViaProxyJSON(query) {
  const url = `${SEARCH_PROXY_URL}/search?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Search proxy returned ${resp.status}`);
  }

  const data = await resp.json();
  if (data.results) {
    return data.results;
  }
  throw new Error('No results from JSON search');
}

function searchViaJSONP(query) {
  return new Promise((resolve, reject) => {
    const callbackName = '_ddg' + Date.now() + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    const finish = (results) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(results);
    };

    window[callbackName] = (data) => {
      if (!data) {
        finish([]);
        return;
      }
      const results = parseDDGApiResponse(data);
      finish(results);
    };

    script.src = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&callback=${callbackName}`;
    script.onerror = () => {
      cleanup();
      finish([]);
    };

    document.head.appendChild(script);

    setTimeout(() => {
      cleanup();
      finish([]);
    }, 8000);
  });
}

function parseDDGApiResponse(data) {
  const results = [];

  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.Heading || extractTitleFromResult(data.Abstract),
      url: data.AbstractURL,
      snippet: stripTags(data.Abstract)
    });
  }

  const topics = data.RelatedTopics || [];
  for (const topic of topics) {
    if (!topic.FirstURL || !topic.Text) continue;
    results.push({
      title: extractTitleFromResult(topic.Result || ''),
      url: topic.FirstURL,
      snippet: stripTags(topic.Text)
    });
  }

  const webResults = data.Results || [];
  for (const r of webResults) {
    if (!r.FirstURL || !r.Text) continue;
    results.push({
      title: extractTitleFromResult(r.Result || ''),
      url: r.FirstURL,
      snippet: stripTags(r.Text)
    });
  }

  return results;
}

function extractTitleFromResult(html) {
  if (!html) return '';
  const match = html.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  if (match) return stripTags(match[1]);
  return stripTags(html);
}

function stripTags(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.innerHTML = str;
  return (div.textContent || '').trim().replace(/\s+/g, ' ');
}

async function searchViaProxyHTML(query) {
  const url = `${SEARCH_PROXY_URL}?q=${encodeURIComponent(query)}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Search proxy returned ${resp.status}`);
  }

  const html = await resp.text();
  if (!html || html.length < 100) {
    throw new Error('Search proxy returned empty or too short response');
  }

  return parseProxyResults(html);
}

function parseProxyResults(html) {
  try {
    const results = parseDuckDuckGoLite(html);
    if (results.length > 0) return results;
  } catch { /* fall through */ }

  try {
    return parseDuckDuckGoRegex(html);
  } catch {
    console.warn(DUCK_EVOLVED_MESSAGE);
    return [];
  }
}

export async function performParallelSearches(claims, onProgress) {
  const results = [];
  const promises = claims.map(async (claim, i) => {
    try {
      const snippets = await performSearch(claim.searchQuery);
      results[i] = { ...claim, snippets, error: null };
    } catch (err) {
      results[i] = { ...claim, snippets: [], error: err.message };
    }
    if (onProgress) onProgress(i + 1, claims.length);
  });

  await Promise.allSettled(promises);
  return results;
}

export function parseDuckDuckGoLite(html) {
  const results = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const rows = doc.querySelectorAll('tr');
  let currentResult = null;

  for (const row of rows) {
    const linkEl = row.querySelector('a.result-link');
    if (linkEl) {
      if (currentResult) results.push(currentResult);
      currentResult = {
        title: (linkEl.textContent || '').trim(),
        url: extractRealUrl(linkEl.getAttribute('href') || ''),
        snippet: ''
      };
      continue;
    }

    const snippetEl = row.querySelector('td.result-snippet');
    if (snippetEl && currentResult) {
      currentResult.snippet = (snippetEl.textContent || '').trim().replace(/\s+/g, ' ');
    }
  }

  if (currentResult) results.push(currentResult);
  return results;
}

export function parseDuckDuckGoRegex(html) {
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

export function extractRealUrl(href) {
  const uddgMatch = href.match(/uddg=([^&]*)/);
  if (uddgMatch) {
    try { return decodeURIComponent(uddgMatch[1]); } catch { return href; }
  }
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  return href;
}