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
import { SqliteFunctionCallRepository } from '@/adapters/storage/sqlite-function-call-repository.js';
import { SqliteTypeFieldRepository } from '@/adapters/storage/sqlite-type-field-repository.js';
import { SqliteEventFlowRepository } from '@/adapters/storage/sqlite-event-flow-repository.js';
import { SqliteSchemaModelRepository } from '@/adapters/storage/sqlite-schema-model-repository.js';
import { SqliteGuardClauseRepository } from '@/adapters/storage/sqlite-guard-clause-repository.js';
import { SqliteFileClusterRepository } from '@/adapters/storage/sqlite-file-cluster-repository.js';
import { SqlitePatternTemplateRepository } from '@/adapters/storage/sqlite-pattern-template-repository.js';
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
    functionCallRepo: new SqliteFunctionCallRepository(db),
    typeFieldRepo: new SqliteTypeFieldRepository(db),
    eventFlowRepo: new SqliteEventFlowRepository(db),
    schemaModelRepo: new SqliteSchemaModelRepository(db),
    guardClauseRepo: new SqliteGuardClauseRepository(db),
    fileClusterRepo: new SqliteFileClusterRepository(db),
    patternTemplateRepo: new SqlitePatternTemplateRepository(db),
  };

  return { dependencies };
}
