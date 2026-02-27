/**
 * File Processor
 *
 * Processes a single file through the full extraction pipeline:
 * code unit extraction, complexity calculation, pattern detection,
 * dependency extraction, and module-level pattern detection.
 */

import { randomUUID } from 'node:crypto';
import {
  createCodeUnit,
  createCodeUnitPattern,
  calculateComplexityScore,
  type CodeUnit,
} from '@/domain/models/index.js';
import type { DetectedPattern, FileDependencyInfo, CodeUnitDeclaration, LanguageComplexityPatterns, PatternRuleSet } from '@/extraction/types.js';
import type { LanguageExtractor } from '@/extraction/language-registry.js';
import { calculateComplexity } from '@/extraction/complexity-calculator.js';
import { detectPatterns } from '@/extraction/pattern-detector.js';
import { detectModuleLevelPatterns } from './module-level-detector.js';

/**
 * Extract the body of a code unit from file content using line ranges.
 * Falls back to decl.body if available.
 */
function extractBody(
  content: string,
  lines: string[],
  decl: CodeUnitDeclaration,
): string {
  if (decl.body) return decl.body;
  // Extract from content using line numbers (1-indexed)
  const start = Math.max(0, decl.lineStart - 1);
  const end = Math.min(lines.length, decl.lineEnd);
  return lines.slice(start, end).join('\n');
}

/**
 * Build a CodeUnit from a declaration, generating the ID upfront so patterns
 * reference the correct codeUnitId without needing double creation.
 */
function buildCodeUnit(
  decl: CodeUnitDeclaration,
  content: string,
  lines: string[],
  filePath: string,
  extractor: LanguageExtractor,
  complexityPatterns: LanguageComplexityPatterns,
  patternRules: PatternRuleSet,
): CodeUnit {
  const id = randomUUID();
  const body = extractBody(content, lines, decl);
  const complexity = calculateComplexity(body, complexityPatterns, decl.signature);
  const complexityScore = calculateComplexityScore(complexity);
  const detectedPatterns = detectPatterns(body, patternRules, filePath);

  const patterns = detectedPatterns.map(p =>
    createCodeUnitPattern({
      codeUnitId: id,
      patternType: p.patternType,
      patternValue: p.patternValue,
      lineNumber: p.lineNumber,
      columnAccess: p.columnAccess,
    }),
  );

  const children = (decl.children ?? []).map(child =>
    buildCodeUnit(child, content, lines, filePath, extractor, complexityPatterns, patternRules),
  );

  return createCodeUnit({
    id,
    filePath,
    name: decl.name,
    unitType: decl.unitType,
    lineStart: decl.lineStart,
    lineEnd: decl.lineEnd,
    signature: decl.signature,
    isAsync: decl.isAsync,
    isExported: decl.isExported,
    language: extractor.languageId,
    complexity: complexity as unknown as Record<string, number>,
    complexityScore,
    patterns,
    children,
  });
}

export interface FileProcessingResult {
  readonly filePath: string;
  readonly codeUnits: CodeUnit[];
  readonly dependencies: FileDependencyInfo[];
  readonly moduleLevelPatterns: DetectedPattern[];
}

/**
 * Process a single file through the full extraction pipeline.
 *
 * @param content - The file content
 * @param filePath - The file path
 * @param extractor - The language extractor for this file type
 * @returns Processing result with code units, dependencies, and patterns
 */
export function processFile(
  content: string,
  filePath: string,
  extractor: LanguageExtractor,
): FileProcessingResult {
  if (!content) {
    return {
      filePath,
      codeUnits: [],
      dependencies: [],
      moduleLevelPatterns: [],
    };
  }

  // 1. Extract code unit declarations
  const declarations = extractor.extractCodeUnits(content, filePath);
  const complexityPatterns = extractor.getComplexityPatterns();
  const patternRules = extractor.getPatternRules();
  const lines = content.split('\n');

  // 2-4. For each declaration, build domain objects with correct IDs from the start
  const codeUnits: CodeUnit[] = [];
  const codeUnitLineRanges: Array<{ lineStart: number; lineEnd: number }> = [];

  for (const decl of declarations) {
    const unit = buildCodeUnit(decl, content, lines, filePath, extractor, complexityPatterns, patternRules);
    codeUnits.push(unit);
    codeUnitLineRanges.push({ lineStart: decl.lineStart, lineEnd: decl.lineEnd });
  }

  // 5. Extract dependencies
  const dependencies = extractor.extractDependencies(content, filePath);

  // 6. Detect module-level patterns
  const moduleLevelPatterns = detectModuleLevelPatterns(
    content,
    codeUnitLineRanges,
    patternRules,
    filePath,
  );

  return {
    filePath,
    codeUnits,
    dependencies,
    moduleLevelPatterns,
  };
}
