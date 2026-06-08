import { describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';

const base = {
  github: { repo: 'owner/repo' },
  adapters: ['web' as const],
  web: { baseUrl: { dev: 'http://example.test' }, defaultEnv: 'dev', auth: {} },
};

describe('dashboard config schema', () => {
  test('omitted dashboard block is fine (backwards compat)', () => {
    const cfg = XeraConfigSchema.parse(base);
    expect(cfg.dashboard).toBeUndefined();
  });

  test('accepts dashboard block with defaults', () => {
    const cfg = XeraConfigSchema.parse({ ...base, dashboard: {} });
    expect(cfg.dashboard?.staleAfterDays).toBe(7);
    expect(cfg.dashboard?.recentFailureLimit).toBe(10);
  });

  test('accepts explicit values', () => {
    const cfg = XeraConfigSchema.parse({
      ...base,
      dashboard: { staleAfterDays: 14, recentFailureLimit: 25 },
    });
    expect(cfg.dashboard?.staleAfterDays).toBe(14);
    expect(cfg.dashboard?.recentFailureLimit).toBe(25);
  });

  test('rejects negative values', () => {
    const r = XeraConfigSchema.safeParse({ ...base, dashboard: { staleAfterDays: -1 } });
    expect(r.success).toBe(false);
  });
});
