import { runInference } from './llm.js';
import { STAGE1_PROMPT, STAGE3_PROMPT, STAGE1_SCHEMA, STAGE3_SCHEMA } from './prompts.js';
import { SNIFFING_MESSAGES, CLAIM_NOT_FOUND_EXPLANATION } from './constants.js';
import { parseModelJson, parseStage3Response, calculateOverallRating, summarizeVerdicts } from './scoring.js';

export async function extractClaims(text, onStatus) {
  if (onStatus) onStatus(SNIFFING_MESSAGES[0]);

  const messages = [
    { role: 'system', content: STAGE1_PROMPT },
    { role: 'user', content: `Extract every verifiable factual claim from this text. Return ONLY the JSON:\n\n${text}` }
  ];

  const response = await runInference(messages, 90000, STAGE1_SCHEMA);

  const parsed = parseModelJson(response, { claims: [] });
  return (parsed && parsed.claims) ? parsed.claims : [];
}

export async function verifyClaims(claimsWithSnippets, urlContent, onStatus, onVerdict, shouldCancel) {
  const verdicts = [];

  for (let i = 0; i < claimsWithSnippets.length; i++) {
    if (shouldCancel && shouldCancel()) {
      const summary = summarizeVerdicts(verdicts);
      return { verdicts, summary, stoppedEarly: true, total: claimsWithSnippets.length };
    }

    const item = claimsWithSnippets[i];

    if (onStatus) {
      const claimText = item.claim.length > 60 ? item.claim.slice(0, 60) + '...' : item.claim;
      onStatus(`Verifying claim ${i + 1} of ${claimsWithSnippets.length}: "${claimText}"`);
    }

    if (item.error || item.snippets.length === 0) {
      const verdict = {
        claim: item.claim,
        rating: 'Smelly',
        explanation: item.error
          ? 'Search failed for this claim. The internet refused to weigh in.'
          : CLAIM_NOT_FOUND_EXPLANATION,
        sources: []
      };
      verdicts.push(verdict);
      if (onVerdict) onVerdict(verdict, i, claimsWithSnippets.length);
      continue;
    }

    const snippetsText = item.snippets
      .slice(0, 5)
      .map((s, j) => `[${j + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
      .join('\n\n');

    let userContent = `Claim to verify: "${item.claim}"\n\nLive search results:\n${snippetsText}`;
    
    if (item.passages?.length) {
      const passageText = item.passages
        .map(p => `[Source: ${p.url}]\n${p.text.slice(0, 1200)}`)
        .join('\n\n');
      userContent += `\n\nEXTRACTED PAGE CONTENT (deeper evidence from the top sources):\n${passageText}`;
    }
    
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
        response = await runInference(messages, 90000, STAGE3_SCHEMA);
        break;
      } catch (err) {
        lastError = err;
        if (attempt === 1 && onStatus) {
          onStatus(`First attempt failed for claim ${i + 1}, retrying...`);
        }
      }
    }

    if (!response) {
      const verdict = {
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
      };
      verdicts.push(verdict);
      if (onVerdict) onVerdict(verdict, i, claimsWithSnippets.length);
      continue;
    }

    const parsed = parseStage3Response(response, item);
    verdicts.push(parsed);
    if (onVerdict) onVerdict(parsed, i, claimsWithSnippets.length);
  }

  const summary = summarizeVerdicts(verdicts);
  return { verdicts, summary };
}