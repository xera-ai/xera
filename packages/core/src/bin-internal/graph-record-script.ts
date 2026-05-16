import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolveArtifactPaths } from '../artifact/paths';
import { appendEvents } from '../graph/store';
import type {
  EdgeDiscoveredPayload,
  Event,
  PomGeneratedPayload,
  ScenarioGeneratedPayload,
} from '../graph/types';
import { SCHEMA_VERSION } from '../graph/types';
import { ulid } from '../graph/ulid';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const sId = (ticket: string, name: string) =>
  sha1(`${ticket}:${name.trim().toLowerCase().replace(/\s+/g, ' ')}`);
const pId = (file: string) => sha1(basename(file));
const nowIso = () => new Date().toISOString();
const mk = <T extends Event['type']>(
  actor: string,
  type: T,
  payload: Extract<Event, { type: T }>['payload'],
): Event =>
  ({
    event_id: ulid(),
    schema_version: SCHEMA_VERSION,
    ts: nowIso(),
    actor,
    type,
    payload,
  }) as Event;

const P0_KEYWORDS = [
  'log in',
  'login',
  'sign in',
  'signin',
  'sign up',
  'signup',
  'auth',
  'authentic',
  'payment',
  'pay ',
  'checkout',
  'purchase',
  'charge',
  'password',
  'credential',
  'admin',
  'permission',
  'role',
  'must ',
  'critical',
];

function inferPriority(name: string, gherkin: string): 'p0' | 'p1' {
  const haystack = `${name} ${gherkin}`.toLowerCase();
  for (const kw of P0_KEYWORDS) {
    if (haystack.includes(kw)) return 'p0';
  }
  return 'p1';
}

function parseFeature(
  text: string,
): Array<{ name: string; priority: 'p0' | 'p1' | 'p2'; gherkin: string }> {
  const scenarios: Array<{ name: string; priority: 'p0' | 'p1' | 'p2'; gherkin: string }> = [];
  const lines = text.split('\n');
  let explicitTag: 'p0' | 'p1' | 'p2' | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line.startsWith('@')) {
      const tag = line.slice(1).split(/\s+/)[0]!.toLowerCase();
      if (tag === 'p0' || tag === 'p1' || tag === 'p2') explicitTag = tag;
      i++;
      continue;
    }
    if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
      const name = line.replace(/^Scenario( Outline)?:\s*/, '');
      const start = i;
      i++;
      while (
        i < lines.length &&
        !lines[i]!.trim().startsWith('Scenario') &&
        !lines[i]!.trim().startsWith('@')
      )
        i++;
      const gherkin = lines.slice(start, i).join('\n');
      const priority = explicitTag !== null ? explicitTag : inferPriority(name, gherkin);
      scenarios.push({ name, priority, gherkin });
      explicitTag = null;
      continue;
    }
    i++;
  }
  return scenarios;
}

function listPomFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f));
}

function extractRoute(pomContent: string): string {
  const m = pomContent.match(/goto\s*\(\s*['"]([^'"]+)['"]/);
  return m ? m[1]! : '';
}

function extractLocators(pomContent: string): string[] {
  const out: string[] = [];
  const re = /\b(getByRole|getByLabel|getByText|getByTestId|locator)\s*\(\s*([^)]+)\)/g;
  let m = re.exec(pomContent);
  while (m !== null) {
    out.push(`${m[1]}(${m[2]})`);
    m = re.exec(pomContent);
  }
  return out;
}

function extractPomUsage(specContent: string): string[] {
  const names = new Set<string>();
  const re = /new\s+([A-Z][A-Za-z0-9]*Page)\s*\(/g;
  let m = re.exec(specContent);
  while (m !== null) {
    names.add(m[1]!);
    m = re.exec(specContent);
  }
  return [...names];
}

export async function recordScriptImpl(repoRoot: string, ticket: string): Promise<number> {
  const paths = resolveArtifactPaths(repoRoot, ticket);
  const { ticketDir, featurePath, specPath } = paths;
  const pomDir = join(ticketDir, 'page-objects');

  if (!existsSync(featurePath)) {
    console.error(`[graph-record script] feature missing`);
    return 1;
  }

  const featureText = readFileSync(featurePath, 'utf8');
  const featureHash = sha1(featureText);
  const scenarios = parseFeature(featureText);

  const events: Event[] = [];
  for (const s of scenarios) {
    const id = sId(ticket, s.name);
    const p: ScenarioGeneratedPayload = {
      scenarioId: id,
      ticketId: ticket,
      name: s.name,
      gherkin: s.gherkin,
      priority: s.priority,
      featureHash,
      generatedAt: nowIso(),
    };
    events.push(mk('xera-script', 'scenario.generated', p));
  }

  const pomFiles = listPomFiles(pomDir);
  const pomNameToId = new Map<string, string>();
  for (const pomFile of pomFiles) {
    const content = readFileSync(pomFile, 'utf8');
    const id = pId(pomFile);
    const className = content.match(/export\s+class\s+([A-Z][A-Za-z0-9]*Page)/)?.[1] ?? '';
    pomNameToId.set(className, id);
    const pg: PomGeneratedPayload = {
      pomId: id,
      ticketId: ticket,
      filePath: pomFile.replace(`${repoRoot}/`, ''),
      route: extractRoute(content),
      locators: extractLocators(content),
      scope: 'local',
    };
    events.push(mk('xera-script', 'pom.generated', pg));
  }

  if (existsSync(specPath)) {
    const specContent = readFileSync(specPath, 'utf8');
    const usedPoms = extractPomUsage(specContent);
    for (const scenario of scenarios) {
      const scId = sId(ticket, scenario.name);
      for (const pomName of usedPoms) {
        const pid = pomNameToId.get(pomName);
        if (!pid) continue;
        const ep: EdgeDiscoveredPayload = {
          kind: 'uses',
          from: scId,
          to: pid,
          source: 'xera-script',
        };
        events.push(mk('xera-script', 'edge.discovered', ep));
      }
    }
  }

  for (const [, id] of pomNameToId) {
    const pom = events.find(
      (e) => e.type === 'pom.generated' && (e.payload as PomGeneratedPayload).pomId === id,
    );
    if (!pom) continue;
    const route = (pom.payload as PomGeneratedPayload).route;
    if (!route) continue;
    const slug =
      route
        .replace(/^\//, '')
        .split('/')[0]!
        .replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase() || 'root';
    const ep: EdgeDiscoveredPayload = { kind: 'covers', from: id, to: slug, source: 'xera-script' };
    events.push(mk('xera-script', 'edge.discovered', ep));
  }

  appendEvents(repoRoot, events, { skill: 'xera-script', ticketId: ticket });
  return 0;
}
