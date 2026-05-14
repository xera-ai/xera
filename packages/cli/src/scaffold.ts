import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_ROOT = join(fileURLToPath(import.meta.url), '..', '..', 'templates');

function render(tmpl: string, vars: Record<string, string | string[] | boolean>): string {
  let out = tmpl;
  // {{#each list}}...{{/each}} with {{this}} and {{upper this}} — run FIRST so
  // {{this}} doesn't get eaten by the {{var}} pass below.
  out = out.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, k, block) => {
    const list = vars[k];
    if (!Array.isArray(list)) return '';
    return list
      .map((item) =>
        String(block)
          .replace(/\{\{upper this\}\}/g, item.toUpperCase().replace(/-/g, '_'))
          .replace(/\{\{this\}\}/g, item),
      )
      .join('');
  });
  // {{#if foo}}...{{/if}}
  out = out.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, block) =>
    vars[k] ? String(block) : '',
  );
  // {{var}} — last so it doesn't clobber {{this}} inside each blocks.
  out = out.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? '' : Array.isArray(v) ? v.map((s) => `'${s}'`).join(', ') : String(v);
  });
  return out;
}

export function scaffoldFile(
  targetPath: string,
  templateName: string,
  vars: Record<string, unknown>,
): void {
  const tmpl = readFileSync(join(TEMPLATE_ROOT, templateName), 'utf8');
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, render(tmpl, vars as Record<string, string | string[] | boolean>));
}

export function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else writeFileSync(d, readFileSync(s));
  }
}

export const TEMPLATE_DIR = TEMPLATE_ROOT;
