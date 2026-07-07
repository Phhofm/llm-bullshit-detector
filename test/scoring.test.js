import { test, expect } from 'vitest';
import { parseModelJson, parseStage3Response, calculateOverallRating, summarizeVerdicts, reportToMarkdown } from '../js/scoring.js';

test('parseModelJson: valid JSON', () => {
  const result = parseModelJson('{"claims": [{"claim": "test", "searchQuery": "test search"}]}', { claims: [] });
  expect(result).toEqual({ claims: [{ claim: 'test', searchQuery: 'test search' }] });
});

test('parseModelJson: JSON wrapped in json code fences', () => {
  const result = parseModelJson('```json\n{"claims": []}\n```', { claims: [] });
  expect(result).toEqual({ claims: [] });
});

test('parseModelJson: JSON with trailing commas', () => {
  const input = '{"claims": [{"claim": "test", "searchQuery": "query"}],}';
  const result = parseModelJson(input, { claims: [] });
  expect(result).toEqual({ claims: [{ claim: 'test', searchQuery: 'query' }] });
});

test('parseModelJson: complete garbage returns fallback', () => {
  const result = parseModelJson('not json at all', { claims: [] });
  expect(result).toEqual({ claims: [] });
});

test('parseModelJson: null response returns fallback', () => {
  const result = parseModelJson(null, { claims: [] });
  expect(result).toEqual({ claims: [] });
});

test('parseStage3Response: valid verdict passes through', () => {
  const item = {
    claim: 'The sky is blue',
    snippets: [{ title: 'Wiki', url: 'https://wiki', snippet: 'Sky info' }]
  };
  const result = parseStage3Response('{"claim": "The sky is blue", "rating": "Fresh", "explanation": "Confirmed", "sources": [{"title": "Wiki", "url": "https://wiki", "relevant": true}]}', item);
  expect(result.rating).toBe('Fresh');
  expect(result.claim).toBe('The sky is blue');
  expect(result.explanation).toBe('Confirmed');
});

test('parseStage3Response: invalid rating string becomes Smelly', () => {
  const item = {
    claim: 'Test claim',
    snippets: [{ title: 'Test', url: 'https://test', snippet: 'info' }]
  };
  const result = parseStage3Response('{"claim": "Test", "rating": "Invalid", "explanation": "test"}', item);
  expect(result.rating).toBe('Smelly');
});

test('parseStage3Response: missing explanation downgrades to Smelly', () => {
  const item = {
    claim: 'Test claim',
    snippets: [{ title: 'Wiki', url: 'https://wiki', snippet: 'info' }]
  };
  const result = parseStage3Response('{"claim": "Test", "rating": "Fresh", "sources": []}', item);
  expect(result.rating).toBe('Smelly');
  expect(result.explanation).toContain('downgraded');
});

test('parseStage3Response: missing sources uses fallback', () => {
  const item = {
    claim: 'Test claim',
    snippets: [{ title: 'Fallback', url: 'https://fallback', snippet: 'info' }]
  };
  const result = parseStage3Response('{"claim": "Test", "rating": "Fresh", "explanation": "test"}', item);
  expect(result.sources).toEqual([{ title: 'Fallback', url: 'https://fallback', relevant: false }]);
});

test('parseStage3Response: null response returns Smelly', () => {
  const item = {
    claim: 'Test claim',
    snippets: []
  };
  const result = parseStage3Response(null, item);
  expect(result.rating).toBe('Smelly');
});

test('calculateOverallRating: empty array returns 0', () => {
  expect(calculateOverallRating([])).toBe(0);
});

test('calculateOverallRating: all Fresh returns 0', () => {
  expect(calculateOverallRating([{ rating: 'Fresh' }, { rating: 'Fresh' }])).toBe(0);
});

test('calculateOverallRating: all Bullshit returns 100', () => {
  expect(calculateOverallRating([{ rating: 'Bullshit' }, { rating: 'Bullshit' }])).toBe(100);
});

test('calculateOverallRating: mixed cases', () => {
  const result = calculateOverallRating([
    { rating: 'Fresh' },
    { rating: 'Smelly' },
    { rating: 'Bullshit' }
  ]);
  expect(result).toBe(50);
});

test('calculateOverallRating: all Smelly returns 50', () => {
  expect(calculateOverallRating([{ rating: 'Smelly' }, { rating: 'Smelly' }])).toBe(50);
});

test('summarizeVerdicts: empty array', () => {
  const summary = summarizeVerdicts([]);
  expect(summary.fresh).toBe(0);
  expect(summary.smelly).toBe(0);
  expect(summary.bullshit).toBe(0);
  expect(summary.total).toBe(0);
  expect(summary.bullshitPct).toBe(0);
});

test('summarizeVerdicts: mixed verdicts', () => {
  const summary = summarizeVerdicts([
    { rating: 'Fresh' },
    { rating: 'Smelly' },
    { rating: 'Bullshit' }
  ]);
  expect(summary.fresh).toBe(1);
  expect(summary.smelly).toBe(1);
  expect(summary.bullshit).toBe(1);
  expect(summary.total).toBe(3);
  expect(summary.bullshitPct).toBe(33);
});

test('reportToMarkdown produces correct format', () => {
  const verdicts = [
    { claim: 'True claim', rating: 'Fresh', explanation: 'Confirmed', sources: [{ title: 'Wiki', url: 'https://wiki.test', relevant: true }] },
    { claim: 'False claim', rating: 'Bullshit', explanation: 'Contradicted', sources: [{ title: 'Fact', url: 'https://fact.test', relevant: true }] }
  ];
  const summary = { fresh: 1, smelly: 0, bullshit: 1, total: 2, bullshitPct: 50, uncheckedPct: 0 };
  const md = reportToMarkdown(verdicts, summary);
  
  expect(md).toContain('# Bullshit Report');
  expect(md).toContain('2 claims checked');
  expect(md).toContain('## 🔴 Bullshit');
  expect(md).toContain('## 🟢 Fresh');
  expect(md).toContain('False claim');
  expect(md).toContain('https://fact.test');
  expect(md).toContain('Generated by LLM Bullshit Detector');
});