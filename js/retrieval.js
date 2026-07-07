const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'of', 'to', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'up', 'about', 'into', 'over', 'after', 'beneath',
  'under', 'above', 'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where',
  'why', 'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'not', 'no', 'yes',
  'can', 'cannot', 'cannot', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'as', 'until', 'while', 'although', 'though',
  'however', 'therefore', 'thus', 'hence', 'there', 'here', 'whence', 'wherever'
]);

const SKIP_HOSTS = [
  'youtube.com', 'www.youtube.com',
  'facebook.com', 'www.facebook.com',
  'twitter.com', 'x.com', 'www.twitter.com', 'www.x.com',
  'instagram.com', 'www.instagram.com',
  'tiktok.com', 'www.tiktok.com',
  'pinterest.com', 'www.pinterest.com'
];

export function chunkText(text, { chunkSize = 500, overlap = 100 } = {}) {
  if (!text || text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + chunkSize * 0.5 && breakPoint < text.length) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

export function rankPassages(query, chunks, topK = 3) {
  const terms = query.toLowerCase().match(/\b[a-z]+\b/g) || [];
  const uniqueTerms = [...new Set(terms.filter(t => !STOPWORDS.has(t)))];

  if (uniqueTerms.length === 0) {
    return chunks.slice(0, topK).map((text, i) => ({ text, score: 0 }));
  }

  const corpus = chunks.map((text, idx) => ({ text, idx }));
  const docFreq = new Map();

  corpus.forEach(doc => {
    const termSet = new Set();
    const docTerms = doc.text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    docTerms.forEach(t => {
      if (!STOPWORDS.has(t)) termSet.add(t);
    });
    termSet.forEach(term => {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    });
  });

  const scores = corpus.map(doc => {
    const docTerms = doc.text.toLowerCase().match(/\b[a-z]+\b/g) || [];
    const termFreq = new Map();
    docTerms.forEach(t => {
      if (!STOPWORDS.has(t)) {
        termFreq.set(t, (termFreq.get(t) || 0) + 1);
      }
    });

    const docLen = doc.text.length;
    const avgDocLen = corpus.reduce((sum, d) => sum + d.text.length, 0) / corpus.length;

    let score = 0;
    uniqueTerms.forEach(term => {
      const tf = termFreq.get(term) || 0;
      const df = docFreq.get(term) || 1;
      const idf = Math.log((corpus.length + 1) / df);
      const k1 = 1.5;
      const b = 0.75;
      score += idf * (tf / (tf + k1 * (1 - b + b * docLen / avgDocLen)));
    });

    return { text: doc.text, score, idx: doc.idx };
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(item => ({ text: item.text, score: item.score }));
}

export async function gatherEvidence(claimItem, fetchURLFn, onProgress) {
  if (!fetchURLFn) {
    return { ...claimItem };
  }

  const candidateUrls = claimItem.snippets
    .slice(0, 2)
    .map(s => s.url)
    .filter(url => {
      const lower = url.toLowerCase();
      return !SKIP_HOSTS.some(host => lower.includes(host));
    });

  const passagePromises = candidateUrls.map(async (url) => {
    try {
      const result = await Promise.race([
        fetchURLFn(url, 20000),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000)
        )
      ]);

      if (!result?.text) return null;

      const chunks = chunkText(result.text, {});
      const ranked = rankPassages(`${claimItem.claim} ${claimItem.searchQuery}`, chunks, 2);

      return {
        url,
        title: result.title || '',
        passages: ranked
      };
    } catch {
      return null;
    }
  });

  const results = await Promise.allSettled(passagePromises);

  const validResults = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  const allPassages = validResults.flatMap(r =>
    r.passages.map(p => ({
      url: r.url,
      title: r.title,
      text: p.text,
      score: p.score
    }))
  );

  return {
    ...claimItem,
    passages: allPassages
  };
}
