// @xera-ai/http — public exports
// Filled in by later phases:
//   export { HttpAdapter } from './adapter';
//   export { normalizeHttpRun } from './trace-normalizer/normalize';
export {
  defineHttpAuthSetup,
  type HttpAuthRoleCreds,
  type HttpAuthSetupFn,
  type HttpAuthSetupResult,
  presetHttpAuth,
  runHttpAuthSetup,
} from './auth-setup';
export { type FoundOperation, findOperation, loadOpenApi } from './openapi';
