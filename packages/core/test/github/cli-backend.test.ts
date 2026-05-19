import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGithubCliBackend } from '../../src/github/cli-backend';

// Build a fake `gh` shim. The script inspects argv to decide which canned
// response to emit. `issue view <n> --repo r/r --json …` returns issue JSON;
// `issue comment <n> --repo r/r --body-file -` echoes the comment URL.
const FAKE_GH = `#!/usr/bin/env bash
set -e
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  cat <<'EOF'
{"number": 42, "title": "Login fails on Safari", "body": "Steps:\\n1. Open\\n2. Try login\\n\\n## Acceptance Criteria\\n- Login works on Safari", "labels": [{"name": "bug"}], "assignees": [], "url": "https://github.com/owner/repo/issues/42"}
EOF
elif [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  cat -
  echo
  echo "https://github.com/owner/repo/issues/42#issuecomment-9999"
else
  echo "unexpected args: $@" >&2
  exit 2
fi
`;

const FAKE_GH_FAIL = `#!/usr/bin/env bash
echo "gh: HTTP 404: Not Found" >&2
exit 1
`;

let tmpDir: string;
let ghOk: string;
let ghFail: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'xera-gh-shim-'));
  ghOk = join(tmpDir, 'gh-ok.sh');
  ghFail = join(tmpDir, 'gh-fail.sh');
  writeFileSync(ghOk, FAKE_GH);
  writeFileSync(ghFail, FAKE_GH_FAIL);
  chmodSync(ghOk, 0o755);
  chmodSync(ghFail, 0o755);
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true });
});

describe('github cli-backend', () => {
  test('fetchTicket parses gh issue view JSON', async () => {
    const c = createGithubCliBackend({ repo: 'owner/repo', ghBin: ghOk });
    const t = await c.fetchTicket('GH-42');
    expect(t.key).toBe('GH-42');
    expect(t.summary).toBe('Login fails on Safari');
    expect(t.story).toContain('Acceptance Criteria');
    expect(t.attachments).toEqual([]);
  });

  test('fetchTicket rejects malformed keys', async () => {
    const c = createGithubCliBackend({ repo: 'owner/repo', ghBin: ghOk });
    await expect(c.fetchTicket('PROJ-1')).rejects.toThrow(/GH-<number>/);
  });

  test('postComment returns the issue url surfaced by gh', async () => {
    const c = createGithubCliBackend({ repo: 'owner/repo', ghBin: ghOk });
    const r = await c.postComment('GH-42', 'hello from xera');
    expect(r.id).toMatch(/issuecomment-/);
  });

  test('fetchTicket surfaces gh failures with stderr', async () => {
    const c = createGithubCliBackend({ repo: 'owner/repo', ghBin: ghFail });
    await expect(c.fetchTicket('GH-1')).rejects.toThrow(/404/);
  });
});
