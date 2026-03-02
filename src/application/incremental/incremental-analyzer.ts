/**
 * Incremental Analyzer
 *
 * Processes only files that changed since the last analysis, rather than
 * re-analyzing the entire codebase. For each changed file:
 *   - deleted: removes all stored data for the file path
 *   - added/modified: removes old data, then re-extracts using FileProcessor
 *   - renamed: removes data under old path, extracts under new path
 *
 * Structural analysis (clusters, templates, circular deps) is skipped —
 * those are only computed during full analysis.
 */

import { isAbsolute, join } from 'node:path';

import type {
  ICodeUnitRepository,
  IFileDependencyRepository,
  IEnvVariableRepository,
  IFileSystem,
  IGuardClauseRepository,
} from '@/domain/ports/index.js';
import { createFileDependency } from '@/domain/models/index.js';
import type { LanguageRegistry } from '@/extraction/language-registry.js';
import { shouldProcessFile } from '@/application/file-filter.js';
import { processFile } from '@/application/file-processor.js';
import { extractEnvVariables, isEnvExampleFile } from '@/extraction/env-extractor.js';
import { createEnvVariable } from '@/domain/models/index.js';
import type { ChangedFile } from './git-diff-parser.js';

export interface IncrementalAnalysisResult {
  readonly success: boolean;
  readonly filesAdded: number;
  readonly filesModified: number;
  readonly filesDeleted: number;
  readonly error?: string;
}

export interface IncrementalAnalysisDependencies {
  readonly fileSystem: IFileSystem;
  readonly codeUnitRepo: ICodeUnitRepository;
  readonly dependencyRepo: IFileDependencyRepository;
  readonly envVarRepo: IEnvVariableRepository;
  readonly guardClauseRepo?: IGuardClauseRepository;
  readonly languageRegistry: LanguageRegistry;
}

interface IncrementalConfig {
  readonly rootDir: string;
  readonly include: string[];
  readonly exclude: string[];
}

/**
 * Resolve a file path against rootDir if it is relative.
 */
function resolveFilePath(filePath: string, rootDir: string): string {
  return isAbsolute(filePath) ? filePath : join(rootDir, filePath);
}

/**
 * Delete all stored data for a file path: code units, dependencies,
 * env variables (via clear for .env files), and guard clauses.
 */
function clearDataForFile(
  filePath: string,
  deps: IncrementalAnalysisDependencies,
): void {
  // Clear guard clauses for each code unit in this file
  if (deps.guardClauseRepo) {
    const units = deps.codeUnitRepo.findByFilePath(filePath);
    for (const unit of units) {
      clearGuardClausesRecursive(unit, deps.guardClauseRepo);
    }
  }

  deps.codeUnitRepo.deleteByFilePath(filePath);
  deps.dependencyRepo.deleteBySourceFile(filePath);
}

/**
 * Recursively clear guard clause data for a code unit and its children.
 */
function clearGuardClausesRecursive(
  unit: { id: string; children: Array<{ id: string; children: Array<unknown> }> },
  guardClauseRepo: IGuardClauseRepository,
): void {
  guardClauseRepo.deleteByCodeUnitId(unit.id);
  for (const child of unit.children) {
    clearGuardClausesRecursive(
      child as typeof unit,
      guardClauseRepo,
    );
  }
}

/**
 * Extract and store data for a single file.
 */
async function extractFile(
  filePath: string,
  config: IncrementalConfig,
  deps: IncrementalAnalysisDependencies,
): Promise<void> {
  const extractor = deps.languageRegistry.getExtractorForFile(filePath);
  if (!extractor) return;

  const absolutePath = resolveFilePath(filePath, config.rootDir);
  const content = await deps.fileSystem.readFile(absolutePath);
  const result = processFile(content, filePath, extractor);

  deps.codeUnitRepo.saveBatch(result.codeUnits);

  for (const dep of result.dependencies) {
    deps.dependencyRepo.save(
      createFileDependency({
        sourceFile: filePath,
        targetFile: dep.targetFile,
        importType: dep.importType,
        importedNames: dep.importedNames,
      }),
    );
  }
}

/**
 * Handle .env.example file changes by clearing and re-extracting env variables.
 */
async function handleEnvFile(
  filePath: string,
  changeType: ChangedFile['changeType'],
  config: IncrementalConfig,
  deps: IncrementalAnalysisDependencies,
): Promise<void> {
  if (changeType === 'deleted') {
    deps.envVarRepo.clear();
    return;
  }

  // For added/modified, re-extract
  deps.envVarRepo.clear();
  const absolutePath = resolveFilePath(filePath, config.rootDir);
  const content = await deps.fileSystem.readFile(absolutePath);
  const envVars = extractEnvVariables(content);
  for (const envVar of envVars) {
    deps.envVarRepo.save(
      createEnvVariable({
        name: envVar.name,
        description: envVar.description,
        hasDefault: envVar.hasDefault,
        lineNumber: envVar.lineNumber,
      }),
    );
  }
}

/**
 * Check whether a file should be processed based on language support
 * and include/exclude config.
 */
function shouldProcess(
  filePath: string,
  config: IncrementalConfig,
  deps: IncrementalAnalysisDependencies,
): boolean {
  // Must have a recognized language extractor
  const hasExtractor = shouldProcessFile(
    filePath,
    deps.languageRegistry,
    { include: config.include, exclude: config.exclude },
  );
  return hasExtractor;
}

/**
 * Analyze only changed files incrementally.
 *
 * For each changed file:
 *   - deleted: delete all stored data
 *   - added/modified: delete old data, re-extract
 *   - renamed: delete old path data, extract new path
 *
 * Structural analysis (clusters, templates, circular deps) is skipped.
 */
export async function analyzeIncremental(
  changedFiles: ChangedFile[],
  config: IncrementalConfig,
  deps: IncrementalAnalysisDependencies,
): Promise<IncrementalAnalysisResult> {
  let filesAdded = 0;
  let filesModified = 0;
  let filesDeleted = 0;

  for (const changed of changedFiles) {
    try {
      // Handle .env.example files specially
      if (isEnvExampleFile(changed.filePath)) {
        await handleEnvFile(changed.filePath, changed.changeType, config, deps);
        if (changed.changeType === 'added') filesAdded++;
        else if (changed.changeType === 'modified') filesModified++;
        else if (changed.changeType === 'deleted') filesDeleted++;
        continue;
      }

      switch (changed.changeType) {
        case 'deleted': {
          clearDataForFile(changed.filePath, deps);
          filesDeleted++;
          break;
        }

        case 'added': {
          if (!shouldProcess(changed.filePath, config, deps)) continue;
          await extractFile(changed.filePath, config, deps);
          filesAdded++;
          break;
        }

        case 'modified': {
          if (!shouldProcess(changed.filePath, config, deps)) continue;
          clearDataForFile(changed.filePath, deps);
          await extractFile(changed.filePath, config, deps);
          filesModified++;
          break;
        }

        case 'renamed': {
          // Clear old path data
          if (changed.oldPath) {
            clearDataForFile(changed.oldPath, deps);
          }
          // Extract at new path
          if (!shouldProcess(changed.filePath, config, deps)) continue;
          clearDataForFile(changed.filePath, deps);
          await extractFile(changed.filePath, config, deps);
          filesAdded++;
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Warning: Failed to process changed file '${changed.filePath}': ${message}`,
      );
      // Continue processing other files
    }
  }

  return {
    success: true,
    filesAdded,
    filesModified,
    filesDeleted,
  };
}
