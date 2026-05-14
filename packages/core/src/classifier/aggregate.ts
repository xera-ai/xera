import type { ClassifyOutput, ScenarioClassification, Confidence } from './types';

const CLASS_PRIORITY: Array<ClassifyOutput['overall']> = [
  'REAL_BUG', 'TEST_BUG', 'SELECTOR_DRIFT', 'FLAKY', 'PASS',
];

const CONF_RANK: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export function aggregateScenarios(scenarios: ScenarioClassification[]): ClassifyOutput {
  if (scenarios.length === 0) {
    return { overall: 'PASS', overallConfidence: 'low', scenarios: [] };
  }
  if (scenarios.every(s => s.outcome === 'PASS')) {
    return { overall: 'PASS', overallConfidence: 'high', scenarios };
  }
  let chosen: ClassifyOutput['overall'] = 'PASS';
  for (const cls of CLASS_PRIORITY) {
    if (scenarios.some(s => s.class === cls)) { chosen = cls; break; }
  }
  const matching = scenarios.filter(s => s.class === chosen);
  const minConf = matching.reduce<Confidence>(
    (acc, s) => CONF_RANK[s.confidence] < CONF_RANK[acc] ? s.confidence : acc,
    'high',
  );
  return { overall: chosen, overallConfidence: minConf, scenarios };
}
