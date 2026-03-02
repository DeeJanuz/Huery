/**
 * Analysis Progress Types
 *
 * Defines the callback pattern for live progress reporting during analysis.
 * The application layer emits progress via an optional callback,
 * and the CLI layer consumes and renders it.
 */

export interface AnalysisProgress {
  readonly phase: 'analyzing' | 'deep-analysis' | 'manifests';
  readonly filesProcessed: number;
  readonly totalFiles: number;
  readonly filesSkipped: number;
  readonly codeUnitsExtracted: number;
  readonly patternsDetected: number;
  readonly dependenciesFound: number;
  readonly currentFile?: string;
  readonly deepAnalysisStep?: string;
  readonly deepAnalysisProgress?: string;
}

export type ProgressCallback = (progress: AnalysisProgress) => void;
