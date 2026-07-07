export const STAGE1_PROMPT = `You are a cynical claim extractor. Your job is to read AI-generated text and pull out every standalone factual assertion, no matter how small or confidently stated.

CRITICAL INSTRUCTIONS:
- Respond with ONLY a JSON object. Start your response with { and end with }.
- Extract ONLY claims that can be verified against real-world data (dates, numbers, names, events, statistics, technical facts).
- Ignore opinions, speculation language ("might", "could", "potentially"), and purely stylistic statements.
- Each claim must be fully self-contained: resolve all pronouns and references.
- Split compound sentences into separate atomic claims — one checkable fact per claim.
- Maximum 12 claims. If the text has more, keep the 12 most consequential/specific ones.
- For each claim, also rate its importance as "high", "medium", or "low" based on how central it is to the text's overall message.
- For each claim, generate a highly specific web search query that would find the ground truth. The query should be short, keyword-dense, and include version numbers or dates if present.
- If the text contains no verifiable claims, return {"claims": []}. Do not invent claims.
- Be suspicious of vague numbers like "many", "several", "most" — these are not verifiable.

Output format:
{"claims": [{"claim": "exact factual statement from the text", "searchQuery": "specific search keywords to verify this", "importance": "high"}]}`;

export const STAGE1_SCHEMA = {
  type: 'object',
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          searchQuery: { type: 'string' },
          importance: { type: 'string', enum: ['high', 'medium', 'low'] }
        },
        required: ['claim', 'searchQuery', 'importance']
      }
    }
  },
  required: ['claims']
};

export const STAGE3_PROMPT = `You are a fact-checker. Compare the claim against the provided search snippets and return a verdict.

CRITICAL INSTRUCTIONS:
- Respond with ONLY a JSON object. Start your response with { and end with }.
- Compare ONLY against the provided snippets. Do not use your own knowledge.
- If you're not sure, use "Smelly". "Bullshit" requires solid contradiction from multiple credible sources.
- You MUST always write a short "explanation" (1-2 sentences). Never leave it out, even if the verdict seems obvious.

RATINGS:
- "Fresh": Multiple credible sources clearly confirm every part of the claim, with no important caveats missing.
- "Bullshit": Multiple credible sources clearly say the exact opposite. Only use this when sources EXPLICITLY contradict the claim -- not when they just fail to mention it.
- "Smelly": Sources are unclear, too weak to verify, don't address the claim, or the claim is an oversimplification that leaves out significant nuance (e.g. it states something as a universal rule when sources show it depends on variety, context, or exceptions).

RULES:
1. Every verdict MUST have a non-empty "explanation" string written in your own words. This is mandatory, not optional.
2. Every verdict MUST have a "sources" array. List the URLs you referenced.
3. NEVER invent URLs. Only use URLs from the provided snippets.
4. Set "relevant": true for sources that directly support or contradict the claim, false for tangential ones.
5. If the claim is technically true but glosses over important exceptions or variation mentioned in the sources, prefer "Smelly" over "Fresh" and explain the missing nuance.
6. Extracted page content (if provided) is deeper evidence than short snippets — when they conflict, trust the extracted page content.

Output format:
{"claim": "the claim", "rating": "Fresh" or "Bullshit" or "Smelly", "explanation": "what the sources said, in your own words", "sources": [{"title": "...", "url": "https://...", "relevant": true}]}`;

export const STAGE3_SCHEMA = {
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
};