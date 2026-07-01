import { runInference } from './llm.js';
import { STAGE1_PROMPT, STAGE3_PROMPT } from './prompts.js';
import { SNIFFING_MESSAGES, CLAIM_NOT_FOUND_EXPLANATION } from './constants.js';

export async function extractClaims(text, onStatus) {
  if (onStatus) onStatus(SNIFFING_MESSAGES[0]);

  const messages = [
    { role: 'system', content: STAGE1_PROMPT },
    { role: 'user', content: `Extract every verifiable factual claim from this text. Return ONLY the JSON:\n\n${text}` }
  ];

  const response = await runInference(messages);

  const parsed = parseModelJson(response, { claims: [] });
  return (parsed && parsed.claims) ? parsed.claims : [];
}

export async function verifyClaims(claimsWithSnippets, urlContent, onStatus) {
  const verdicts = [];
  let totalErrors = 0;

  for (let i = 0; i < claimsWithSnippets.length; i++) {
    const item = claimsWithSnippets[i];

    if (onStatus) {
      const msgIdx = Math.floor(((i + 1) / claimsWithSnippets.length) * (SNIFFING_MESSAGES.length - 1)) + 1;
      onStatus(SNIFFING_MESSAGES[Math.min(msgIdx, SNIFFING_MESSAGES.length - 1)]);
    }

    if (item.error || item.snippets.length === 0) {
      verdicts.push({
        claim: item.claim,
        rating: 'Smelly',
        explanation: item.error
          ? 'Search failed for this claim. The internet refused to weigh in.'
          : CLAIM_NOT_FOUND_EXPLANATION,
        sources: []
      });
      totalErrors++;
      continue;
    }

    const snippetsText = item.snippets
      .slice(0, 5)
      .map((s, j) => `[${j + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
      .join('\n\n');

    let userContent = `Claim to verify: "${item.claim}"\n\nLive search results:\n${snippetsText}`;
    if (urlContent) {
      userContent += `\n\n---\nLIVE PAGE FETCHED DIRECTLY:\n${urlContent.slice(0, 3000)}`;
      userContent += `\n\nIMPORTANT: The AI output being checked may have claimed something about the page at this URL. Compare the claim against the ACTUAL content above. If the page clearly exists and contains information the AI denied, that's Bullshit.`;
    }

    const messages = [
      { role: 'system', content: STAGE3_PROMPT },
      { role: 'user', content: userContent + '\n\nReturn ONLY the JSON verdict for this claim.' }
    ];

    try {
      const response = await runInference(messages);

      const parsed = parseStage3Response(response, item.claim);
      verdicts.push(parsed);
    } catch {
      verdicts.push({
        claim: item.claim,
        rating: 'Smelly',
        explanation: 'Verification failed. The model tripped over its own skepticism.',
        sources: item.snippets.slice(0, 3).map(s => ({
          title: s.title,
          url: s.url,
          relevant: false
        }))
      });
    }
  }

  const overallSmellRating = calculateOverallRating(verdicts);
  return { verdicts, overallSmellRating };
}

function parseModelJson(response, fallback) {
  try {
    return JSON.parse(response);
  } catch {
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return fallback;
    }
  }
}

function parseStage3Response(response, fallbackClaim) {
  const parsed = parseModelJson(response, null);
  if (!parsed) {
    return {
      claim: fallbackClaim,
      rating: 'Smelly',
      explanation: 'Could not parse verification result. The model got confused.',
      sources: []
    };
  }

  return {
    claim: parsed.claim || fallbackClaim,
    rating: parsed.rating || 'Smelly',
    explanation: parsed.explanation || 'The model rendered a verdict but forgot to explain itself. Typical.',
    sources: Array.isArray(parsed.sources) ? parsed.sources : []
  };
}

function calculateOverallRating(verdicts) {
  if (verdicts.length === 0) return 0;

  let total = 0;
  for (const v of verdicts) {
    if (v.rating === 'Fresh') total += 0;
    else if (v.rating === 'Smelly') total += 50;
    else if (v.rating === 'Bullshit') total += 100;
    else total += 50;
  }

  return Math.round(total / verdicts.length);
}
