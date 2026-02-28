/**
 * Extraction module barrel export.
 */

// Types
export type {
  CodeUnitDeclaration,
  FileDependencyInfo,
  DetectedPattern,
  PatternRule,
  PatternRuleSet,
  LanguageComplexityPatterns,
} from './types.js';

// Shared utilities
export {
  findBlockEnd,
  findBlockEndIndex,
  findIndentationBlockEnd,
  getLineNumber,
  isInsideStringOrComment,
  JS_COMMENT_SYNTAX,
  type CommentSyntax,
} from './shared/block-finder.js';

export {
  SQL_READ_PATTERNS,
  SQL_WRITE_PATTERNS,
  EXTERNAL_SERVICE_PATTERNS,
  type SharedPatternRule,
} from './shared/pattern-rules-shared.js';

// Function extractor
export { extractCodeUnits } from './function-extractor.js';

// Registry
export { LanguageRegistry, type LanguageExtractor } from './language-registry.js';

// Language extractors + registry factory
export { createLanguageRegistry } from './languages/index.js';
export { JavaScriptTypeScriptExtractor } from './languages/javascript-typescript.js';
export { GoExtractor } from './languages/go.js';
export { JavaExtractor } from './languages/java.js';
export { RustExtractor } from './languages/rust.js';
export { CSharpExtractor } from './languages/csharp.js';
export { PythonExtractor } from './languages/python.js';

// Core extraction services
export {
  detectPatterns,
  deriveNextJsApiPath,
  extractControllerPrefix,
  filterPatternsByType,
  groupPatternsByType,
} from './pattern-detector.js';

export {
  calculateComplexity,
  countConditionals,
  countLoops,
  calculateMaxNestingDepth,
  countTryCatchBlocks,
  countAsyncPatterns,
  calculateCallbackDepth,
  calculateParameterCount,
} from './complexity-calculator.js';

export { extractDependencies } from './dependency-extractor.js';

export {
  extractEnvVariables,
  isEnvExampleFile,
  type EnvVariable,
} from './env-extractor.js';

export {
  extractColumnAccess,
  extractBracketContent,
  extractObjectKeys,
  type ColumnAccess,
} from './column-extractor.js';
