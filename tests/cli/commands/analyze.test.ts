import { describe, it, expect, beforeEach, vi } from 'vitest';

import { analyzeCommand } from '@/cli/commands/analyze.js';
import { CONFIG_FILENAME } from '@/config/loader.js';
import { InMemoryFileSystem } from '../../helpers/fakes/index.js';

describe('analyzeCommand', () => {
  let fs: InMemoryFileSystem;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fs = new InMemoryFileSystem();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should run analysis and print stats', async () => {
    // Set up a minimal project with a config and a source file
    await fs.writeFile(
      `/project/${CONFIG_FILENAME}`,
      JSON.stringify({
        rootDir: '/project',
        outputDir: '.heury',
        include: ['**/*'],
        exclude: [],
        embedding: { provider: 'local' },
      }),
    );
    await fs.writeFile('/project/index.ts', 'export function hello() { return "hi"; }');

    await analyzeCommand({ dir: '/project', full: false }, fs);

    // Should print some stats
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should handle missing config gracefully by using defaults', async () => {
    // No config file, but add a source file
    await fs.writeFile('/project/app.ts', 'export const x = 1;');

    // Should not throw
    await analyzeCommand({ dir: '/project', full: false }, fs);

    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should generate manifest files after successful analysis', async () => {
    await fs.writeFile(
      `/project/${CONFIG_FILENAME}`,
      JSON.stringify({
        rootDir: '/project',
        outputDir: '.heury',
        include: ['**/*'],
        exclude: [],
        embedding: { provider: 'local' },
      }),
    );
    await fs.writeFile('/project/index.ts', 'export function hello() { return "hi"; }');

    await analyzeCommand({ dir: '/project', full: false }, fs);

    // Verify manifest files were created
    const modulesExists = await fs.exists('/project/.heury/MODULES.md');
    const patternsExists = await fs.exists('/project/.heury/PATTERNS.md');
    const dependenciesExists = await fs.exists('/project/.heury/DEPENDENCIES.md');
    const hotspotsExists = await fs.exists('/project/.heury/HOTSPOTS.md');

    expect(modulesExists).toBe(true);
    expect(patternsExists).toBe(true);
    expect(dependenciesExists).toBe(true);
    expect(hotspotsExists).toBe(true);

    // Verify the manifest log line was printed
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Manifests:'),
    );
  });

  it('should report errors on failure', async () => {
    // Create a filesystem that throws on readFile (simulating corrupt config)
    const brokenFs = new InMemoryFileSystem();
    // Write invalid JSON to config file so loadConfig fails during parse
    await brokenFs.writeFile(
      `/project/${CONFIG_FILENAME}`,
      'not valid json {{{{',
    );

    await analyzeCommand({ dir: '/project', full: false }, brokenFs);

    // Should have logged an error
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
