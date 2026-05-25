// @xera-ai/http — public exports

export { HttpAdapter } from './adapter';

export {
  defineHttpAuthSetup,
  type HttpAuthRoleCreds,
  type HttpAuthSetupFn,
  type HttpAuthSetupResult,
  presetHttpAuth,
  runHttpAuthSetup,
} from './auth-setup';
export {
  type RunHttpScenariosInput,
  type RunHttpScenariosResult,
  runHttpScenarios,
} from './executor';
export {
  type GenerateConfigInput,
  generateHttpPlaywrightConfig,
} from './executor/playwright-config';
export {
  type AttachTraceRecorderInput,
  attachTraceRecorder,
} from './executor/trace-recorder';
export {
  type ExtractedOperation,
  type ExtractedParam,
  type ExtractedResponse,
  type ExtractFilter,
  extractInfo,
  extractOperations,
  type FoundOperation,
  findOperation,
  loadOpenApi,
} from './openapi';
export {
  type NormalizedHttpRun,
  type NormalizedHttpScenario,
  normalizeHttpRun,
} from './trace-normalizer/normalize';
