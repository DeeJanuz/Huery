import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AnalysisOrchestrator } from '@/application/analysis-orchestrator.js';
import type { AnalysisDependencies, AnalysisOptions } from '@/application/analysis-orchestrator.js';
import type { ProgressCallback, AnalysisProgress } from '@/application/analysis-progress.js';
import { createLanguageRegistry } from '@/extraction/languages/index.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFileDependencyRepository,
  InMemoryEnvVariableRepository,
  InMemoryFileSystem,
  InMemoryFunctionCallRepository,
  InMemoryTypeFieldRepository,
  InMemoryEventFlowRepository,
  InMemorySchemaModelRepository,
} from '../helpers/fakes/index.js';

/**
 * Filesystem that returns absolute paths from listFiles, as the real NodeFileSystem does.
 */
class TestFileSystem extends InMemoryFileSystem {
  async listFiles(dir: string): Promise<string[]> {
    const entries = await super.listFiles(dir);
    return entries;
  }

  async isDirectory(path: string): Promise<boolean> {
    return super.isDirectory(path);
  }
}

function createDeps(fileSystem: TestFileSystem): AnalysisDependencies {
  return {
    codeUnitRepo: new InMemoryCodeUnitRepository(),
    dependencyRepo: new InMemoryFileDependencyRepository(),
    envVarRepo: new InMemoryEnvVariableRepository(),
    fileSystem,
    languageRegistry: createLanguageRegistry(),
    functionCallRepo: new InMemoryFunctionCallRepository(),
    typeFieldRepo: new InMemoryTypeFieldRepository(),
    eventFlowRepo: new InMemoryEventFlowRepository(),
    schemaModelRepo: new InMemorySchemaModelRepository(),
  };
}

