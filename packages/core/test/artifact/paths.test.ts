import { describe, expect, test } from 'bun:test';
import { resolveArtifactPaths } from '../../src/artifact/paths';

describe('resolveArtifactPaths', () => {
  test('returns standard paths under .xera/<TICKET>', () => {
    const p = resolveArtifactPaths('/repo', 'JIRA-123');
    expect(p.ticketDir).toBe('/repo/.xera/JIRA-123');
    expect(p.storyPath).toBe('/repo/.xera/JIRA-123/story.md');
    expect(p.featurePath).toBe('/repo/.xera/JIRA-123/test.feature');
    expect(p.specPath).toBe('/repo/.xera/JIRA-123/spec.ts');
    expect(p.pageObjectsDir).toBe('/repo/.xera/JIRA-123/page-objects');
    expect(p.runsDir).toBe('/repo/.xera/JIRA-123/runs');
    expect(p.metaPath).toBe('/repo/.xera/JIRA-123/meta.json');
    expect(p.statusPath).toBe('/repo/.xera/JIRA-123/status.json');
    expect(p.logPath).toBe('/repo/.xera/JIRA-123/xera.log');
    expect(p.lockPath).toBe('/repo/.xera/JIRA-123/.lock');
  });

  test('runPath produces sortable ISO-like timestamp dir', () => {
    const p = resolveArtifactPaths('/repo', 'JIRA-123');
    const run = p.runPath('2026-05-14T10-30-00');
    expect(run.runDir).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00');
    expect(run.reportJsonPath).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/report.json');
    expect(run.tracePath).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/trace.zip');
    expect(run.normalizedPath).toBe(
      '/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/normalized.json',
    );
    expect(run.screenshotsDir).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/screenshots');
  });

  test('rejects invalid ticket keys', () => {
    expect(() => resolveArtifactPaths('/repo', '')).toThrow();
    expect(() => resolveArtifactPaths('/repo', '../etc')).toThrow();
    expect(() => resolveArtifactPaths('/repo', 'has space')).toThrow();
  });

  test('accepts SAMPLE-001 (web) and SAMPLE-HTTP-001 (http) sample keys', () => {
    expect(resolveArtifactPaths('/repo', 'SAMPLE-001').ticketDir).toBe('/repo/.xera/SAMPLE-001');
    expect(resolveArtifactPaths('/repo', 'SAMPLE-HTTP-001').ticketDir).toBe(
      '/repo/.xera/SAMPLE-HTTP-001',
    );
    expect(resolveArtifactPaths('/repo', 'SAMPLE-MIXED-42').ticketDir).toBe(
      '/repo/.xera/SAMPLE-MIXED-42',
    );
  });

  test('accepts multi-segment ticket keys (any project, not just SAMPLE)', () => {
    // Real-world conventions surfaced by issue #127 — these used to be rejected
    // because the old regex hard-coded SAMPLE as the only multi-segment prefix.
    expect(resolveArtifactPaths('/repo', 'PROJ-MODULE-001').ticketDir).toBe(
      '/repo/.xera/PROJ-MODULE-001',
    );
    expect(resolveArtifactPaths('/repo', 'TEAM-FEATURE-42').ticketDir).toBe(
      '/repo/.xera/TEAM-FEATURE-42',
    );
    expect(resolveArtifactPaths('/repo', 'MY-API-V2-42').ticketDir).toBe(
      '/repo/.xera/MY-API-V2-42',
    );
    expect(resolveArtifactPaths('/repo', 'SAMPLE-HTTP-AUTH-001').ticketDir).toBe(
      '/repo/.xera/SAMPLE-HTTP-AUTH-001',
    );
  });

  test('rejects malformed ticket keys', () => {
    // No digits at all
    expect(() => resolveArtifactPaths('/repo', 'SAMPLE-HTTP')).toThrow();
    // Empty middle segment (double dash)
    expect(() => resolveArtifactPaths('/repo', 'SAMPLE--001')).toThrow();
    // Non-uppercase middle segment
    expect(() => resolveArtifactPaths('/repo', 'SAMPLE-http-001')).toThrow();
    // Middle segment starting with a digit (intentional — avoids ambiguity
    // with version-style suffixes; key V2 works but bare 2 does not)
    expect(() => resolveArtifactPaths('/repo', 'JIRA-2-001')).toThrow();
    // No numeric suffix
    expect(() => resolveArtifactPaths('/repo', 'JIRA-MODULE')).toThrow();
  });
});
