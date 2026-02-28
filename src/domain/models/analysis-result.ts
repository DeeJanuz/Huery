export interface AnalysisStats {
  readonly filesProcessed: number;
  readonly codeUnitsExtracted: number;
  readonly patternsDetected: number;
  readonly dependenciesFound: number;
  readonly envVariablesFound: number;
  readonly filesWithErrors: number;
  readonly duration: number;
}

export interface AnalysisResult {
  readonly success: boolean;
  readonly error?: string;
  readonly stats?: AnalysisStats;
}

interface CreateAnalysisResultParams {
  success: boolean;
  error?: string;
  stats?: AnalysisStats;
}

export function createAnalysisResult(params: CreateAnalysisResultParams): AnalysisResult {
  return {
    success: params.success,
    error: params.error,
    stats: params.stats,
  };
}

interface CreateAnalysisStatsParams {
  filesProcessed: number;
  codeUnitsExtracted: number;
  patternsDetected: number;
  dependenciesFound: number;
  envVariablesFound: number;
  filesWithErrors: number;
  duration: number;
}

export function createAnalysisStats(params: CreateAnalysisStatsParams): AnalysisStats {
  const values = Object.values(params);
  for (const value of values) {
    if (value < 0) {
      throw new Error('All numeric fields must be >= 0');
    }
  }

  return {
    filesProcessed: params.filesProcessed,
    codeUnitsExtracted: params.codeUnitsExtracted,
    patternsDetected: params.patternsDetected,
    dependenciesFound: params.dependenciesFound,
    envVariablesFound: params.envVariablesFound,
    filesWithErrors: params.filesWithErrors,
    duration: params.duration,
  };
}
