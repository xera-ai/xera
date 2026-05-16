export interface PlaywrightArgsInput {
  specPath: string;
  outputDir: string;
  configPath: string;
  grep?: string;
}

export function buildPlaywrightArgs(input: PlaywrightArgsInput): string[] {
  const args = [
    'test',
    input.specPath,
    `--config=${input.configPath}`,
    '--reporter=json',
    `--output=${input.outputDir}`,
    '--trace=on',
  ];
  if (input.grep) {
    args.push('--grep', input.grep);
  }
  return args;
}
