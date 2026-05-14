import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';

export interface GherkinValidateResult {
  ok: boolean;
  errors: Array<{ line: number; message: string }>;
}

export function validateGherkin(content: string): GherkinValidateResult {
  if (!content.trim()) {
    return { ok: false, errors: [{ line: 0, message: 'Empty feature file' }] };
  }
  try {
    const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
    parser.parse(content);
    return { ok: true, errors: [] };
  } catch (e: any) {
    const errors: Array<{ line: number; message: string }> = [];
    if (e?.errors && Array.isArray(e.errors)) {
      for (const inner of e.errors) {
        errors.push({ line: inner?.location?.line ?? 0, message: String(inner?.message ?? inner) });
      }
    } else {
      errors.push({ line: 0, message: String(e?.message ?? e) });
    }
    return { ok: false, errors };
  }
}
