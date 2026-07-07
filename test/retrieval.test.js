import { test, expect } from 'vitest';
import { chunkText, rankPassages } from '../js/retrieval.js';

test('chunkText: produces overlapping chunks covering whole text', () => {
  const text = 'a'.repeat(1000);
  const chunks = chunkText(text, { chunkSize: 300, overlap: 50 });
  expect(chunks.length).toBeGreaterThan(1);
  const combined = chunks.join('');
  expect(combined.length).toBeGreaterThanOrEqual(text.length);
});

test('chunkText: short text returns single chunk', () => {
  const text = 'This is a short text';
  const chunks = chunkText(text, { chunkSize: 1000 });
  expect(chunks).toEqual([text]);
});

test('rankPassages: ranks query-relevant chunks higher', () => {
  const chunks = [
    'The Eiffel Tower is located in Paris, France.',
    'Lorem ipsum dolor sit amet consectetur adipiscing elit.',
    'The height of the Eiffel Tower is 330 meters.'
  ];
  const ranked = rankPassages('Eiffel Tower height Paris', chunks, 3);
  expect(ranked[0].text).toContain('Eiffel');
  expect(ranked[0].score).toBeGreaterThan(0);
});

test('rankPassages: stopwords do not dominate', () => {
  const chunks = [
    'what is the height of the eiffel tower and other facts',
    'the eiffel tower was built in 1889 for the world fair'
  ];
  const ranked = rankPassages('what is the height of the eiffel tower', chunks, 2);
  expect(ranked[0].text).toContain('height');
});

test('rankPassages: empty query returns results', () => {
  const chunks = ['some text', 'other text'];
  const ranked = rankPassages('', chunks, 2);
  expect(ranked.length).toBeGreaterThanOrEqual(1);
});