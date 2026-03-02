/**
 * Application layer barrel export.
 */

export { shouldProcessFile, type FileFilterOptions } from './file-filter.js';
export { detectModuleLevelPatterns } from './module-level-detector.js';
export { processFile, type FileProcessingResult } from './file-processor.js';
export {
  AnalysisOrchestrator,
  type AnalysisOptions,
  type AnalysisDependencies,
} from './analysis-orchestrator.js';
export {
  processDeepAnalysis,
  type DeepAnalysisDependencies,
  type DeepAnalysisResult,
} from './deep-analysis-processor.js';
export { type AnalysisProgress, type ProgressCallback } from './analysis-progress.js';
export {
  estimateTokens,
  allocateBudget,
  truncateToTokenBudget,
  generateModulesManifest,
  type ModulesGeneratorDeps,
  generatePatternsManifest,
  type PatternsGeneratorDeps,
  generateDependenciesManifest,
  generateHotspotsManifest,
  generateSchemaManifest,
  generateManifests,
  type TokenBudget,
  type ManifestDependencies,
  type ManifestOptions,
} from './manifest/index.js';
