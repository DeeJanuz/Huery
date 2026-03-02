/**
 * CLI analyze command - runs codebase analysis.
 */

import type { IFileSystem } from '@/domain/ports/index.js';
import { AnalysisOrchestrator, generateManifests, type AnalysisDependencies } from '@/application/index.js';
import { analyzeIncremental } from '@/application/incremental/incremental-analyzer.js';
import { getChangedFilesSinceCommit } from '@/application/incremental/git-diff-parser.js';
import type { HeuryConfig } from '@/domain/ports/config-provider.js';
import { loadConfig } from '@/config/loader.js';
import { createCompositionRoot } from '@/composition-root.js';
import { NodeFileSystem } from '@/adapters/filesystem/node-filesystem.js';
import { createProgressRenderer } from '../progress-renderer.js';

export interface AnalyzeOptions {
  dir: string;
  full: boolean;
  incremental?: boolean;
  dbPath?: string;
  inMemory?: boolean;
}

async function runManifestGeneration(
  dependencies: AnalysisDependencies,
  options: AnalyzeOptions,
  config: HeuryConfig,
  fs: IFileSystem,
): Promise<void> {
  await generateManifests(
    {
      codeUnitRepo: dependencies.codeUnitRepo,
      dependencyRepo: dependencies.dependencyRepo,
      envVarRepo: dependencies.envVarRepo,
      fileSystem: fs,
      typeFieldRepo: dependencies.typeFieldRepo,
      eventFlowRepo: dependencies.eventFlowRepo,
      schemaModelRepo: dependencies.schemaModelRepo,
      functionCallRepo: dependencies.functionCallRepo,
      fileClusterRepo: dependencies.fileClusterRepo,
      patternTemplateRepo: dependencies.patternTemplateRepo,
    },
    {
      outputDir: `${options.dir}/${config.outputDir}`,
      totalTokenBudget: config.manifestTokenBudget,
    },
  );
}

export async function analyzeCommand(
  options: AnalyzeOptions,
  fileSystem?: IFileSystem,
): Promise<void> {
  const fs = fileSystem ?? new NodeFileSystem();

  try {
    const config = await loadConfig(options.dir, fs);
    const dbPath = options.dbPath ?? `${options.dir}/.heury/heury.db`;
    const { dependencies } = await createCompositionRoot(fs, {
      dbPath,
      inMemory: options.inMemory ?? (fileSystem !== undefined),
    });

    if (options.incremental) {
      await runIncrementalAnalysis(options, config, dependencies, fs);
      return;
    }

    const orchestrator = new AnalysisOrchestrator(dependencies);
    const progress = createProgressRenderer();
    const result = await orchestrator.analyze({
      rootDir: config.rootDir,
      include: config.include,
      exclude: config.exclude,
      onProgress: progress.onProgress,
    });

    if (result.success && result.stats) {
      progress.onProgress({
        phase: 'manifests',
        filesProcessed: result.stats.filesProcessed,
        totalFiles: result.stats.filesProcessed,
        codeUnitsExtracted: result.stats.codeUnitsExtracted,
        patternsDetected: result.stats.patternsDetected,
        dependenciesFound: result.stats.dependenciesFound,
      });

      await runManifestGeneration(dependencies, options, config, fs);

      progress.finish();

      console.log('Analysis complete:');
      console.log(`  Files processed: ${result.stats.filesProcessed}`);
      console.log(`  Code units: ${result.stats.codeUnitsExtracted}`);
      console.log(`  Patterns: ${result.stats.patternsDetected}`);
      console.log(`  Dependencies: ${result.stats.dependenciesFound}`);
      console.log(`  Env variables: ${result.stats.envVariablesFound}`);
      console.log(`  Duration: ${result.stats.duration}ms`);

      const manifestList = dependencies.schemaModelRepo
        ? 'MODULES.md, PATTERNS.md, DEPENDENCIES.md, HOTSPOTS.md, SCHEMA.md'
        : 'MODULES.md, PATTERNS.md, DEPENDENCIES.md, HOTSPOTS.md';
      console.log(`  Manifests: ${manifestList}`);
    } else if (!result.success) {
      console.error(`Analysis failed: ${result.error ?? 'Unknown error'}`);
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runIncrementalAnalysis(
  options: AnalyzeOptions,
  config: HeuryConfig,
  dependencies: AnalysisDependencies,
  fs: IFileSystem,
): Promise<void> {
  const changedFiles = await getChangedFilesSinceCommit('HEAD~1', config.rootDir);

  const result = await analyzeIncremental(
    changedFiles,
    { rootDir: config.rootDir, include: config.include, exclude: config.exclude },
    {
      fileSystem: fs,
      codeUnitRepo: dependencies.codeUnitRepo,
      dependencyRepo: dependencies.dependencyRepo,
      envVarRepo: dependencies.envVarRepo,
      guardClauseRepo: dependencies.guardClauseRepo,
      languageRegistry: dependencies.languageRegistry,
    },
  );

  if (result.success) {
    console.log(
      `Incremental analysis: ${result.filesAdded} added, ${result.filesModified} modified, ${result.filesDeleted} deleted`,
    );

    await runManifestGeneration(dependencies, options, config, fs);
  } else {
    console.error(`Incremental analysis failed: ${result.error ?? 'Unknown error'}`);
  }
}
