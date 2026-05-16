import { basename, dirname } from 'node:path';

export interface GenerateConfigInput {
  specPath: string;
  outputDir: string;
  baseURL: string;
}

function q(s: string): string {
  return `'${s.replace(/'/g, "\\'")}'`;
}

export function generateHttpPlaywrightConfig(input: GenerateConfigInput): string {
  return `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: ${q(dirname(input.specPath))},
  testMatch: ${q(basename(input.specPath))},
  outputDir: ${q(input.outputDir)},
  reporter: [['json', { outputFile: ${q(`${input.outputDir}/raw-report.json`)} }]],
  use: { baseURL: ${q(input.baseURL)} },
  projects: [{ name: 'http' }],
});
`;
}
