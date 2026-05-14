import type { NormalizedRun, NormalizedScenario } from './scrub';

interface PWAttachment { name: string; path?: string; contentType?: string; }
interface PWResult { status: string; duration: number; error?: { message?: string; stack?: string }; attachments?: PWAttachment[]; }
interface PWTest { results: PWResult[]; }
interface PWSpec { title: string; ok: boolean; tests: PWTest[]; }
interface PWSuite { title: string; specs?: PWSpec[]; suites?: PWSuite[]; }
interface PWReport { stats: { unexpected: number }; suites: PWSuite[]; }

function* flatSpecs(suites: PWSuite[]): Generator<PWSpec> {
  for (const s of suites) {
    for (const sp of s.specs ?? []) yield sp;
    if (s.suites) yield* flatSpecs(s.suites);
  }
}

export function parsePlaywrightReport(report: PWReport, runId: string): NormalizedRun {
  const scenarios: NormalizedScenario[] = [];
  for (const spec of flatSpecs(report.suites)) {
    const lastResult = spec.tests[0]?.results[0];
    const outcome: 'PASS' | 'FAIL' | 'SKIPPED' =
      !lastResult ? 'SKIPPED' :
      lastResult.status === 'passed' ? 'PASS' :
      lastResult.status === 'skipped' ? 'SKIPPED' : 'FAIL';
    const sc: NormalizedScenario = { name: spec.title, outcome };
    if (outcome === 'FAIL' && lastResult) {
      const screenshot = lastResult.attachments?.find(a => a.name === 'screenshot')?.path;
      sc.failure = {
        errorMessage: lastResult.error?.message,
        screenshotPath: screenshot,
      };
    }
    scenarios.push(sc);
  }
  return {
    runId,
    outcome: report.stats.unexpected === 0 ? 'PASS' : 'FAIL',
    scenarios,
    scrubbed_fields_count: 0,
  };
}
