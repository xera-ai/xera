import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  allSamples,
  detectInstalledSamples,
  removeSample,
  samplesForShape,
  scaffoldSample,
} from '../src/samples';

describe('samples module', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xera-samples-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('samplesForShape returns SAMPLE-001 only for web', () => {
    const list = samplesForShape('web').map((s) => s.id);
    expect(list).toEqual(['SAMPLE-001']);
  });

  test('samplesForShape returns SAMPLE-HTTP-001 only for api', () => {
    const list = samplesForShape('api').map((s) => s.id);
    expect(list).toEqual(['SAMPLE-HTTP-001']);
  });

  test('samplesForShape returns both for mixed', () => {
    const list = samplesForShape('mixed').map((s) => s.id);
    expect(list).toEqual(['SAMPLE-001', 'SAMPLE-HTTP-001']);
  });

  test('scaffoldSample writes story.md + test.feature + meta.json with cliVersion', () => {
    const [web] = samplesForShape('web');
    const { written, skipped } = scaffoldSample(dir, web!, { cliVersion: '9.9.9' });
    expect(skipped).toEqual([]);
    expect(written.length).toBeGreaterThanOrEqual(3);
    const ticketDir = join(dir, '.xera', 'SAMPLE-001');
    expect(existsSync(join(ticketDir, 'story.md'))).toBe(true);
    expect(existsSync(join(ticketDir, 'test.feature'))).toBe(true);
    expect(existsSync(join(ticketDir, 'meta.json'))).toBe(true);
    const meta = JSON.parse(readFileSync(join(ticketDir, 'meta.json'), 'utf8'));
    expect(meta).toMatchObject({
      ticket: 'SAMPLE-001',
      adapter: 'web',
      source: 'local',
      xera_version: '9.9.9',
    });
  });

  test('scaffoldSample renders http sample with adapter=http', () => {
    const [http] = samplesForShape('api');
    scaffoldSample(dir, http!, { cliVersion: '1.2.3' });
    const meta = JSON.parse(readFileSync(join(dir, '.xera/SAMPLE-HTTP-001/meta.json'), 'utf8'));
    expect(meta.adapter).toBe('http');
    expect(meta.source).toBe('local');
    expect(meta.ticket).toBe('SAMPLE-HTTP-001');
  });

  test('scaffoldSample is idempotent — never clobbers existing files', () => {
    const [web] = samplesForShape('web');
    scaffoldSample(dir, web!, { cliVersion: '0.0.1' });
    // user edits the story
    const storyPath = join(dir, '.xera/SAMPLE-001/story.md');
    writeFileSync(storyPath, 'EDITED BY USER');
    const { written, skipped } = scaffoldSample(dir, web!, { cliVersion: '0.0.2' });
    expect(written).toEqual([]);
    expect(skipped.length).toBeGreaterThan(0);
    expect(readFileSync(storyPath, 'utf8')).toBe('EDITED BY USER');
  });

  test('detectInstalledSamples lists only present sample dirs', () => {
    expect(detectInstalledSamples(dir)).toEqual([]);
    mkdirSync(join(dir, '.xera/SAMPLE-001'), { recursive: true });
    expect(detectInstalledSamples(dir).map((s) => s.id)).toEqual(['SAMPLE-001']);
    mkdirSync(join(dir, '.xera/SAMPLE-HTTP-001'), { recursive: true });
    expect(
      detectInstalledSamples(dir)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['SAMPLE-001', 'SAMPLE-HTTP-001']);
  });

  test('removeSample deletes the dir and returns true; false on second call', () => {
    const [web] = samplesForShape('web');
    scaffoldSample(dir, web!, { cliVersion: '0.0.1' });
    expect(existsSync(join(dir, '.xera/SAMPLE-001'))).toBe(true);
    expect(removeSample(dir, web!)).toBe(true);
    expect(existsSync(join(dir, '.xera/SAMPLE-001'))).toBe(false);
    expect(removeSample(dir, web!)).toBe(false);
  });

  test('allSamples returns both web and http samples in stable order', () => {
    const ids = allSamples().map((s) => s.id);
    expect(ids).toEqual(['SAMPLE-001', 'SAMPLE-HTTP-001']);
  });
});
