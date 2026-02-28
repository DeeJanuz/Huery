import type Database from 'better-sqlite3';
import type { AnalysisResult } from '@/domain/models/index.js';
import { createAnalysisResult, createAnalysisStats } from '@/domain/models/index.js';
import type { IAnalysisRepository } from '@/domain/ports/index.js';

interface AnalysisRow {
  id: number;
  success: number;
  error: string | null;
  files_processed: number | null;
  code_units_extracted: number | null;
  patterns_detected: number | null;
  dependencies_found: number | null;
  env_variables_found: number | null;
  duration: number | null;
  created_at: string;
}

export class SqliteAnalysisRepository implements IAnalysisRepository {
  private readonly insertStmt: Database.Statement;
  private readonly selectLatest: Database.Statement;
  private readonly clearStmt: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(`
      INSERT INTO analysis_results
        (success, error, files_processed, code_units_extracted, patterns_detected, dependencies_found, env_variables_found, duration)
      VALUES
        (@success, @error, @files_processed, @code_units_extracted, @patterns_detected, @dependencies_found, @env_variables_found, @duration)
    `);

    this.selectLatest = db.prepare('SELECT * FROM analysis_results ORDER BY id DESC LIMIT 1');
    this.clearStmt = db.prepare('DELETE FROM analysis_results');
  }

  saveResult(result: AnalysisResult): void {
    this.insertStmt.run({
      success: result.success ? 1 : 0,
      error: result.error ?? null,
      files_processed: result.stats?.filesProcessed ?? null,
      code_units_extracted: result.stats?.codeUnitsExtracted ?? null,
      patterns_detected: result.stats?.patternsDetected ?? null,
      dependencies_found: result.stats?.dependenciesFound ?? null,
      env_variables_found: result.stats?.envVariablesFound ?? null,
      duration: result.stats?.duration ?? null,
    });
  }

  getLatestResult(): AnalysisResult | undefined {
    const row = this.selectLatest.get() as AnalysisRow | undefined;
    if (!row) return undefined;
    return this.rowToResult(row);
  }

  clear(): void {
    this.clearStmt.run();
  }

  private rowToResult(row: AnalysisRow): AnalysisResult {
    const hasStats = row.files_processed !== null;
    const stats = hasStats
      ? createAnalysisStats({
          filesProcessed: row.files_processed!,
          codeUnitsExtracted: row.code_units_extracted!,
          patternsDetected: row.patterns_detected!,
          dependenciesFound: row.dependencies_found!,
          envVariablesFound: row.env_variables_found!,
          filesWithErrors: 0,
          duration: row.duration!,
        })
      : undefined;

    return createAnalysisResult({
      success: row.success === 1,
      error: row.error ?? undefined,
      stats,
    });
  }
}
