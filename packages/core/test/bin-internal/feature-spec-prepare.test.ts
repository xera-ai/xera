import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { featureSpecPrepareCmd } from '../../src/bin-internal/feature-spec-prepare';
import { validateFeatureCmd } from '../../src/bin-internal/validate-feature';

const MOCK_SPEC = join(import.meta.dirname, '../../../../fixtures/mock-api/openapi.yaml');
const originalCwd = process.cwd();

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'xera-feat-spec-'));
  process.chdir(root);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}
function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

describe('feature-spec-prepare', () => {
  test('writes spec-input, synthetic story, and meta from --spec', async () => {
    const code = await featureSpecPrepareCmd(['API-PETS-001', '--spec', MOCK_SPEC]);
    expect(code).toBe(0);

    const specInput = readJson('.xera/API-PETS-001/spec-input.json');
    expect(specInput.source).toBe('openapi');
    expect(specInput.key).toBe('API-PETS-001');
    expect((specInput.operations as unknown[]).length).toBe(3);
    expect(typeof specInput.spec_hash).toBe('string');

    const meta = readJson('.xera/API-PETS-001/meta.json');
    expect(meta.adapter).toBe('http');
    expect(meta.source).toBe('openapi');
    expect(meta.spec_hash).toBe(specInput.spec_hash);
    expect(meta.story_hash).toBe(specInput.spec_hash);

    const story = read('.xera/API-PETS-001/story.md');
    expect(story.startsWith('---\nticketId: API-PETS-001\n')).toBe(true);
    expect(story).toContain('acceptanceCriteriaSource: openapi');
    expect(story).toContain('storyHash: ' + (specInput.spec_hash as string));
  });

  test('is idempotent when the spec is unchanged', async () => {
    await featureSpecPrepareCmd(['API-PETS-001', '--spec', MOCK_SPEC]);
    const first = readJson('.xera/API-PETS-001/meta.json').fetched_at;
    await featureSpecPrepareCmd(['API-PETS-001', '--spec', MOCK_SPEC]);
    const second = readJson('.xera/API-PETS-001/meta.json').fetched_at;
    expect(second).toBe(first); // skip path did not re-stamp
  });

  test('detects drift when the filter changes the operation slice', async () => {
    await featureSpecPrepareCmd(['API-PETS-001', '--spec', MOCK_SPEC]);
    const fullHash = readJson('.xera/API-PETS-001/spec-input.json').spec_hash;
    await featureSpecPrepareCmd(['API-PETS-001', '--spec', MOCK_SPEC, '--path', '/users']);
    const sliced = readJson('.xera/API-PETS-001/spec-input.json');
    expect(sliced.spec_hash).not.toBe(fullHash);
    expect((sliced.operations as unknown[]).length).toBe(1);
    expect(sliced.filter).toEqual({ paths: ['/users'] });
  });

  test('writes empty spec-input with a reason when filter matches nothing', async () => {
    const code = await featureSpecPrepareCmd([
      'API-PETS-001',
      '--spec',
      MOCK_SPEC,
      '--tag',
      'nope',
    ]);
    expect(code).toBe(0);
    const specInput = readJson('.xera/API-PETS-001/spec-input.json');
    expect((specInput.operations as unknown[]).length).toBe(0);
    expect(specInput.reason as string).toContain('filter matched no operations');
  });

  test('writes empty spec-input when the spec is unreachable', async () => {
    const code = await featureSpecPrepareCmd([
      'API-PETS-001',
      '--spec',
      join(root, 'missing.yaml'),
    ]);
    expect(code).toBe(0);
    const specInput = readJson('.xera/API-PETS-001/spec-input.json');
    expect((specInput.operations as unknown[]).length).toBe(0);
    expect(typeof specInput.reason).toBe('string');
  });

  test('writes empty spec-input when no spec is configured', async () => {
    const code = await featureSpecPrepareCmd(['API-NOCFG-001']);
    expect(code).toBe(0);
    const specInput = readJson('.xera/API-NOCFG-001/spec-input.json');
    expect((specInput.operations as unknown[]).length).toBe(0);
    expect(typeof specInput.reason).toBe('string');
  });

  test('rejects an invalid ticket key', async () => {
    await expect(featureSpecPrepareCmd(['not-a-key', '--spec', MOCK_SPEC])).rejects.toThrow();
  });

  // Guards that the API-flavored Gherkin vocabulary prescribed by
  // feature-from-openapi.md parses as valid Gherkin (generation is LLM-driven
  // and not run in CI, so we validate a representative hand-authored feature).
  test('a representative from-spec feature passes validate-feature', async () => {
    await featureSpecPrepareCmd(['API-PETS-001', '--spec', MOCK_SPEC]);
    const feature = `Feature: API-PETS-001: Mock API
  Generated from openapi.yaml, 3 operations.

  Background:
    Given I am authenticated

  Scenario: Create a user
    When I send a POST request to "/users"
    Then the response status should be 201
    And the response body has the required field "id"

  Scenario: Get a user by id
    When I send a GET request to "/users/1"
    Then the response status should be 200
    And the response body has the required field "email"

  Scenario: Unknown user returns 404
    When I send a GET request to "/users/999"
    Then the response status should be 404
`;
    mkdirSync(join(root, '.xera/API-PETS-001'), { recursive: true });
    writeFileSync(join(root, '.xera/API-PETS-001/test.feature'), feature);
    expect(await validateFeatureCmd(['API-PETS-001'])).toBe(0);
  });
});
