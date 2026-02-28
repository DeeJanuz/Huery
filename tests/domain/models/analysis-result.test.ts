import { describe, it, expect } from 'vitest';
import {
  createAnalysisResult,
  createAnalysisStats,
  type AnalysisResult,
  type AnalysisStats,
} from '@/domain/models/analysis-result.js';

describe('createAnalysisResult', () => {
  it('should create a successful result', () => {
    const result = createAnalysisResult({ success: true });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should create a failed result with error', () => {
    const result = createAnalysisResult({
      success: false,
      error: 'Something went wrong',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Something went wrong');
  });

  it('should include stats when provided', () => {
    const stats = createAnalysisStats({
      filesProcessed: 10,
      codeUnitsExtracted: 50,
      patternsDetected: 20,
      dependenciesFound: 30,
      envVariablesFound: 5,
      filesWithErrors: 0,
      duration: 1200,
    });

    const result = createAnalysisResult({ success: true, stats });
    expect(result.stats).toEqual(stats);
  });
});

describe('createAnalysisStats', () => {
  it('should create stats with all fields', () => {
    const stats = createAnalysisStats({
      filesProcessed: 10,
      codeUnitsExtracted: 50,
      patternsDetected: 20,
      dependenciesFound: 30,
      envVariablesFound: 5,
      filesWithErrors: 0,
      duration: 1200,
    });

    expect(stats.filesProcessed).toBe(10);
    expect(stats.codeUnitsExtracted).toBe(50);
    expect(stats.patternsDetected).toBe(20);
    expect(stats.dependenciesFound).toBe(30);
    expect(stats.envVariablesFound).toBe(5);
    expect(stats.filesWithErrors).toBe(0);
    expect(stats.duration).toBe(1200);
  });

  it('should throw when any numeric field is negative', () => {
    expect(() =>
      createAnalysisStats({
        filesProcessed: -1,
        codeUnitsExtracted: 0,
        patternsDetected: 0,
        dependenciesFound: 0,
        envVariablesFound: 0,
        filesWithErrors: 0,
        duration: 0,
      })
    ).toThrow();
  });
});
