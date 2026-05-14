export interface SelectorWarning {
  rule: 'no-auto-classname' | 'prefer-role-over-css' | 'no-xpath';
  line: number;
  text: string;
  message: string;
}

const AUTO_CLASS_RE = /\.(?:Mui|css|ant|chakra|MuiButton)[A-Za-z]*-[A-Za-z0-9_]*-[A-Za-z0-9_]{3,}/;
const LOCATOR_CSS_RE = /\.locator\(\s*['"`]([^'"`]+)['"`]/;
const XPATH_RE = /\.locator\(\s*['"`](xpath=|\/\/)/;
const ALLOW_CSS_RE = /xera-allow-css:/;

export function lintSelectors(source: string): { warnings: SelectorWarning[] } {
  const warnings: SelectorWarning[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!;
    const prev = lines[i - 1] ?? '';
    if (XPATH_RE.test(text)) {
      warnings.push({
        rule: 'no-xpath',
        line: i + 1,
        text,
        message: 'XPath selectors are forbidden in v0.1.',
      });
      continue;
    }
    const cssMatch = LOCATOR_CSS_RE.exec(text);
    if (cssMatch) {
      const sel = cssMatch[1]!;
      if (AUTO_CLASS_RE.test(sel)) {
        warnings.push({
          rule: 'no-auto-classname',
          line: i + 1,
          text,
          message: `Auto-generated class name "${sel}" — refactor to role/label/test-id.`,
        });
      } else if (!ALLOW_CSS_RE.test(prev)) {
        warnings.push({
          rule: 'prefer-role-over-css',
          line: i + 1,
          text,
          message: `Prefer getByRole/getByLabel over CSS "${sel}". If unavoidable, add "// xera-allow-css: <reason>" on the previous line.`,
        });
      }
    }
  }
  return { warnings };
}
