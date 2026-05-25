import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_ROOT = join(fileURLToPath(import.meta.url), '..', '..', 'templates');

// Walk a template, replacing each `{{#TAG NAME}}…{{/TAG}}` block by passing
// its body to `expand`. Handles nesting of the same tag by depth-counting,
// which a naive non-greedy regex would get wrong (issue #190 — when an outer
// {{#if}} wraps an inner {{#if}}, the regex paired the outer opener with the
// inner closer and left the outer `{{/if}}` orphaned in the output).
function expandBlocks(
  tmpl: string,
  tag: 'if' | 'each',
  expand: (name: string, body: string) => string,
): string {
  const openPrefix = `{{#${tag} `;
  const closeTag = `{{/${tag}}}`;
  let out = '';
  let i = 0;
  while (i < tmpl.length) {
    const openIdx = tmpl.indexOf(openPrefix, i);
    if (openIdx === -1) {
      out += tmpl.slice(i);
      break;
    }
    out += tmpl.slice(i, openIdx);
    const nameEnd = tmpl.indexOf('}}', openIdx);
    if (nameEnd === -1) {
      out += tmpl.slice(openIdx);
      break;
    }
    const name = tmpl.slice(openIdx + openPrefix.length, nameEnd).trim();

    let depth = 1;
    let j = nameEnd + 2;
    let matchedCloseIdx = -1;
    while (j < tmpl.length && depth > 0) {
      const nextOpen = tmpl.indexOf(openPrefix, j);
      const nextClose = tmpl.indexOf(closeTag, j);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        const openEnd = tmpl.indexOf('}}', nextOpen);
        if (openEnd === -1) break;
        j = openEnd + 2;
      } else {
        depth--;
        if (depth === 0) matchedCloseIdx = nextClose;
        j = nextClose + closeTag.length;
      }
    }
    if (matchedCloseIdx === -1) {
      out += tmpl.slice(openIdx);
      break;
    }
    const body = tmpl.slice(nameEnd + 2, matchedCloseIdx);
    out += expand(name, body);
    i = matchedCloseIdx + closeTag.length;
  }
  return out;
}

function render(tmpl: string, vars: Record<string, string | string[] | boolean>): string {
  let out = tmpl;
  // {{#each list}}...{{/each}} with {{this}} and {{upper this}} — run FIRST so
  // {{this}} doesn't get eaten by the {{var}} pass below.
  out = expandBlocks(out, 'each', (name, block) => {
    const list = vars[name];
    if (!Array.isArray(list)) return '';
    return list
      .map((item) =>
        block
          .replace(/\{\{upper this\}\}/g, item.toUpperCase().replace(/-/g, '_'))
          .replace(/\{\{this\}\}/g, item),
      )
      .join('');
  });
  // {{#if foo}}...{{/if}} — recurse into the body so nested ifs evaluate too.
  const expandIf = (s: string): string =>
    expandBlocks(s, 'if', (name, body) => (vars[name] ? expandIf(body) : ''));
  out = expandIf(out);
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
