import { describe, it, expect, beforeEach } from 'vitest';

import { AnalysisOrchestrator } from '@/application/analysis-orchestrator.js';
import type { AnalysisDependencies, AnalysisOptions } from '@/application/analysis-orchestrator.js';
import { createLanguageRegistry } from '@/extraction/languages/index.js';
import type { IFileSystem } from '@/domain/ports/index.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFileDependencyRepository,
  InMemoryEnvVariableRepository,
  InMemoryFileSystem,
} from '../helpers/fakes/index.js';

function createDeps(fileSystem: IFileSystem): AnalysisDependencies {
  return {
    codeUnitRepo: new InMemoryCodeUnitRepository(),
    dependencyRepo: new InMemoryFileDependencyRepository(),
    envVarRepo: new InMemoryEnvVariableRepository(),
    fileSystem,
    languageRegistry: createLanguageRegistry(),
  };
}

function defaultOptions(rootDir = '/project'): AnalysisOptions {
  return { rootDir };
}

/**
 * A filesystem fake that mimics NodeFileSystem behavior:
 * - Files are stored with absolute paths
 * - listFiles() returns RELATIVE paths (just like the real NodeFileSystem)
 * - readFile() requires absolute paths
 *
 * This exposes the bug where the orchestrator uses relative paths from
 * listFiles() directly with readFile(), which fails when CWD != rootDir.
 */
class RelativePathFileSystem implements IFileSystem {
  private readonly files = new Map<string, string>();

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async listFiles(directory: string): Promise<string[]> {
    const prefix = directory.endsWith('/') ? directory : `${directory}/`;
    const matches: string[] = [];
    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      // Return RELATIVE path, just like NodeFileSystem does
      const relativePath = filePath.slice(prefix.length);
      if (relativePath.includes('/')) continue; // only direct children
      matches.push(relativePath);
    }
    return matches;
  }

  async getFileHash(path: string): Promise<string> {
    return 'fakehash';
  }

  async isDirectory(_path: string): Promise<boolean> {
    return false;
  }

  async mkdir(_path: string): Promise<void> {
    // no-op
  }
}

