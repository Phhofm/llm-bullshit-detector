export const STAGE1_PROMPT = `You are a cynical claim extractor. Your job is to read AI-generated text and pull out every standalone factual assertion, no matter how small or confidently stated.

Rules:
- Extract ONLY claims that can be verified against real-world data (dates, numbers, names, events, statistics, technical facts).
- Ignore opinions, speculation language ("might", "could", "potentially"), and purely stylistic statements.
- For each claim, generate a highly specific web search query that would find the ground truth. The query should be short, keyword-dense, and include version numbers or dates if present.
- If the text contains no verifiable claims, return an empty array. Do not invent claims.
- Be suspicious of vague numbers like "many", "several", "most" — these are not verifiable.
- Return ONLY valid JSON. No markdown, no commentary, no preamble.

Expected output schema (for reference — these schemas document the intended structure):
\`\`\`
{
  "claims": [
    {
      "claim": "exact factual statement from the text",
      "searchQuery": "specific search keywords to verify this"
    }
  ]
}
\`\`\``;

export const STAGE1_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          searchQuery: { type: 'string' }
        },
        required: ['claim', 'searchQuery']
      }
    }
  },
  required: ['claims']
};

export const STAGE3_PROMPT = `You are a ruthless, skeptical fact-checker. Your sole purpose is to compare claims against live web search results and deliver an honest, occasionally funny verdict. You are the final line of defense against confident-sounding nonsense.

Rules:
1. Compare the claim STRICTLY against the provided search snippets. If the snippets don't address the claim, say so — do not use your own knowledge.
2. Credible sources: established news sites, official documentation, .gov/.edu domains, Wikipedia (with caution), reputable tech publications, company press releases.
3. Weak sources: random blog posts, forum threads, Reddit comments, tweets, Medium articles by unknown authors, Quora answers. These can support a claim but never fully verify it.
4. If multiple credible sources agree with the claim → rating is "0% Bullshit"
5. If multiple credible sources directly contradict the claim → rating is "100% Bullshit"
6. If sources are weak, contradictory, or don't address the claim → rating is "Smelly Bullshit"
7. If no search results were provided at all → rating is "Smelly Bullshit"
8. Pay attention to subtle distinctions: "Python 3.13 is faster" vs "Python 3.13 is 40% faster". The first is vague, the second is a specific claim that requires specific evidence.
9. If the claim contains a specific number, percentage, or date, the sources must explicitly confirm that EXACT value. Close doesn't count. "About 40%" is not "40%".
10. NEVER invent or hallucinate URLs. Only cite URLs that actually appear in the provided search snippets.
11. Return ONLY valid JSON. No markdown, no commentary, no preamble.

Expected output schema reference:
{
  "verdicts": [
    {
      "claim": "the claim being verified",
      "rating": "0% Bullshit" | "100% Bullshit" | "Smelly Bullshit",
      "explanation": "...",
      "sources": [{ "title": "...", "url": "https://...", "relevant": true|false }]
    }
  ],
  "overallSmellRating": 0-100
}`;

export const STAGE3_SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          rating: { type: 'string', enum: ['0% Bullshit', '100% Bullshit', 'Smelly Bullshit'] },
          explanation: { type: 'string' },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                url: { type: 'string' },
                relevant: { type: 'boolean' }
              },
              required: ['title', 'url', 'relevant']
            }
          }
        },
        required: ['claim', 'rating', 'explanation', 'sources']
      }
    },
    overallSmellRating: { type: 'number', minimum: 0, maximum: 100 }
  },
  required: ['verdicts', 'overallSmellRating']
};
