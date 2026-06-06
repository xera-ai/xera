import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SKILL_PATH = join(__dirname, '..', '..', '..', 'skills', 'xera-http-auth-discover.md');

const skill = readFileSync(SKILL_PATH, 'utf8');

describe('xera-http-auth-discover skill contract', () => {
  test('declares prerequisites for strategy + web auth file', () => {
    expect(skill).toMatch(/http\.auth\.strategy = 'reuse-web-session'/);
    expect(skill).toMatch(/auth-setup --role <role> --shape web/);
  });

  test('calls prepare binary with the role flag', () => {
    expect(skill).toMatch(/npx xera-internal http-auth-discover-prepare --role <role>/);
  });

  test('wraps LLM input with the nonce-bound boundary tag', () => {
    expect(skill).toMatch(/<XR_DISCOVERY_<NONCE>>/);
    expect(skill).toMatch(/12-hex-char/);
  });

  test('writes the LLM proposal to the well-known output path', () => {
    expect(skill).toMatch(/\.xera\/\.auth\/http-auth-discover-output-<role>\.json/);
  });

  test('calls finalize binary with the role flag', () => {
    expect(skill).toMatch(/npx xera-internal http-auth-discover-finalize --role <role>/);
  });

  test('Step 7 instructs the LLM to drive the Edit tool, not the user', () => {
    expect(skill).toMatch(/Read tool on `xera\.config\.ts`/);
    expect(skill).toMatch(/Use the Edit tool/);
    expect(skill).toMatch(/Do NOT ask the user to copy-paste/);
  });

  test('Step 7 covers both insertion cases (role exists vs new)', () => {
    expect(skill).toMatch(/Role already exists/);
    expect(skill).toMatch(/Role does not exist/);
  });

  test('Step 7 surfaces the confidence summary before editing', () => {
    expect(skill).toMatch(/confidence summary/i);
  });

  test('Step 7c warns about CSRF header variants (Angular/Spring) before Edit', () => {
    expect(skill).toMatch(/DevTools/);
    expect(skill).toMatch(/X-XSRF-Token/);
    expect(skill).toMatch(/Verify in the web app/);
  });

  test('Step 7 falls back to paste-by-hand if Edit fails', () => {
    expect(skill).toMatch(/paste manually as a fallback/);
  });

  test('Step 7 runs doctor before auth-setup and gates on its result', () => {
    expect(skill).toMatch(/npx xera doctor/);
    expect(skill).toMatch(/npx xera-internal auth-setup --role <role> --shape http/);
    expect(skill).toMatch(/Do NOT proceed to `auth-setup` if doctor fails/);
  });

  test('preserves the v0.3 injection-follow refusal contract', () => {
    expect(skill).toMatch(/injection-follow refused/);
    expect(skill).toMatch(/Do NOT propose anything/);
  });
});
