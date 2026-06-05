import { acCoverageBackfillFinalizeCmd } from './ac-coverage-backfill-finalize';
import { acCoverageBackfillPrepareCmd } from './ac-coverage-backfill-prepare';
import { authSetupCmd } from './auth-setup';
import { classifyDriftCmd } from './classify-drift';
import { contractHealPrepareCmd } from './contract-heal-prepare';
import { coveragePrepareCmd } from './coverage-prepare';
import { disputesCmd } from './disputes';
import { doctorCmd } from './doctor';
import { evalDeterministicCmd } from './eval-deterministic';
import { evalPrepareCmd } from './eval-prepare';
import { evalReportCmd } from './eval-report';
import { execCmd } from './exec';
import { exploreFinalizeCmd } from './explore-finalize';
import { explorePrepareCmd } from './explore-prepare';
import { featureSpecPrepareCmd } from './feature-spec-prepare';
import { fetchCmd } from './fetch';
import { fillGapFinalizeCmd } from './fill-gap-finalize';
import { fillGapPrepareCmd } from './fill-gap-prepare';
import { graphBackfillCmd } from './graph-backfill';
import { graphEnrichCmd } from './graph-enrich';
import { graphQueryCmd } from './graph-query';
import { graphRecordCmd } from './graph-record';
import { graphRenderCmd } from './graph-render';
import { graphSnapshotCmd } from './graph-snapshot';
import { healPrepareCmd } from './heal-prepare';
import { httpAuthDiscoverFinalize, httpAuthDiscoverPrepare } from './http-auth-discover';
import { impactPrepareCmd } from './impact-prepare';
import { lintCmd } from './lint';
import { normalizeCmd } from './normalize';
import { openapiResolveCmd } from './openapi-resolve';
import { postCmd } from './post';
import { promoteCmd } from './promote';
import { reportCmd } from './report';
import { stageAuthCmd } from './stage-auth';
import { statusCmd } from './status-cmd';
import { typecheckCmd } from './typecheck';
import { unlockCmd } from './unlock';
import { validateFeatureCmd } from './validate-feature';
import { verifyPromptsCmd } from './verify-prompts';

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  'ac-coverage-backfill-finalize': acCoverageBackfillFinalizeCmd,
  'ac-coverage-backfill-prepare': acCoverageBackfillPrepareCmd,
  'auth-setup': authSetupCmd,
  'classify-drift': classifyDriftCmd,
  'contract-heal-prepare': contractHealPrepareCmd,
  'coverage-prepare': coveragePrepareCmd,
  disputes: disputesCmd,
  doctor: doctorCmd,
  'eval-deterministic': evalDeterministicCmd,
  'eval-prepare': evalPrepareCmd,
  'eval-report': evalReportCmd,
  exec: execCmd,
  'explore-finalize': exploreFinalizeCmd,
  'explore-prepare': explorePrepareCmd,
  'feature-spec-prepare': featureSpecPrepareCmd,
  'fill-gap-finalize': fillGapFinalizeCmd,
  'fill-gap-prepare': fillGapPrepareCmd,
  fetch: fetchCmd,
  'graph-backfill': graphBackfillCmd,
  'graph-enrich': graphEnrichCmd,
  'graph-render': graphRenderCmd,
  'graph-query': graphQueryCmd,
  'graph-record': graphRecordCmd,
  'graph-snapshot': graphSnapshotCmd,
  'heal-prepare': healPrepareCmd,
  'http-auth-discover-finalize': httpAuthDiscoverFinalize,
  'http-auth-discover-prepare': httpAuthDiscoverPrepare,
  'impact-prepare': impactPrepareCmd,
  lint: lintCmd,
  normalize: normalizeCmd,
  'openapi-resolve': openapiResolveCmd,
  post: postCmd,
  promote: promoteCmd,
  report: reportCmd,
  'stage-auth': stageAuthCmd,
  status: statusCmd,
  typecheck: typecheckCmd,
  unlock: unlockCmd,
  'validate-feature': validateFeatureCmd,
  'verify-prompts': verifyPromptsCmd,
};

export async function run(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || !COMMANDS[cmd]) {
    console.error(
      `Usage: xera-internal <command> [args...]\nCommands: ${Object.keys(COMMANDS).join(', ')}`,
    );
    return 1;
  }
  try {
    return await COMMANDS[cmd]!(rest);
  } catch (err) {
    console.error(`[xera:${cmd}] failed: ${(err as Error).message}`);
    return 4;
  }
}
