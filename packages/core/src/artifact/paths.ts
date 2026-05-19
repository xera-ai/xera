import { join } from 'node:path';

const TICKET_RE = /^[A-Z][A-Z0-9_]*-\d+$|^SAMPLE(?:-[A-Z][A-Z0-9_]*)?-\d+$/;

export interface RunPaths {
  runDir: string;
  reportJsonPath: string;
  tracePath: string;
  normalizedPath: string;
  screenshotsDir: string;
  videoDir: string;
}

export interface ArtifactPaths {
  ticketDir: string;
  storyPath: string;
  featurePath: string;
  specPath: string;
  pageObjectsDir: string;
  runsDir: string;
  metaPath: string;
  statusPath: string;
  logPath: string;
  lockPath: string;
  authDir: string;
  runPath: (runId: string) => RunPaths;
}

export function resolveArtifactPaths(repoRoot: string, ticket: string): ArtifactPaths {
  if (!TICKET_RE.test(ticket)) {
    throw new Error(
      `Invalid ticket key: "${ticket}" (expected e.g. JIRA-123, SAMPLE-001, or SAMPLE-HTTP-001)`,
    );
  }
  const ticketDir = join(repoRoot, '.xera', ticket);
  return {
    ticketDir,
    storyPath: join(ticketDir, 'story.md'),
    featurePath: join(ticketDir, 'test.feature'),
    specPath: join(ticketDir, 'spec.ts'),
    pageObjectsDir: join(ticketDir, 'page-objects'),
    runsDir: join(ticketDir, 'runs'),
    metaPath: join(ticketDir, 'meta.json'),
    statusPath: join(ticketDir, 'status.json'),
    logPath: join(ticketDir, 'xera.log'),
    lockPath: join(ticketDir, '.lock'),
    authDir: join(repoRoot, '.xera', '.auth'),
    runPath: (runId: string) => {
      const runDir = join(ticketDir, 'runs', runId);
      return {
        runDir,
        reportJsonPath: join(runDir, 'report.json'),
        tracePath: join(runDir, 'trace.zip'),
        normalizedPath: join(runDir, 'normalized.json'),
        screenshotsDir: join(runDir, 'screenshots'),
        videoDir: join(runDir, 'videos'),
      };
    },
  };
}

export function generateRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-').replace('Z', '');
}
