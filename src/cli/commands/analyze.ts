/**
 * CLI analyze command - runs codebase analysis.
 */

import type { IFileSystem } from '@/domain/ports/index.js';
import { AnalysisOrchestrator } from '@/application/index.js';
import { loadConfig } from '@/config/loader.js';
import { createCompositionRoot } from '@/composition-root.js';
import { NodeFileSystem } from '@/adapters/filesystem/node-filesystem.js';

export async function analyzeCommand(
  options: { dir: string; full: boolean; dbPath?: string; inMemory?: boolean },
  fileSystem?: IFileSystem,
): Promise<void> {
  const fs = fileSystem ?? new NodeFileSystem();

  try {
    const config = await loadConfig(options.dir, fs);
    const { dependencies } = await createCompositionRoot(fs, {
      dbPath: options.dbPath ?? `${options.dir}/.heury/heury.db`,
      inMemory: options.inMemory ?? (fileSystem !== undefined),
    });

    const orchestrator = new AnalysisOrchestrator(dependencies);
    const result = await orchestrator.analyze({
      rootDir: config.rootDir,
      include: config.include,
      exclude: config.exclude,
    });

    if (result.success && result.stats) {
      console.log('Analysis complete:');
      console.log(`  Files processed: ${result.stats.filesProcessed}`);
      console.log(`  Code units: ${result.stats.codeUnitsExtracted}`);
      console.log(`  Patterns: ${result.stats.patternsDetected}`);
      console.log(`  Dependencies: ${result.stats.dependenciesFound}`);
      console.log(`  Env variables: ${result.stats.envVariablesFound}`);
      console.log(`  Duration: ${result.stats.duration}ms`);
    } else if (!result.success) {
      console.error(`Analysis failed: ${result.error ?? 'Unknown error'}`);
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
