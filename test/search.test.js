import { test, expect } from 'vitest';
import { extractRealUrl } from '../js/search.js';

test('parseDuckDuckGoRegex: returns >0 results', () => {
  const ddgHtml = `<!DOCTYPE html>
<html><body>
<table>
<tr><td><a class="result-link" href="/lite/?q=test&amp;uddg=https%3A%2F%2Fen.wikipedia.org">Wikipedia</a></td></tr>
<tr><td class="result-snippet">This is a snippet about the topic.</td></tr>
</table>
</body></html>`;
  
  const results = parseDuckDuckGoRegex(ddgHtml);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0].title).toBe('Wikipedia');
  expect(results[0].url).toMatch(/^http/);
  expect(results[0].snippet).toBeTruthy();
});

test('extractRealUrl: decodes uddg= redirect URLs', () => {
  const url = extractRealUrl('/lite/?q=test&uddg=https%3A%2F%2Fexample.com%2Fpath');
  expect(url).toBe('https://example.com/path');
});

test('extractRealUrl: passes plain URLs through', () => {
  const url = extractRealUrl('https://example.com');
  expect(url).toBe('https://example.com');
});

test('extractRealUrl: handles // protocol-relative URLs', () => {
  const url = extractRealUrl('//example.com');
  expect(url).toBe('https://example.com');
});

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