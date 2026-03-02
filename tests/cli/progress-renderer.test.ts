import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createProgressRenderer } from '@/cli/progress-renderer.js';
import type { AnalysisProgress } from '@/application/analysis-progress.js';

function makeProgress(overrides: Partial<AnalysisProgress> = {}): AnalysisProgress {
  return {
    phase: 'analyzing',
    filesProcessed: 10,
    totalFiles: 100,
    filesSkipped: 0,
    codeUnitsExtracted: 50,
    patternsDetected: 20,
    dependenciesFound: 15,
    ...overrides,
  };
}

describe('createProgressRenderer', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  describe('TTY mode', () => {
    beforeEach(() => {
      // Simulate TTY
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    });

    it('should render scanning progress with accurate percentage', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({ filesProcessed: 42, totalFiles: 156, filesSkipped: 114 }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Analyzing codebase...');
      expect(output).toContain('Scanning:');
      expect(output).toContain('156/156');
      expect(output).toContain('100%');
      expect(output).toContain('Code files:');
      expect(output).toContain('42');
      expect(output).toContain('114 non-source skipped');
    });

    it('should render code units, patterns, and dependencies', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({
        codeUnitsExtracted: 234,
        patternsDetected: 89,
        dependenciesFound: 45,
      }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('234');
      expect(output).toContain('89');
      expect(output).toContain('45');
    });

    it('should show current file name', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({ currentFile: 'auth-service.ts' }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('auth-service.ts');
    });

    it('should render deep analysis phase with step name', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({
        phase: 'deep-analysis',
        deepAnalysisStep: 'file clustering',
      }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Deep analysis...');
      expect(output).toContain('file clustering');
    });

    it('should render deepAnalysisProgress after step name', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({
        phase: 'deep-analysis',
        deepAnalysisStep: 'function calls & type fields',
        deepAnalysisProgress: '42/100',
      }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('function calls & type fields (42/100)');
    });

    it('should render step name without parenthetical when no deepAnalysisProgress', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({
        phase: 'deep-analysis',
        deepAnalysisStep: 'schema models',
      }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      // Step line should contain the step name without a progress detail
      expect(output).toContain('Step:          schema models');
      expect(output).not.toContain('schema models (');
    });

    it('should render manifests phase', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({ phase: 'manifests' }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Generating manifests...');
    });

    it('should overwrite previous output on subsequent calls', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({ filesProcessed: 10 }));
      const firstCallCount = writeSpy.mock.calls.length;

      onProgress(makeProgress({ filesProcessed: 20 }));

      // Second call should include cursor-up escape codes to clear previous lines
      const secondOutput = writeSpy.mock.calls.slice(firstCallCount).map(c => c[0]).join('');
      expect(secondOutput).toContain('\x1b[');  // ANSI escape sequence
    });

    it('should clear output on finish()', () => {
      const { onProgress, finish } = createProgressRenderer();

      onProgress(makeProgress());
      writeSpy.mockClear();

      finish();

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      // Should contain cursor-up sequences to clear previous output
      expect(output).toContain('\x1b[');
    });
  });

  describe('non-TTY mode', () => {
    beforeEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    });

    it('should output a single line per phase transition', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({ phase: 'analyzing' }));
      onProgress(makeProgress({ phase: 'analyzing', filesProcessed: 50 }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      // Should only have one line for the analyzing phase
      const analyzeMatches = output.match(/Analyzing codebase\.\.\./g);
      expect(analyzeMatches).toHaveLength(1);
    });

    it('should output a new line when phase changes', () => {
      const { onProgress } = createProgressRenderer();

      onProgress(makeProgress({ phase: 'analyzing' }));
      onProgress(makeProgress({ phase: 'deep-analysis' }));
      onProgress(makeProgress({ phase: 'manifests' }));

      const output = writeSpy.mock.calls.map(c => c[0]).join('');
      expect(output).toContain('Analyzing codebase...');
      expect(output).toContain('Deep analysis...');
      expect(output).toContain('Generating manifests...');
    });

    it('should not output anything on finish()', () => {
      const { onProgress, finish } = createProgressRenderer();

      onProgress(makeProgress());
      writeSpy.mockClear();

      finish();

      expect(writeSpy).not.toHaveBeenCalled();
    });
  });
});
