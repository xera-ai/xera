export interface PlaywrightArgsInput {
  specPath: string;
  outputDir: string;
  configPath: string;
  grep?: string;
  /**
   * Extra reporters to append after the always-on `json` reporter that
   * `normalize` depends on. Order matters — Playwright accepts `json,html` etc.
   */
  reporters?: string[];
}

export function buildPlaywrightArgs(input: PlaywrightArgsInput): string[] {
  const reporters = ['json', ...(input.reporters ?? [])];
  const args = [
    'test',
    input.specPath,
    `--config=${input.configPath}`,
    `--reporter=${reporters.join(',')}`,
    `--output=${input.outputDir}`,
    '--trace=on',
  ];
  if (input.grep) {
    args.push('--grep', input.grep);
  }
  return args;
}
