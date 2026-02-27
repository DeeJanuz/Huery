/**
 * Analysis Orchestrator
 *
 * Coordinates the full code analysis pipeline:
 * 1. List all files in the project
 * 2. Filter files through the file filter
 * 3. Process each file through the extraction pipeline
 * 4. Store results in repositories
 * 5. Process .env.example files
 * 6. Return analysis stats
 *
 * Simplified from Ludflow's distributed orchestrator for local-first use.
 */

import {
  createAnalysisResult,
  createAnalysisStats,
  createFileDependency,
  createEnvVariable,
  type AnalysisResult,
} from '@/domain/models/index.js';
import type {
  ICodeUnitRepository,
  IFileDependencyRepository,
  IEnvVariableRepository,
  IFileSystem,
} from '@/domain/ports/index.js';
import type { LanguageRegistry } from '@/extraction/language-registry.js';
import { extractEnvVariables, isEnvExampleFile } from '@/extraction/env-extractor.js';
import { shouldProcessFile, type FileFilterOptions } from './file-filter.js';
import { processFile } from './file-processor.js';

export interface AnalysisOptions {
  readonly rootDir: string;
  readonly include?: string[];
  readonly exclude?: string[];
  readonly skipTests?: boolean;
}

export interface AnalysisDependencies {
  readonly codeUnitRepo: ICodeUnitRepository;
  readonly dependencyRepo: IFileDependencyRepository;
  readonly envVarRepo: IEnvVariableRepository;
  readonly fileSystem: IFileSystem;
  readonly languageRegistry: LanguageRegistry;
}

export class AnalysisOrchestrator {
  constructor(private readonly deps: AnalysisDependencies) {}

  /**
   * Full analysis - processes all files in the project.
   */
  async analyze(options: AnalysisOptions): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const allFiles = await this.listAllFiles(options.rootDir);
      const filterOpts = this.buildFilterOptions(options);
      const counts = await this.processFiles(allFiles, {
        filterOpts,
        clearBeforeProcessing: false,
      });

      const duration = Date.now() - startTime;

      return createAnalysisResult({
        success: true,
        stats: createAnalysisStats({ ...counts, duration }),
      });
    } catch (error) {
      return createAnalysisResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Incremental analysis - only processes changed files.
   * Clears old data for changed files before re-processing.
   */
  async analyzeIncremental(
    options: AnalysisOptions,
    changedFiles: string[],
  ): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      const filterOpts = this.buildFilterOptions(options);
      const counts = await this.processFiles(changedFiles, {
        filterOpts,
        clearBeforeProcessing: true,
      });

      const duration = Date.now() - startTime;

      return createAnalysisResult({
        success: true,
        stats: createAnalysisStats({ ...counts, duration }),
      });
    } catch (error) {
      return createAnalysisResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Shared file processing loop used by both analyze() and analyzeIncremental().
   */
  private async processFiles(
    files: string[],
    options: {
      filterOpts: Partial<FileFilterOptions>;
      clearBeforeProcessing: boolean;
    },
  ): Promise<{
    filesProcessed: number;
    codeUnitsExtracted: number;
    patternsDetected: number;
    dependenciesFound: number;
    envVariablesFound: number;
  }> {
    let filesProcessed = 0;
    let codeUnitsExtracted = 0;
    let patternsDetected = 0;
    let dependenciesFound = 0;
    let envVariablesFound = 0;

    for (const filePath of files) {
      // Handle .env.example files
      if (isEnvExampleFile(filePath)) {
        const content = await this.deps.fileSystem.readFile(filePath);
        const envVars = extractEnvVariables(content);
        if (options.clearBeforeProcessing) {
          this.deps.envVarRepo.clear();
        }
        for (const envVar of envVars) {
          this.deps.envVarRepo.save(createEnvVariable({
            name: envVar.name,
            description: envVar.description,
            hasDefault: envVar.hasDefault,
            lineNumber: envVar.lineNumber,
          }));
        }
        envVariablesFound += envVars.length;
        continue;
      }

      // Filter code files
      if (!shouldProcessFile(filePath, this.deps.languageRegistry, options.filterOpts)) {
        continue;
      }

      // Clear old data for this file when doing incremental processing
      if (options.clearBeforeProcessing) {
        this.deps.codeUnitRepo.deleteByFilePath(filePath);
        this.deps.dependencyRepo.deleteBySourceFile(filePath);
      }

      const result = await this.processOneFile(filePath);
      filesProcessed++;
      codeUnitsExtracted += result.codeUnitsCount;
      patternsDetected += result.patternsCount;
      dependenciesFound += result.dependenciesCount;
    }

    return {
      filesProcessed,
      codeUnitsExtracted,
      patternsDetected,
      dependenciesFound,
      envVariablesFound,
    };
  }

  private async processOneFile(filePath: string): Promise<{
    codeUnitsCount: number;
    patternsCount: number;
    dependenciesCount: number;
  }> {
    const extractor = this.deps.languageRegistry.getExtractorForFile(filePath);
    if (!extractor) {
      return { codeUnitsCount: 0, patternsCount: 0, dependenciesCount: 0 };
    }

    const content = await this.deps.fileSystem.readFile(filePath);
    const result = processFile(content, filePath, extractor);

    // Store code units
    this.deps.codeUnitRepo.saveBatch(result.codeUnits);

    // Store dependencies as FileDependency domain objects
    for (const dep of result.dependencies) {
      this.deps.dependencyRepo.save(createFileDependency({
        sourceFile: filePath,
        targetFile: dep.targetFile,
        importType: dep.importType,
        importedNames: dep.importedNames,
      }));
    }

    // Count patterns (in code units + module level)
    let patternsCount = result.moduleLevelPatterns.length;
    for (const unit of result.codeUnits) {
      patternsCount += unit.patterns.length;
    }

    return {
      codeUnitsCount: result.codeUnits.length,
      patternsCount,
      dependenciesCount: result.dependencies.length,
    };
  }

  /**
   * Recursively list all files under the given directory.
   */
  private async listAllFiles(dir: string): Promise<string[]> {
    const allFiles: string[] = [];
    await this.walkDirectory(dir, allFiles);
    return allFiles;
  }

  private async walkDirectory(dir: string, accumulator: string[]): Promise<void> {
    const entries = await this.deps.fileSystem.listFiles(dir);
    for (const entry of entries) {
      const isDir = await this.deps.fileSystem.isDirectory(entry);
      if (isDir) {
        await this.walkDirectory(entry, accumulator);
      } else {
        accumulator.push(entry);
      }
    }
  }

  private buildFilterOptions(options: AnalysisOptions): Partial<FileFilterOptions> {
    return {
      include: options.include ?? [],
      exclude: options.exclude ?? [],
      skipTests: options.skipTests ?? false,
    };
  }
}
