import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '@/adapters/storage/database.js';
import { SqliteAnalysisRepository } from '@/adapters/storage/sqlite-analysis-repository.js';
import { createAnalysisResult, createAnalysisStats } from '@/domain/models/index.js';

describe('SqliteAnalysisRepository', () => {
  let dbManager: DatabaseManager;
  let repo: SqliteAnalysisRepository;

  beforeEach(() => {
    dbManager = new DatabaseManager({ path: ':memory:', inMemory: true });
    dbManager.initialize();
    repo = new SqliteAnalysisRepository(dbManager.getDatabase());
  });

  afterEach(() => {
    dbManager.close();
  });

  it('should save and retrieve latest result', () => {
    const stats = createAnalysisStats({
      filesProcessed: 10,
      codeUnitsExtracted: 50,
      patternsDetected: 20,
      dependenciesFound: 15,
      envVariablesFound: 3,
      filesWithErrors: 0,
      duration: 1500,
    });
    const result = createAnalysisResult({ success: true, stats });
    repo.saveResult(result);

    const latest = repo.getLatestResult();
    expect(latest).toBeDefined();
    expect(latest!.success).toBe(true);
    expect(latest!.stats).toBeDefined();
    expect(latest!.stats!.filesProcessed).toBe(10);
    expect(latest!.stats!.duration).toBe(1500);
  });

  it('should return undefined when no results saved', () => {
    expect(repo.getLatestResult()).toBeUndefined();
  });

  it('should return most recently saved result', () => {
    repo.saveResult(createAnalysisResult({ success: false, error: 'fail' }));
    repo.saveResult(createAnalysisResult({ success: true }));
    const latest = repo.getLatestResult();
    expect(latest).toBeDefined();
    expect(latest!.success).toBe(true);
  });

  it('should clear all results', () => {
    repo.saveResult(createAnalysisResult({ success: true }));
    repo.clear();
    expect(repo.getLatestResult()).toBeUndefined();
  });
});
