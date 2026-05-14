export interface PlaywrightArgsInput {
  specPath: string;
  outputDir: string;
  configPath: string;
}

export function buildPlaywrightArgs(input: PlaywrightArgsInput): string[] {
  return [
    'test',
    input.specPath,
    `--config=${input.configPath}`,
    '--reporter=json',
    `--output=${input.outputDir}`,
    '--trace=on',
  ];
}
