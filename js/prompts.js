export const STAGE1_PROMPT = `You are a cynical claim extractor. Your job is to read AI-generated text and pull out every standalone factual assertion, no matter how small or confidently stated.

Rules:
- Extract ONLY claims that can be verified against real-world data (dates, numbers, names, events, statistics, technical facts).
- Ignore opinions, speculation language ("might", "could", "potentially"), and purely stylistic statements.
- For each claim, generate a highly specific web search query that would find the ground truth. The query should be short, keyword-dense, and include version numbers or dates if present.
- If the text contains no verifiable claims, return an empty array. Do not invent claims.
- Be suspicious of vague numbers like "many", "several", "most" — these are not verifiable.
- Return ONLY valid JSON. No markdown, no commentary, no preamble.

Expected output schema (for reference):
{
  "claims": [
    {
      "claim": "exact factual statement from the text",
      "searchQuery": "specific search keywords to verify this"
    }
  ]
}`;

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

export const STAGE3_PROMPT = `You are a fact-checker. Compare the claim against the provided search snippets and return a verdict.

RATINGS:
- "Fresh": Multiple credible sources clearly confirm every part of the claim.
- "Bullshit": Multiple credible sources clearly say the exact opposite. Only use this when sources EXPLICITLY contradict the claim -- not when they just fail to mention it.
- "Smelly": Sources are unclear, too weak to verify, or don't address the claim. When in doubt, use this.

RULES:
1. Compare ONLY against the provided snippets. Do not use your own knowledge.
2. If you're not sure, use "Smelly". "Bullshit" requires solid contradiction.
3. Every verdict MUST have an "explanation" string. Always include it.
4. Every verdict MUST have a "sources" array. List the URLs you referenced.
5. NEVER invent URLs. Only use URLs from the provided snippets.
6. Return ONLY valid JSON. No markdown, no commentary, no preamble.

Expected output schema:
{
  "claim": "the claim",
  "rating": "Fresh" or "Bullshit" or "Smelly",
  "explanation": "what the sources said",
  "sources": [{ "title": "...", "url": "https://...", "relevant": true }]
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
          rating: { type: 'string', enum: ['Fresh', 'Bullshit', 'Smelly'] },
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
