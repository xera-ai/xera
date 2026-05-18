import { describe, expect, test } from 'bun:test';
import { parseFrontmatter, serializeFrontmatter } from '../../src/editors/frontmatter';

describe('parseFrontmatter', () => {
  test('parses simple name + description', () => {
    const md = `---\nname: xera-run\ndescription: Run the full pipeline.\n---\n# Body\n`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.fields).toEqual({
      name: 'xera-run',
      description: 'Run the full pipeline.',
    });
    expect(body).toBe('# Body\n');
  });

  test('parses block scalar description', () => {
    const md = `---\nname: x\ndescription: |\n  Line 1\n  Line 2\n---\nBody\n`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.fields.description).toBe('Line 1\nLine 2');
  });

  test('parses boolean alwaysApply', () => {
    const md = `---\ndescription: r\nalwaysApply: false\n---\n`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.fields.alwaysApply).toBe(false);
  });

  test('returns empty fields and full body when no frontmatter', () => {
    const md = `# No frontmatter here\n`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.fields).toEqual({});
    expect(body).toBe(md);
  });
});

describe('serializeFrontmatter', () => {
  test('writes simple fields in declaration order', () => {
    const out = serializeFrontmatter({ name: 'xera-run', description: 'Run it.' });
    expect(out).toBe('---\nname: xera-run\ndescription: Run it.\n---\n');
  });

  test('writes block scalar for multi-line description', () => {
    const out = serializeFrontmatter({ description: 'Line 1\nLine 2' });
    expect(out).toBe('---\ndescription: |\n  Line 1\n  Line 2\n---\n');
  });

  test('writes boolean values bare', () => {
    const out = serializeFrontmatter({ description: 'r', alwaysApply: false });
    expect(out).toBe('---\ndescription: r\nalwaysApply: false\n---\n');
  });

  test('round-trips parse → serialize for a Claude-style skill header', () => {
    const md = `---\nname: xera-run\ndescription: Run the full xera pipeline for a Jira ticket end-to-end.\n---\n`;
    const { frontmatter } = parseFrontmatter(md);
    const out = serializeFrontmatter(frontmatter.fields);
    expect(out).toBe(md);
  });
});
