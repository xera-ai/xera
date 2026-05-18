import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { HttpAuthStrategy, ProjectShape } from './init';

const require = createRequire(import.meta.url);
const CLI_VERSION = (require('../package.json') as { version: string }).version;

export interface InitUpdateOptions {
  yes: boolean;
  shape?: ProjectShape;
  // Carried through only to render a useful copy-paste snippet when --shape
  // requests adapters that aren't in the existing xera.config.ts. --update
  // itself never mutates xera.config.ts or shared/auth-setup.ts; see warning.
  apiBaseUrl?: string;
  openapiPath?: string;
  authStrategy?: HttpAuthStrategy;
  httpRoles?: string;
  stagingUrl?: string;
  authEnabled?: boolean;
  roles?: string;
}

function detectAdaptersFromConfig(cwd: string): string[] | null {
  const configPath = join(cwd, 'xera.config.ts');
  if (!existsSync(configPath)) return null;
  const cfg = readFileSync(configPath, 'utf8');
  const m = cfg.match(/adapters:\s*\[([^\]]+)\]/);
  if (!m) return null;
  return (m[1]!.match(/'(\w+)'/g) ?? []).map((s) => s.slice(1, -1));
}

function adaptersForShape(shape: ProjectShape): string[] {
  if (shape === 'web') return ['web'];
  if (shape === 'api') return ['http'];
  return ['web', 'http'];
}

function renderHttpConfigSnippet(opts: InitUpdateOptions): string {
  const baseUrl = opts.apiBaseUrl ?? 'https://api.staging.example.com';
  const strategy: HttpAuthStrategy = opts.authStrategy ?? 'bearer';
  const roles = (opts.httpRoles ?? 'user')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const rolesBlock = roles
    .map((r) => `        ${r}: { tokenEnv: '${r.toUpperCase().replace(/-/g, '_')}_BEARER_TOKEN' },`)
    .join('\n');
  const specLine = opts.openapiPath ? `    spec: '${opts.openapiPath}',\n` : '';
  return [
    `  http: {`,
    `    baseUrl: { staging: '${baseUrl}' },`,
    `    defaultEnv: 'staging',`,
    `${specLine}    auth: {`,
    `      strategy: '${strategy}',`,
    `      roles: {`,
    rolesBlock,
    `      },`,
    `    },`,
    `  },`,
  ].join('\n');
}

function renderWebConfigSnippet(opts: InitUpdateOptions): string {
  const baseUrl = opts.stagingUrl ?? 'https://staging.example.com';
  const roles = (opts.roles ?? 'admin,regular')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const authBlock =
    opts.authEnabled === false
      ? ''
      : `    auth: {
      strategy: 'storageState',
      setupScript: './shared/auth-setup.ts',
      roles: {
${roles
  .map(
    (r) =>
      `        ${r}: { envEmail: 'TEST_${r.toUpperCase().replace(/-/g, '_')}_EMAIL', envPassword: 'TEST_${r.toUpperCase().replace(/-/g, '_')}_PWD' },`,
  )
  .join('\n')}
      },
    },
`;
  return [
    `  web: {`,
    `    baseUrl: { staging: '${baseUrl}' },`,
    `    defaultEnv: 'staging',`,
    authBlock + `  },`,
  ].join('\n');
}

const HTTP_AUTH_SETUP_SNIPPET = `import { defineHttpAuthSetup, presetHttpAuth } from '@xera-ai/http';

export const http = defineHttpAuthSetup(async (request, role, creds) => {
  return presetHttpAuth({
    request,
    role,
    config: (globalThis as Record<string, unknown>).__XERA_HTTP_CONFIG__ as never,
  });
});`;

const WEB_AUTH_SETUP_SNIPPET = `import { defineAuthSetup } from '@xera-ai/web';

export const web = defineAuthSetup(async (page, _role, creds) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/.*\\/dashboard/);
  return { expiresAt: Date.now() + 8 * 3600 * 1000 };
});`;

