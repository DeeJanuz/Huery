/**
 * Composition root - wires together all dependencies.
 *
 * Uses SQLite-backed repositories for persistent storage.
 */

import type { AnalysisDependencies } from '@/application/index.js';
import type { IFileSystem } from '@/domain/ports/index.js';
import { DatabaseManager } from '@/adapters/storage/database.js';
import { SqliteCodeUnitRepository } from '@/adapters/storage/sqlite-code-unit-repository.js';
import { SqliteFileDependencyRepository } from '@/adapters/storage/sqlite-file-dependency-repository.js';
import { SqliteEnvVariableRepository } from '@/adapters/storage/sqlite-env-variable-repository.js';
import { createLanguageRegistry } from '@/extraction/index.js';

export interface CompositionResult {
  readonly dependencies: AnalysisDependencies;
}

export async function createCompositionRoot(
  fileSystem: IFileSystem,
  options?: { dbPath?: string; inMemory?: boolean },
): Promise<CompositionResult> {
  const dbPath = options?.dbPath ?? '.heury/heury.db';
  const inMemory = options?.inMemory ?? false;
  const dbManager = new DatabaseManager({ path: dbPath, inMemory });
  dbManager.initialize();
  const db = dbManager.getDatabase();

  const dependencies: AnalysisDependencies = {
    codeUnitRepo: new SqliteCodeUnitRepository(db),
    dependencyRepo: new SqliteFileDependencyRepository(db),
    envVarRepo: new SqliteEnvVariableRepository(db),
    fileSystem,
    languageRegistry: createLanguageRegistry(),
  };

  return { dependencies };
}