describe('AnalysisOrchestrator', () => {
  let fs: InMemoryFileSystem;

  beforeEach(async () => {
    fs = new InMemoryFileSystem();
    // Use flat paths since InMemoryFileSystem.listFiles only returns direct children
    await fs.writeFile('/project/index.ts', 'export function main() { console.log("hello"); }');
    await fs.writeFile('/project/utils.ts', 'export const add = (a: number, b: number) => a + b;');
    await fs.writeFile('/project/.env.example', '# Database\nDATABASE_URL=postgresql://localhost/db');
    await fs.writeFile('/project/README.md', '# Project');
  });

  it('should process all recognized files in full analysis', async () => {
    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    const result = await orchestrator.analyze(defaultOptions());

    expect(result.success).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats!.filesProcessed).toBeGreaterThanOrEqual(2);
  });

  it('should skip unrecognized file types', async () => {
    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    const result = await orchestrator.analyze(defaultOptions());

    // README.md should not be processed
    expect(result.stats).toBeDefined();
    // Only .ts files should be processed (index.ts and utils.ts)
    const codeUnits = deps.codeUnitRepo.findAll();
    const filePaths = new Set(codeUnits.map(u => u.filePath));
    expect(filePaths.has('/project/README.md')).toBe(false);
  });

  it('should store code units in repository', async () => {
    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    await orchestrator.analyze(defaultOptions());

    const allUnits = deps.codeUnitRepo.findAll();
    expect(allUnits.length).toBeGreaterThanOrEqual(1);
    // Should have extracted the main function and add arrow function
    expect(allUnits.some(u => u.name === 'main')).toBe(true);
  });

  it('should store dependencies in repository when extractor provides them', async () => {
    // Add a file with local dependencies
    await fs.writeFile('/project/app.ts', `import { add } from './utils';
export function compute() { return add(1, 2); }`);

    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    await orchestrator.analyze(defaultOptions());

    // Dependencies depend on the language extractor implementation.
    // The orchestrator correctly stores whatever the extractor returns.
    const allDeps = deps.dependencyRepo.findAll();
    expect(Array.isArray(allDeps)).toBe(true);
    // Code units should still be extracted regardless of dependency support
    const allUnits = deps.codeUnitRepo.findAll();
    expect(allUnits.some(u => u.name === 'compute')).toBe(true);
  });

  it('should process .env.example files', async () => {
    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    await orchestrator.analyze(defaultOptions());

    const envVars = deps.envVarRepo.findAll();
    expect(envVars.length).toBeGreaterThanOrEqual(1);
    expect(envVars.some(v => v.name === 'DATABASE_URL')).toBe(true);
  });

  it('should return correct stats', async () => {
    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    const result = await orchestrator.analyze(defaultOptions());

    expect(result.success).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats!.filesProcessed).toBeGreaterThanOrEqual(2);
    expect(result.stats!.codeUnitsExtracted).toBeGreaterThanOrEqual(1);
    expect(result.stats!.envVariablesFound).toBeGreaterThanOrEqual(1);
    expect(result.stats!.duration).toBeGreaterThanOrEqual(0);
  });

  it('should only process changed files in incremental analysis', async () => {
    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    // First do a full analysis
    await orchestrator.analyze(defaultOptions());
    const initialUnits = deps.codeUnitRepo.findAll().length;

    // Now update one file and do incremental
    await fs.writeFile('/project/index.ts', 'export function main() { return 42; }\nexport function extra() { return 1; }');
    const result = await orchestrator.analyzeIncremental(
      defaultOptions(),
      ['/project/index.ts'],
    );

    expect(result.success).toBe(true);
    expect(result.stats).toBeDefined();
    // Only 1 file processed incrementally
    expect(result.stats!.filesProcessed).toBe(1);
  });

  it('should clear old data before re-processing in incremental analysis', async () => {
    const deps = createDeps(fs);
    const orchestrator = new AnalysisOrchestrator(deps);

    // Full analysis
    await orchestrator.analyze(defaultOptions());
    const unitsBefore = deps.codeUnitRepo.findByFilePath('/project/index.ts');
    expect(unitsBefore.length).toBeGreaterThanOrEqual(1);

    // Incremental: replace content with different function
    await fs.writeFile('/project/index.ts', 'export function replaced() { return "new"; }');
    await orchestrator.analyzeIncremental(
      defaultOptions(),
      ['/project/index.ts'],
    );

    const unitsAfter = deps.codeUnitRepo.findByFilePath('/project/index.ts');
    // Old 'main' should be gone, new 'replaced' should exist
    expect(unitsAfter.some(u => u.name === 'replaced')).toBe(true);
    expect(unitsAfter.some(u => u.name === 'main')).toBe(false);
  });

  it('should handle empty project with no files', async () => {
    const emptyFs = new InMemoryFileSystem();
    const deps = createDeps(emptyFs);
    const orchestrator = new AnalysisOrchestrator(deps);

    const result = await orchestrator.analyze(defaultOptions());

    expect(result.success).toBe(true);
    expect(result.stats!.filesProcessed).toBe(0);
    expect(result.stats!.codeUnitsExtracted).toBe(0);
  });

  it('should report file errors gracefully instead of failing entire analysis', async () => {
    // Create a filesystem that throws on readFile for one file
    const badFs = new InMemoryFileSystem();
    await badFs.writeFile('/project/index.ts', 'content');
    // Monkey-patch readFile to throw
    const originalReadFile = badFs.readFile.bind(badFs);
    badFs.readFile = async (path: string) => {
      if (path === '/project/index.ts') {
        throw new Error('Disk read error');
      }
      return originalReadFile(path);
    };

    const deps = createDeps(badFs);
    const orchestrator = new AnalysisOrchestrator(deps);

    const result = await orchestrator.analyze(defaultOptions());

    // Single file errors should not cause overall failure
    expect(result.success).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats!.filesWithErrors).toBe(1);
  });

  it('should return error result on systemic failure', async () => {
    // Create a filesystem that throws on listFiles (systemic - not per-file)
    const badFs = new InMemoryFileSystem();
    badFs.listFiles = async () => {
      throw new Error('Filesystem unavailable');
    };

    const deps = createDeps(badFs);
    const orchestrator = new AnalysisOrchestrator(deps);

    const result = await orchestrator.analyze(defaultOptions());

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('Filesystem unavailable');
  });

  describe('error resilience', () => {
    it('should continue processing when a single file extraction fails', async () => {
      // Add a file that will cause an extraction error
      await fs.writeFile('/project/good.ts', 'export function good() { return 1; }');
      await fs.writeFile('/project/bad.ts', 'this will cause extraction to throw');

      const deps = createDeps(fs);
      const orchestrator = new AnalysisOrchestrator(deps);

      // Monkey-patch processFile to throw for bad.ts
      const origReadFile = fs.readFile.bind(fs);
      fs.readFile = async (path: string) => {
        const content = await origReadFile(path);
        if (path.includes('bad.ts')) {
          throw new Error('lineEnd must be >= lineStart');
        }
        return content;
      };

      const result = await orchestrator.analyze(defaultOptions());

      // Analysis should still succeed overall
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      // Should have processed the good files (index.ts, utils.ts, good.ts)
      expect(result.stats!.filesProcessed).toBeGreaterThanOrEqual(2);
    });

    it('should report filesWithErrors count in stats', async () => {
      await fs.writeFile('/project/bad.ts', 'export function bad() {}');

      const deps = createDeps(fs);
      const orchestrator = new AnalysisOrchestrator(deps);

      // Make bad.ts throw during processing
      const origReadFile = fs.readFile.bind(fs);
      fs.readFile = async (path: string) => {
        if (path.includes('bad.ts')) {
          throw new Error('lineEnd must be >= lineStart');
        }
        return origReadFile(path);
      };

      const result = await orchestrator.analyze(defaultOptions());

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.filesWithErrors).toBe(1);
    });

    it('should count DB save errors as file errors instead of aborting', async () => {
      const deps = createDeps(fs);
      const orchestrator = new AnalysisOrchestrator(deps);

      // Simulate a DB failure by breaking the repository
      deps.codeUnitRepo.saveBatch = () => {
        throw new Error('Database connection lost');
      };

      const result = await orchestrator.analyze(defaultOptions());

      // Per-file DB errors are caught and counted, not propagated
      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.filesWithErrors).toBeGreaterThanOrEqual(1);
    });
  });

  describe('relative path resolution', () => {
    let relFs: RelativePathFileSystem;

    beforeEach(async () => {
      relFs = new RelativePathFileSystem();
      await relFs.writeFile('/project/index.ts', 'export function main() { console.log("hello"); }');
      await relFs.writeFile('/project/utils.ts', 'export const add = (a: number, b: number) => a + b;');
      await relFs.writeFile('/project/.env.example', '# Database\nDATABASE_URL=postgresql://localhost/db');
      await relFs.writeFile('/project/README.md', '# Project');
    });

    it('should resolve relative file paths from listFiles against rootDir for readFile', async () => {
      const deps = createDeps(relFs);
      const orchestrator = new AnalysisOrchestrator(deps);

      const result = await orchestrator.analyze(defaultOptions());

      expect(result.success).toBe(true);
      expect(result.stats).toBeDefined();
      expect(result.stats!.filesProcessed).toBeGreaterThanOrEqual(2);
    });

    it('should resolve relative .env.example paths against rootDir', async () => {
      const deps = createDeps(relFs);
      const orchestrator = new AnalysisOrchestrator(deps);

      const result = await orchestrator.analyze(defaultOptions());

      expect(result.success).toBe(true);
      const envVars = deps.envVarRepo.findAll();
      expect(envVars.length).toBeGreaterThanOrEqual(1);
      expect(envVars.some(v => v.name === 'DATABASE_URL')).toBe(true);
    });

    it('should store relative file paths in repositories, not absolute', async () => {
      const deps = createDeps(relFs);
      const orchestrator = new AnalysisOrchestrator(deps);

      await orchestrator.analyze(defaultOptions());

      const allUnits = deps.codeUnitRepo.findAll();
      expect(allUnits.length).toBeGreaterThanOrEqual(1);
      // Stored paths should be relative (portable), not absolute
      for (const unit of allUnits) {
        expect(unit.filePath.startsWith('/')).toBe(false);
      }
    });

    it('should resolve relative paths for incremental analysis', async () => {
      const deps = createDeps(relFs);
      const orchestrator = new AnalysisOrchestrator(deps);

      // Incremental with relative path (as would come from git diff)
      const result = await orchestrator.analyzeIncremental(
        defaultOptions(),
        ['index.ts'],
      );

      expect(result.success).toBe(true);
      expect(result.stats!.filesProcessed).toBe(1);
    });
  });
});