export async function initUpdateCommand(opts: InitUpdateOptions): Promise<void> {
  const cwd = process.cwd();
  p.intro(pc.cyan('xera init --update'));

  // Bump deps to latest
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    p.cancel('No package.json found — run `xera init` first.');
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = pkg.dependencies ?? {};
  // Bump existing entries to latest; only add adapters that were already present
  pkg.dependencies['@xera-ai/core'] = `^${CLI_VERSION}`;
  pkg.dependencies['@xera-ai/prompts'] = `^${CLI_VERSION}`;
  if (pkg.dependencies['@xera-ai/web']) pkg.dependencies['@xera-ai/web'] = `^${CLI_VERSION}`;
  if (pkg.dependencies['@xera-ai/http']) pkg.dependencies['@xera-ai/http'] = `^${CLI_VERSION}`;

  pkg.scripts = pkg.scripts ?? {};
  pkg.scripts['xera:auth-setup'] = 'xera-internal auth-setup';
  pkg.scripts['xera:graph-record'] = 'xera-internal graph-record';
  pkg.scripts['xera:graph-snapshot'] = 'xera-internal graph-snapshot';
  pkg.scripts['xera:graph-query'] = 'xera-internal graph-query';
  pkg.scripts['xera:graph-backfill'] = 'xera-internal graph-backfill';
  pkg.scripts['xera:graph-enrich'] = 'xera-internal graph-enrich';
  pkg.scripts['xera:graph-render'] = 'xera-internal graph-render';
  pkg.scripts['xera:coverage-prepare'] = 'xera-internal coverage-prepare';
  pkg.scripts['xera:impact-prepare'] = 'xera-internal impact-prepare';
  pkg.scripts['xera:heal-prepare'] = 'xera-internal heal-prepare';
  pkg.scripts['xera:disputes'] = 'xera-internal disputes';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Scaffold GitHub Actions viewer workflow (v0.6.3+)
  const wfDir = join(cwd, '.github/workflows');
  mkdirSync(wfDir, { recursive: true });
  try {
    const cliPkgPath = require.resolve('@xera-ai/cli/package.json');
    const cliTplPath = join(cliPkgPath, '..', 'templates/xera-graph.yml.template');
    copyFileSync(cliTplPath, join(wfDir, 'xera-graph.yml'));
    p.log.info('scaffolded .github/workflows/xera-graph.yml');
  } catch (_e) {
    // CLI templates not resolvable in this environment; skip workflow scaffold.
    // Users can re-run `xera init` to get it.
    p.log.warn('skipped xera-graph.yml scaffold (re-run `xera init` to create it)');
  }

  // Refresh skills with 3-way diff. init.ts now writes skills as
  //   .claude/skills/<name>/SKILL.md      — Claude Code's Skill tool requires
  //                                         the directory + SKILL.md layout
  //   .claude/commands/<name>.md          — slash command (flat .md)
  // The update has to refresh both targets, and also migrate legacy projects
  // that have the old flat .claude/skills/<name>.md layout (pre-PR #105) —
  // those won't be discovered by the Skill tool until they're moved.
  const skillsSrc = require.resolve('@xera-ai/skills/package.json');
  const newSkillsDir = join(skillsSrc, '..');
  const SKILL_IGNORE = new Set(['package.json', 'version.json', 'CHANGELOG.md']);

  for (const name of readdirSync(newSkillsDir)) {
    if (SKILL_IGNORE.has(name)) continue;
    if (!name.endsWith('.md')) continue;
    const newContent = readFileSync(join(newSkillsDir, name), 'utf8');
    const base = name.replace(/\.md$/, '');
    const skillPath = join(cwd, '.claude/skills', base, 'SKILL.md');
    const legacyFlatSkillPath = join(cwd, '.claude/skills', name);
    const cmdPath = join(cwd, '.claude/commands', name);

    // Migrate legacy flat layout: if the old flat file exists and the new
    // directory/SKILL.md doesn't, treat the legacy file's content as the
    // current "local" state (so the user gets a single overwrite prompt
    // instead of losing edits), then delete the legacy file.
    let migratedLegacy = false;
    if (existsSync(legacyFlatSkillPath) && !existsSync(skillPath)) {
      const legacyContent = readFileSync(legacyFlatSkillPath, 'utf8');
      mkdirSync(dirname(skillPath), { recursive: true });
      writeFileSync(skillPath, legacyContent);
      unlinkSync(legacyFlatSkillPath);
      migratedLegacy = true;
    }

    const targets: { path: string; state: 'missing' | 'same' | 'diff' }[] = [];
    for (const path of [skillPath, cmdPath]) {
      if (!existsSync(path)) {
        targets.push({ path, state: 'missing' });
      } else {
        const content = readFileSync(path, 'utf8');
        targets.push({ path, state: content === newContent ? 'same' : 'diff' });
      }
    }

    if (targets.every((s) => s.state === 'missing')) {
      for (const { path } of targets) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, newContent);
      }
      p.log.info(`+ ${name}`);
      continue;
    }

    if (targets.every((s) => s.state === 'same')) {
      if (migratedLegacy) p.log.success(`migrated ${name} to .claude/skills/${base}/SKILL.md`);
      else p.log.info(`= ${name}`);
      continue;
    }

    // At least one target is missing or different — prompt once, apply to both.
    const choice = await p.select({
      message: `${name} differs from package version`,
      options: [
        { value: 'keep', label: 'Keep local' },
        { value: 'overwrite', label: 'Overwrite with package version' },
      ],
    });
    if (choice === 'overwrite') {
      for (const { path } of targets) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, newContent);
      }
      p.log.success(`overwrote ${name}`);
    } else {
      if (migratedLegacy) p.log.success(`migrated ${name} to .claude/skills/${base}/SKILL.md`);
      p.log.warn(`kept local ${name}`);
    }
  }

  // --shape and shape-related flags (--au, --as, --hr, --su, --ro, --op,
  // --auth-enabled) are deliberately NOT applied here — the non-destructive
  // guarantee means we don't rewrite xera.config.ts or shared/auth-setup.ts
  // out from under user edits. But we MUST tell the user when their flags
  // would have changed the shape so they don't think the upgrade succeeded
  // silently. See issue #91.
  const hasShapeFlags =
    opts.apiBaseUrl !== undefined ||
    opts.openapiPath !== undefined ||
    opts.authStrategy !== undefined ||
    opts.httpRoles !== undefined ||
    opts.stagingUrl !== undefined ||
    opts.authEnabled !== undefined ||
    opts.roles !== undefined;

  if (opts.shape !== undefined) {
    const current = detectAdaptersFromConfig(cwd);
    if (current === null) {
      p.log.warn(
        '--shape was provided but could not detect existing adapters in xera.config.ts. Skipping shape check.',
      );
    } else {
      const requested = adaptersForShape(opts.shape);
      const missing = requested.filter((a) => !current.includes(a));
      const extra = current.filter((a) => !requested.includes(a));

      if (missing.length === 0 && extra.length === 0) {
        p.log.info(
          `shape '${opts.shape}' already matches existing adapters [${current.join(', ')}]`,
        );
      } else {
        if (missing.length > 0) {
          const lines: string[] = [
            `--shape ${opts.shape} requested but xera.config.ts has adapters: [${current.join(', ')}]`,
            `Missing adapter(s): ${missing.join(', ')}`,
            ``,
            `init --update is non-destructive — it will NOT modify xera.config.ts or shared/auth-setup.ts.`,
            `To complete the upgrade, hand-edit both files:`,
            ``,
            `1. In xera.config.ts, change \`adapters: [${current.map((a) => `'${a}'`).join(', ')}]\` to \`adapters: [${requested.map((a) => `'${a}'`).join(', ')}]\` and add this block inside defineConfig({...}):`,
            ``,
          ];
          for (const a of missing) {
            lines.push(a === 'http' ? renderHttpConfigSnippet(opts) : renderWebConfigSnippet(opts));
            lines.push('');
          }
          lines.push(`2. In shared/auth-setup.ts, add this export:`);
          lines.push('');
          for (const a of missing) {
            lines.push(a === 'http' ? HTTP_AUTH_SETUP_SNIPPET : WEB_AUTH_SETUP_SNIPPET);
            lines.push('');
          }
          lines.push(
            `3. Add ${missing.includes('http') ? `\`@xera-ai/http\`` : ''}${missing.includes('http') && missing.includes('web') ? ' and ' : ''}${missing.includes('web') ? `\`@xera-ai/web\`` : ''} to dependencies (re-run \`xera init --update\` after editing to bump versions), then run \`xera doctor\` to verify.`,
          );
          p.log.warn(lines.join('\n'));
        }
        if (extra.length > 0) {
          p.log.warn(
            `--shape ${opts.shape} would remove adapter(s) [${extra.join(', ')}] from xera.config.ts, but init --update never removes config. Remove the block(s) by hand if intended.`,
          );
        }
      }
    }
  } else if (hasShapeFlags) {
    p.log.warn(
      'Shape-related flags (--au/--as/--hr/--su/--ro/--op/--auth-enabled) are ignored by init --update without --shape. To change shape, pass --shape <web|api|mixed> alongside.',
    );
  }

  p.outro(pc.green('Update complete. Run `xera doctor` to verify.'));
}
