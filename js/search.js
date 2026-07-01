import { SEARCH_PROXY_URL, DUCK_EVOLVED_MESSAGE } from './constants.js';

async function performSearch(query) {
  try {
    const url = `${SEARCH_PROXY_URL}?q=${encodeURIComponent(query)}`;
    const resp = await fetch(url);

    if (!resp.ok) {
      throw new Error(`Search proxy returned ${resp.status}`);
    }

    const html = await resp.text();
    return parseSearchResults(html);
  } catch (err) {
    console.warn('Search failed:', err.message);
    throw err;
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

function parseSearchResults(html) {
  try {
    const results = parseDuckDuckGoLite(html);
    if (results.length > 0) return results;
  } catch {
    // fall through to regex parser
  }

  try {
    return parseDuckDuckGoRegex(html);
  } catch {
    console.warn(DUCK_EVOLVED_MESSAGE);
    return [];
  }
}

function parseDuckDuckGoLite(html) {
  const results = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const rows = doc.querySelectorAll('tr');
  let currentResult = null;

  for (const row of rows) {
    const linkEl = row.querySelector('a.result-link');
    if (linkEl) {
      if (currentResult) {
        results.push(currentResult);
      }
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

  if (currentResult) {
    results.push(currentResult);
  }

  return results;
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
    try {
      return decodeURIComponent(uddgMatch[1]);
    } catch {
      return href;
    }
  }

  if (href.startsWith('http')) {
    return href;
  }

  if (href.startsWith('//')) {
    return 'https:' + href;
  }

  return href;
}
