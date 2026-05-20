import type { TicketNode } from './types';

export const DEFAULT_SIMILARITY_CANDIDATE_LIMIT = 100;

export function buildSimilarityPrompt(
  target: TicketNode,
  candidates: TicketNode[],
  limit: number = DEFAULT_SIMILARITY_CANDIDATE_LIMIT,
): string {
  const window = candidates.slice(0, limit);
  const candidateBlock = window
    .map((t, i) => {
      const ac = t.ac.length > 0 ? `\n   AC: ${t.ac.slice(0, 3).join(' | ')}` : '';
      return `${i + 1}. ${t.id} — ${t.summary}${ac}`;
    })
    .join('\n');

  const targetAc =
    target.ac.length > 0 ? `\nAC:\n${target.ac.map((a) => `  - ${a}`).join('\n')}` : '';

  return `You are evaluating whether a NEW ticket is semantically related to any prior tickets in this project's knowledge graph.

# NEW TICKET
ID: ${target.id}
Summary: ${target.summary}${targetAc}

# PRIOR TICKETS (most recent ${window.length} of ${candidates.length})
${candidateBlock || '(none yet)'}

# Task
Output a JSON object with shape:

\`\`\`json
{
  "similar": [
    { "ticketId": "<JIRA-KEY>", "confidence": 0.0-1.0, "reason": "<one sentence>" }
  ]
}
\`\`\`

# Rules
1. Only include candidates with confidence ≥ 0.7. Below that, exclude.
2. Confidence reflects semantic relatedness (same SUT area, same flow, complementary feature) — NOT just word overlap.
3. Cap output at 10 entries even if more candidates pass the threshold; pick the highest-confidence ones.
4. If NO candidates are related, return \`{ "similar": [] }\`. Do not invent relationships.
5. Output JSON ONLY. No prose, no fences, no commentary.`;
}
