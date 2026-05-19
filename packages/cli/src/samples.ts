import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldFile, TEMPLATE_DIR } from './scaffold';

const SAMPLES_ROOT = join(TEMPLATE_DIR, 'samples');

export interface SampleDef {
  id: string;
  templateDir: string;
}

const WEB_SAMPLE: SampleDef = {
  id: 'SAMPLE-001',
  templateDir: join(SAMPLES_ROOT, 'web', 'SAMPLE-001'),
};

const HTTP_SAMPLE: SampleDef = {
  id: 'SAMPLE-HTTP-001',
  templateDir: join(SAMPLES_ROOT, 'http', 'SAMPLE-HTTP-001'),
};

export function samplesForShape(shape: 'web' | 'api' | 'mixed'): SampleDef[] {
  if (shape === 'web') return [WEB_SAMPLE];
  if (shape === 'api') return [HTTP_SAMPLE];
  return [WEB_SAMPLE, HTTP_SAMPLE];
}

export function allSamples(): SampleDef[] {
  return [WEB_SAMPLE, HTTP_SAMPLE];
}

/** Copy one sample's files into .xera/<id>/. .tmpl files run through scaffoldFile;
 *  plain files copy as-is. Idempotent at file level — skips files that already
 *  exist so re-running `init --samples` never clobbers user edits. */
export function scaffoldSample(
  cwd: string,
  sample: SampleDef,
  vars: Record<string, unknown>,
): { written: string[]; skipped: string[] } {
  const written: string[] = [];
  const skipped: string[] = [];
  const targetDir = join(cwd, '.xera', sample.id);
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sample.templateDir)) {
    const src = join(sample.templateDir, entry);
    const isTmpl = entry.endsWith('.tmpl');
    const outName = isTmpl ? entry.replace(/\.tmpl$/, '') : entry;
    const dest = join(targetDir, outName);
    if (existsSync(dest)) {
      skipped.push(dest);
      continue;
    }
    if (isTmpl) {
      // scaffoldFile expects a name relative to TEMPLATE_DIR; pass the full path
      // via a relative fragment.
      const rel = src.slice(TEMPLATE_DIR.length + 1);
      scaffoldFile(dest, rel, vars);
    } else {
      copyFileSync(src, dest);
    }
    written.push(dest);
  }
  return { written, skipped };
}

export function removeSample(cwd: string, sample: SampleDef): boolean {
  const dir = join(cwd, '.xera', sample.id);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

export function detectInstalledSamples(cwd: string): SampleDef[] {
  return allSamples().filter((s) => existsSync(join(cwd, '.xera', s.id)));
}
