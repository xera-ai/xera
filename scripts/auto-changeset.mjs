#!/usr/bin/env node
/**
 * Auto-generate a changeset from a PR's title + diff.
 *
 * Triggered by .github/workflows/auto-changeset.yml on PR open/synchronize/edited.
 *
 * Rules:
 *  - PR title MUST follow conventional commits: `<type>(<scope>)?<!>?: <summary>`
 *    (e.g. `feat(cli): add foo`, `fix: bar`, `feat!: breaking change`).
 *  - Bump type:
 *      `feat`              → minor
 *      `feat!` / `BREAKING CHANGE` in body → major
 *      `fix`, `perf`, `revert` → patch
 *      `docs|chore|test|refactor|style|build|ci` → no changeset (skip).
 *  - Affected packages = every non-private package under `packages/<pkg>/`
 *    whose files appear in `git diff --name-only origin/<base>...HEAD`.
 *  - Output: `.changeset/auto-pr-<N>.md` (regenerated on each run so PR title
 *    edits are reflected). Manual changesets (any file not matching that name)
 *    are left alone and take precedence.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const baseRef = process.env.BASE_REF;
const prTitle = process.env.PR_TITLE ?? '';
const prBody = process.env.PR_BODY ?? '';
const prNumber = process.env.PR_NUMBER;

if (!baseRef || !prNumber) {
  console.error('Missing required env: BASE_REF, PR_NUMBER');
  process.exit(1);
}

const autoFile = `.changeset/auto-pr-${prNumber}.md`;

// --- 1. If a manual changeset (not auto-pr-N.md) already exists in this PR, skip
const changedFiles = execSync(`git diff --name-only origin/${baseRef}...HEAD`, {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const manualChangeset = changedFiles.find(
  (f) =>
    f.startsWith('.changeset/') && f.endsWith('.md') && !f.endsWith('README.md') && f !== autoFile,
);
if (manualChangeset) {
  console.log(`Manual changeset present (${manualChangeset}). Skipping auto-generation.`);
  process.exit(0);
}

// --- 2. Parse PR title
const titleMatch = prTitle.match(/^(\w+)(?:\(([^)]+)\))?(!?)\s*:\s*(.+)$/);
if (!titleMatch) {
  console.log(`PR title "${prTitle}" not in conventional-commits format. Skipping.`);
  process.exit(0);
}
const [, type, , bang, summary] = titleMatch;

// --- 3. Decide bump type
const skipTypes = new Set(['docs', 'chore', 'test', 'refactor', 'style', 'build', 'ci']);
if (skipTypes.has(type)) {
  console.log(`Type '${type}' does not require a changeset. Skipping.`);
  process.exit(0);
}
const hasBreaking = bang === '!' || /BREAKING\s*CHANGE/.test(prBody);
let bump;
if (hasBreaking) bump = 'major';
else if (type === 'feat') bump = 'minor';
else bump = 'patch'; // fix | perf | revert | anything else not in skip list

// --- 4. Detect changed publishable packages
const changedPkgs = new Set();
for (const f of changedFiles) {
  const m = f.match(/^packages\/([^/]+)\//);
  if (!m) continue;
  const pkgDir = m[1];
  const pjPath = `packages/${pkgDir}/package.json`;
  if (!existsSync(pjPath)) continue;
  const pj = JSON.parse(readFileSync(pjPath, 'utf8'));
  if (pj.private) continue;
  changedPkgs.add(pj.name);
}

if (changedPkgs.size === 0) {
  console.log('No publishable package source files changed. Skipping.');
  process.exit(0);
}

// --- 5. Write the changeset
const frontmatter = Array.from(changedPkgs)
  .sort()
  .map((p) => `'${p}': ${bump}`)
  .join('\n');

const body = `${summary} (auto-generated from #${prNumber})`;
const content = `---\n${frontmatter}\n---\n\n${body}\n`;

writeFileSync(autoFile, content);
console.log(`Wrote ${autoFile}`);
console.log(`  bump: ${bump}`);
console.log(`  packages: ${Array.from(changedPkgs).join(', ')}`);
