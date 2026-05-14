import type { ClassifyOutput } from '../classifier/types';

export interface JiraCommentInput extends ClassifyOutput {
  ticket: string;
  runId: string;
  xeraVersion: string;
  promptsVersion: string;
}

export function buildJiraComment(input: JiraCommentInput): string {
  const passed = input.scenarios.filter(s => s.outcome === 'PASS').length;
  const total = input.scenarios.length;
  const icon = input.overall === 'PASS' ? '🟢' : '🔴';
  const header = `## ${icon} xera test ${input.overall === 'PASS' ? 'PASSED' : 'FAILED'} — ${input.ticket} (run ${input.runId})`;
  const meta = `**Classification:** ${input.overall} (confidence: ${input.overallConfidence})\n**Scenarios:** ${passed} / ${total} passed`;

  const failingBlocks = input.scenarios
    .filter(s => s.outcome === 'FAIL')
    .map(s => `### Scenario: ${s.name}\n- **Classification:** ${s.class} (confidence: ${s.confidence})\n- **Diagnosis:** ${s.rationale}`)
    .join('\n\n');

  const reproduce = `### Reproduce locally\n\n\`\`\`\nbunx xera-internal exec ${input.ticket} --replay=${input.runId}\n\`\`\``;

  const next = input.overall === 'PASS'
    ? ''
    : `### Suggested next action\n- Review the failing scenarios above.\n- Re-run after changes: open Claude Code and run \`/xera-run ${input.ticket}\`.\n\n`;

  const footer = `---\nxera v${input.xeraVersion} • prompts v${input.promptsVersion}`;

  return [header, '', meta, '', failingBlocks, '', next, reproduce, '', footer].filter(Boolean).join('\n');
}
