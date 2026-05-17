export interface CoverageConfig {
  staleAfterDays: number;
  criticalAreas: string[];
  autoSnapshotOnCoverage: boolean;
}

export const DEFAULT_COVERAGE_CONFIG: CoverageConfig = {
  staleAfterDays: 30,
  criticalAreas: [],
  autoSnapshotOnCoverage: true,
};
