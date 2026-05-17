export {
  type AreaReportRow,
  buildCoverageReport,
  type CoverageReport,
  type RenderOptions,
  renderMarkdown,
  type TicketReportRow,
} from './report';
export {
  computeAcGapScore,
  computeAreaRisk,
  RISK_WEIGHTS,
} from './risk';
export {
  type AcStatus,
  type AreaStatus,
  computeAcStatus,
  computeAreaStatus,
  computeScenarioStatus,
  computeTicketStatus,
  type ScenarioStatus,
  type TicketStatus,
} from './status';
export type { CoverageConfig } from './types';
export { DEFAULT_COVERAGE_CONFIG } from './types';
export {
  buildWhyArea,
  buildWhyTicket,
} from './why';
