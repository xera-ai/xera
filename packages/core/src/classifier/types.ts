import type { Classification } from '../artifact/status';

export type { Classification };
export type Confidence = 'low' | 'medium' | 'high';

export interface ScenarioClassification {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  class: Classification;
  confidence: Confidence;
  rationale: string;
}

export interface ClassifyOutput {
  overall: Classification;
  overallConfidence: Confidence;
  scenarios: ScenarioClassification[];
}

export interface ClassifyContextInput {
  history: Array<{ ts: string; result: 'PASS' | 'FAIL'; class: Classification }>;
  storyHashChanged: boolean;
  specHashChanged: boolean;
  firstRun: boolean;
}
