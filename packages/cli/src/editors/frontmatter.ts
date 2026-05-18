export type FrontmatterValue = string | boolean | string[];

export interface ParsedFrontmatter {
  raw: string;
  fields: Record<string, FrontmatterValue>;
}

const FENCE = '---';

export function parseFrontmatter(md: string): {
  frontmatter: ParsedFrontmatter;
  body: string;
} {
  if (!md.startsWith(`${FENCE}\n`)) {
    return { frontmatter: { raw: '', fields: {} }, body: md };
  }
  const closeIdx = md.indexOf(`\n${FENCE}\n`, FENCE.length + 1);
  if (closeIdx < 0) {
    return { frontmatter: { raw: '', fields: {} }, body: md };
  }
  const raw = md.slice(FENCE.length + 1, closeIdx);
  const body = md.slice(closeIdx + `\n${FENCE}\n`.length);
  const fields: Record<string, FrontmatterValue> = {};
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2]!;
    if (value === '|') {
      // Block scalar — collect subsequent indented lines
      const collected: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!;
        if (/^ {2,}/.test(next)) {
          collected.push(next.replace(/^ {2}/, ''));
          i++;
        } else if (next.trim() === '') {
          collected.push('');
          i++;
        } else {
          break;
        }
      }
      while (collected.length && collected[collected.length - 1] === '') collected.pop();
      fields[key] = collected.join('\n');
    } else if (value === 'true' || value === 'false') {
      fields[key] = value === 'true';
    } else if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      // Strip the matched outer pair of quotes produced by `serializeFrontmatter`
      // for values containing `:` or `#`. Keeps parse/serialize round-trippable.
      fields[key] = value.slice(1, -1).replace(/\\"/g, '"');
    } else {
      fields[key] = value;
    }
  }
  return { frontmatter: { raw, fields }, body };
}

export function serializeFrontmatter(fields: Record<string, FrontmatterValue>): string {
  const lines: string[] = [FENCE];
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else if (value.includes('\n')) {
      lines.push(`${key}: |`);
      for (const sub of value.split('\n')) lines.push(`  ${sub}`);
    } else if (/[:#]/.test(value)) {
      // Spec §2.3: quote string values containing : or # to keep the output
      // valid YAML when a description happens to include those characters.
      lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push(FENCE);
  return `${lines.join('\n')}\n`;
}
