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

import { basename, isAbsolute, join } from 'node:path';
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
  IFunctionCallRepository,
  ITypeFieldRepository,
  IEventFlowRepository,
  ISchemaModelRepository,
  IFileSystem,
} from '@/domain/ports/index.js';
import type { LanguageRegistry } from '@/extraction/language-registry.js';
import { extractEnvVariables, isEnvExampleFile } from '@/extraction/env-extractor.js';
import { shouldProcessFile, type FileFilterOptions } from './file-filter.js';
import { processFile, type FileProcessingResult } from './file-processor.js';
import { processDeepAnalysis } from './deep-analysis-processor.js';

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
  // Deep analysis (optional — if provided, deep analysis runs after file processing)
  readonly functionCallRepo?: IFunctionCallRepository;
  readonly typeFieldRepo?: ITypeFieldRepository;
  readonly eventFlowRepo?: IEventFlowRepository;
  readonly schemaModelRepo?: ISchemaModelRepository;
}

export class AnalysisOrchestrator {
  constructor(private readonly deps: AnalysisDependencies) {}

  /**
   * Full analysis - processes all files in the project.
   */
  async analyze(options: AnalysisOptions): Promise<AnalysisResult> {
    const startTime = Date.now();

    try {
      this.clearAllData();
      const allFiles = await this.listAllFiles(options.rootDir);
      const filterOpts = this.buildFilterOptions(options);
      const counts = await this.processFiles(allFiles, {
        rootDir: options.rootDir,
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
        rootDir: options.rootDir,
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
  /**
   * Resolve a file path against rootDir if it is relative.
   * Absolute paths are returned as-is.
   */
  private resolveFilePath(filePath: string, rootDir: string): string {
    return isAbsolute(filePath) ? filePath : join(rootDir, filePath);
  }

  private async processFiles(
    files: string[],
    options: {
      rootDir: string;
      filterOpts: Partial<FileFilterOptions>;
      clearBeforeProcessing: boolean;
    },
  ): Promise<{
    filesProcessed: number;
    codeUnitsExtracted: number;
    patternsDetected: number;
    dependenciesFound: number;
    envVariablesFound: number;
    filesWithErrors: number;
  }> {
    let filesProcessed = 0;
    let codeUnitsExtracted = 0;
    let patternsDetected = 0;
    let dependenciesFound = 0;
    let envVariablesFound = 0;
    let filesWithErrors = 0;

    // Collect results for deep analysis
    const allFileResults: FileProcessingResult[] = [];
    const allFileContents = new Map<string, string>();

    for (const filePath of files) {
      const absolutePath = this.resolveFilePath(filePath, options.rootDir);

      // Handle .env.example files
      if (isEnvExampleFile(filePath)) {
        const content = await this.deps.fileSystem.readFile(absolutePath);
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
      const isCodeFile = shouldProcessFile(filePath, this.deps.languageRegistry, options.filterOpts);

      if (!isCodeFile) {
        // Only .prisma files need reading for schema model extraction
        if (this.hasDeepAnalysisDeps() && filePath.endsWith('.prisma')) {
          try {
            const content = await this.deps.fileSystem.readFile(absolutePath);
            allFileContents.set(filePath, content);
          } catch {
            // Ignore read errors — schema extraction is best-effort
          }
        }
        continue;
      }

      // Clear old data for this file when doing incremental processing
      if (options.clearBeforeProcessing) {
        // Clear deep data BEFORE code units — deep clearing needs the unit IDs
        this.clearDeepDataForFile(filePath);
        this.deps.codeUnitRepo.deleteByFilePath(filePath);
        this.deps.dependencyRepo.deleteBySourceFile(filePath);
      }

      try {
        const result = await this.processOneFile(filePath, options.rootDir);
        filesProcessed++;
        codeUnitsExtracted += result.codeUnitsCount;
        patternsDetected += result.patternsCount;
        dependenciesFound += result.dependenciesCount;

        // Collect for deep analysis
        if (result.fileResult) {
          allFileResults.push(result.fileResult);
        }
        if (result.content !== undefined) {
          allFileContents.set(filePath, result.content);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Failed to process file '${filePath}': ${message}`);
        filesWithErrors++;
      }
    }

    // Run deep analysis if repositories are provided
    if (this.hasDeepAnalysisDeps()) {
      processDeepAnalysis(allFileResults, allFileContents, {
        functionCallRepo: this.deps.functionCallRepo!,
        typeFieldRepo: this.deps.typeFieldRepo!,
        eventFlowRepo: this.deps.eventFlowRepo!,
        schemaModelRepo: this.deps.schemaModelRepo!,
      });
    }

    return {
      filesProcessed,
      codeUnitsExtracted,
      patternsDetected,
      dependenciesFound,
      envVariablesFound,
      filesWithErrors,
    };
  }

  /**
   * Clear all repository data before a full analysis run.
   */
  private clearAllData(): void {
    this.deps.codeUnitRepo.clear();
    this.deps.dependencyRepo.clear();
    this.deps.envVarRepo.clear();
    if (this.hasDeepAnalysisDeps()) {
      this.deps.functionCallRepo!.clear();
      this.deps.typeFieldRepo!.clear();
      this.deps.eventFlowRepo!.clear();
      this.deps.schemaModelRepo!.clear();
    }
  }

  /**
   * Check whether all deep analysis repositories have been provided.
   */
  private hasDeepAnalysisDeps(): boolean {
    return !!(
      this.deps.functionCallRepo &&
      this.deps.typeFieldRepo &&
      this.deps.eventFlowRepo &&
      this.deps.schemaModelRepo
    );
  }

  /**
   * Clear deep analysis data for a file during incremental re-processing.
   * Uses code units to find relevant unit IDs, then clears deep data by those IDs.
   */
  private clearDeepDataForFile(filePath: string): void {
    if (!this.hasDeepAnalysisDeps()) return;

    const units = this.deps.codeUnitRepo.findByFilePath(filePath);
    for (const unit of units) {
      this.clearDeepDataForUnit(unit);
    }

    // Schema models are indexed by filePath directly
    this.deps.schemaModelRepo!.deleteByFilePath(filePath);
  }

  /**
   * Clear deep analysis data for a single code unit and its children recursively.
   */
  private clearDeepDataForUnit(unit: { id: string; children: Array<{ id: string; children: Array<unknown> }> }): void {
    this.deps.functionCallRepo!.deleteByCallerUnitId(unit.id);
    this.deps.typeFieldRepo!.deleteByParentUnitId(unit.id);
    this.deps.eventFlowRepo!.deleteByCodeUnitId(unit.id);

    for (const child of unit.children) {
      this.clearDeepDataForUnit(child as typeof unit);
    }
  }

  private async processOneFile(filePath: string, rootDir: string): Promise<{
    codeUnitsCount: number;
    patternsCount: number;
    dependenciesCount: number;
    fileResult?: FileProcessingResult;
    content?: string;
  }> {
    const extractor = this.deps.languageRegistry.getExtractorForFile(filePath);
    if (!extractor) {
      return { codeUnitsCount: 0, patternsCount: 0, dependenciesCount: 0 };
    }

    const absolutePath = this.resolveFilePath(filePath, rootDir);
    const content = await this.deps.fileSystem.readFile(absolutePath);
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
      fileResult: result,
      content,
    };
  }

  /**
   * Recursively list all files under the given directory.
   */
  private async listAllFiles(dir: string): Promise<string[]> {
    const skipDirs = new Set(this.deps.languageRegistry.getAllSkipDirectories());
    const allFiles: string[] = [];
    await this.walkDirectory(dir, allFiles, skipDirs);
    return allFiles;
  }

  private async walkDirectory(dir: string, accumulator: string[], skipDirs: Set<string>): Promise<void> {
    const entries = await this.deps.fileSystem.listFiles(dir);
    for (const entry of entries) {
      const isDir = await this.deps.fileSystem.isDirectory(entry);
      if (isDir) {
        const dirName = basename(entry);
        if (skipDirs.has(dirName)) continue;
        if (dirName.startsWith('.') && dirName !== '.github') continue;
        await this.walkDirectory(entry, accumulator, skipDirs);
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