describe('AnalysisProgress callback', () => {
  let fs: TestFileSystem;

  beforeEach(() => {
    fs = new TestFileSystem();
  });

  it('should invoke onProgress callback during file processing', async () => {
    await fs.writeFile('/project/a.ts', 'export function a() {}');
    await fs.writeFile('/project/b.ts', 'export function b() {}');

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    await orchestrator.analyze({
      rootDir: '/project',
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    // Should have received at least one progress update
    expect(progressUpdates.length).toBeGreaterThan(0);

    // All updates in file processing phase should be 'analyzing'
    const analyzingUpdates = progressUpdates.filter(p => p.phase === 'analyzing');
    expect(analyzingUpdates.length).toBeGreaterThan(0);

    // The final analyzing update should have filesProcessed + filesSkipped = totalFiles
    const lastAnalyzing = analyzingUpdates[analyzingUpdates.length - 1];
    expect(lastAnalyzing.filesProcessed + lastAnalyzing.filesSkipped).toBe(lastAnalyzing.totalFiles);
  });

  it('should always emit the final state after loop completes', async () => {
    await fs.writeFile('/project/a.ts', 'export function a() {}');

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    await orchestrator.analyze({
      rootDir: '/project',
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    const analyzingUpdates = progressUpdates.filter(p => p.phase === 'analyzing');
    const lastUpdate = analyzingUpdates[analyzingUpdates.length - 1];
    expect(lastUpdate.filesProcessed + lastUpdate.filesSkipped).toBe(lastUpdate.totalFiles);
  });

  it('should include filesSkipped count for non-code files', async () => {
    await fs.writeFile('/project/a.ts', 'export function a() {}');
    await fs.writeFile('/project/readme.md', '# Hello');
    await fs.writeFile('/project/image.png', 'binary');
    await fs.writeFile('/project/config.json', '{}');

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    await orchestrator.analyze({
      rootDir: '/project',
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    const analyzingUpdates = progressUpdates.filter(p => p.phase === 'analyzing');
    const lastUpdate = analyzingUpdates[analyzingUpdates.length - 1];
    // 1 code file processed, 3 non-code files skipped
    expect(lastUpdate.filesProcessed).toBe(1);
    expect(lastUpdate.filesSkipped).toBe(3);
    expect(lastUpdate.totalFiles).toBe(4);
  });

  it('should include codeUnitsExtracted count in progress', async () => {
    await fs.writeFile('/project/a.ts', 'export function hello() { return 1; }\nexport function world() { return 2; }');

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    await orchestrator.analyze({
      rootDir: '/project',
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    const lastAnalyzing = progressUpdates.filter(p => p.phase === 'analyzing').pop()!;
    expect(lastAnalyzing.codeUnitsExtracted).toBeGreaterThan(0);
  });

  it('should include currentFile as basename only', async () => {
    // Use multiple files to ensure at least one in-loop emission includes currentFile
    await fs.writeFile('/project/service.ts', 'export function svc() {}');
    await fs.writeFile('/project/helper.ts', 'export function help() {}');

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    await orchestrator.analyze({
      rootDir: '/project',
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    const withFile = progressUpdates.filter(p => p.currentFile);
    expect(withFile.length).toBeGreaterThan(0);
    // Should be just the basename, not the full path
    for (const p of withFile) {
      expect(p.currentFile).not.toContain('/');
    }
  });

  it('should pass deep analysis step names through callback', async () => {
    await fs.writeFile('/project/a.ts', 'export function hello() { return 1; }');

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    await orchestrator.analyze({
      rootDir: '/project',
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    const deepUpdates = progressUpdates.filter(p => p.phase === 'deep-analysis');
    expect(deepUpdates.length).toBeGreaterThan(0);
    // Each deep analysis update should have a step name
    for (const p of deepUpdates) {
      expect(p.deepAnalysisStep).toBeDefined();
      expect(typeof p.deepAnalysisStep).toBe('string');
    }
  });

  it('should include deepAnalysisProgress detail in block 1 updates', async () => {
    // Create multiple files so the per-file loop has work to do
    for (let i = 0; i < 5; i++) {
      await fs.writeFile(`/project/file${i}.ts`, `export function fn${i}() { console.log(${i}); }`);
    }

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    await orchestrator.analyze({
      rootDir: '/project',
      onProgress: (p) => progressUpdates.push({ ...p }),
    });

    const block1Updates = progressUpdates.filter(
      p => p.phase === 'deep-analysis' && p.deepAnalysisStep === 'function calls & type fields'
    );
    expect(block1Updates.length).toBeGreaterThan(0);

    // The final block 1 update should have deepAnalysisProgress showing all files done
    const lastBlock1 = block1Updates[block1Updates.length - 1];
    expect(lastBlock1.deepAnalysisProgress).toBeDefined();
    expect(lastBlock1.deepAnalysisProgress).toMatch(/^\d+\/\d+$/);

    // The denominator should match the number of files processed
    const parts = lastBlock1.deepAnalysisProgress!.split('/');
    expect(parts[0]).toBe(parts[1]); // final update: numerator == denominator
  });

  it('should not break analysis when no onProgress callback is provided', async () => {
    await fs.writeFile('/project/a.ts', 'export function hello() {}');

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    // Should work fine without onProgress
    const result = await orchestrator.analyze({ rootDir: '/project' });
    expect(result.success).toBe(true);
  });

  it('should throttle progress emissions (skip updates within 80ms)', async () => {
    // Create many files to trigger throttling
    for (let i = 0; i < 50; i++) {
      await fs.writeFile(`/project/file${i}.ts`, `export function fn${i}() {}`);
    }

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);
    const progressUpdates: AnalysisProgress[] = [];

    // Mock Date.now to simulate rapid processing
    let currentTime = 1000;
    const originalDateNow = Date.now;
    Date.now = () => currentTime;
    // Increment by 1ms per call to simulate fast processing
    const originalOnProgress: ProgressCallback = (p) => {
      progressUpdates.push({ ...p });
      currentTime += 1; // barely advance time
    };

    try {
      await orchestrator.analyze({
        rootDir: '/project',
        onProgress: originalOnProgress,
      });
    } finally {
      Date.now = originalDateNow;
    }

    // With 50 files and 1ms per file, most should be throttled
    // We should have fewer analyzing updates than total files
    const analyzingUpdates = progressUpdates.filter(p => p.phase === 'analyzing');
    // First + final are always emitted, plus any that pass the 80ms threshold
    expect(analyzingUpdates.length).toBeLessThan(50);
    // But we should still have at least the final update
    expect(analyzingUpdates.length).toBeGreaterThanOrEqual(1);
  });
});
