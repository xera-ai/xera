import * as p from '@clack/prompts';
import pc from 'picocolors';
import { allSamples, detectInstalledSamples, removeSample, type SampleDef } from '../samples';

export interface SamplesRemoveOptions {
  yes: boolean;
}

export async function samplesRemoveCommand(opts: SamplesRemoveOptions): Promise<number> {
  const cwd = process.cwd();
  p.intro(pc.cyan('xera samples remove'));

  const installed = detectInstalledSamples(cwd);
  if (installed.length === 0) {
    p.log.info('No sample tickets found in .xera/');
    p.outro(pc.dim('nothing to do'));
    return 0;
  }

  let toRemove: SampleDef[];
  if (opts.yes) {
    toRemove = installed;
  } else if (installed.length === 1) {
    const ok = await p.confirm({
      message: `Remove .xera/${installed[0]!.id}/?`,
      initialValue: true,
    });
    if (typeof ok === 'symbol' || !ok) {
      p.cancel('Aborted.');
      return 0;
    }
    toRemove = installed;
  } else {
    const all = allSamples();
    const choice = await p.multiselect({
      message: 'Which sample(s) to remove?',
      options: installed.map((s) => ({
        value: s.id,
        label: `.xera/${s.id}/`,
      })),
      initialValues: all.map((s) => s.id),
      required: true,
    });
    if (typeof choice === 'symbol') {
      p.cancel('Aborted.');
      return 0;
    }
    const set = new Set(choice as string[]);
    toRemove = installed.filter((s) => set.has(s.id));
  }

  let removed = 0;
  for (const s of toRemove) {
    const ok = removeSample(cwd, s);
    if (ok) {
      p.log.success(`removed .xera/${s.id}/`);
      removed++;
    }
  }
  p.outro(pc.green(`removed ${removed} sample(s)`));
  return 0;
}
