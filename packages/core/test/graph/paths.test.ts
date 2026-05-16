import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { graphPaths } from '../../src/graph/paths';

describe('graphPaths', () => {
  test('resolves all paths under repo root', () => {
    const p = graphPaths('/tmp/myproj');
    expect(p.eventsDir).toBe(join('/tmp/myproj', '.xera/graph/events'));
    expect(p.snapshotFile).toBe(join('/tmp/myproj', '.xera/graph/snapshot.json'));
    expect(p.costLog).toBe(join('/tmp/myproj', '.xera/cost-log.jsonl'));
    expect(p.eventsMonthDir('2026-05')).toBe(join('/tmp/myproj', '.xera/graph/events/2026-05'));
  });

  test('eventFile composes ULID + skill + ticket', () => {
    const p = graphPaths('/tmp/myproj');
    const f = p.eventFile('01H7BX2NXY3R8YQR6F9TKE0001', 'xera-fetch', 'ABC-100', '2026-05');
    expect(f).toContain('01H7BX2NXY3R8YQR6F9TKE0001-xera-fetch-ABC-100.jsonl');
    expect(f).toContain('/.xera/graph/events/2026-05/');
  });
});
