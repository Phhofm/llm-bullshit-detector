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
      const claimText = item.claim.length > 60 ? item.claim.slice(0, 60) + '...' : item.claim;
      onStatus(`Verifying claim ${i + 1} of ${claimsWithSnippets.length}: "${claimText}"`);
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

    let response;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (onStatus && attempt === 2) {
          onStatus(`Retrying verification for claim ${i + 1}...`);
        }
        response = await runInference(messages, 90000);
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 1 && onStatus) {
          onStatus(`First attempt failed for claim ${i + 1}, retrying...`);
        }
      }
    }

    if (!response) {
      verdicts.push({
        claim: item.claim,
        rating: 'Smelly',
        explanation: lastError?.message === 'Inference timed out after 90s'
          ? 'Verification timed out. The model took too long to think on this one — try a smaller model tier or fewer claims.'
          : 'Verification failed. The model encountered an unexpected error while checking this claim.',
        sources: item.snippets.slice(0, 3).map(s => ({
          title: s.title,
          url: s.url,
          relevant: false
        }))
      });
      totalErrors++;
      continue;
    }

    const parsed = parseStage3Response(response, item.claim);
    verdicts.push(parsed);
  }

  const overallSmellRating = calculateOverallRating(verdicts);
  return { verdicts, overallSmellRating };
}

function parseModelJson(response, fallback) {
  if (!response) return fallback;

  let cleaned = response.trim();

  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();
  }

  cleaned = cleaned.replace(/^json\s*/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    try {
      return JSON.parse(cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
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
