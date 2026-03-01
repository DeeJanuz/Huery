import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createStatsRoutes } from '@/adapters/ui/routes/stats.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFileDependencyRepository,
  InMemoryEnvVariableRepository,
  InMemoryFileClusterRepository,
} from '../../../helpers/fakes/index.js';
import {
  createCodeUnit,
  CodeUnitType,
  createFileDependency,
  ImportType,
  createEnvVariable,
  createFileCluster,
  createFileClusterMember,
  createCodeUnitPattern,
  PatternType,
} from '@/domain/models/index.js';
import { request } from '../test-helpers.js';

describe('GET /api/stats', () => {
  let codeUnitRepo: InMemoryCodeUnitRepository;
  let dependencyRepo: InMemoryFileDependencyRepository;
  let envVarRepo: InMemoryEnvVariableRepository;
  let fileClusterRepo: InMemoryFileClusterRepository;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    codeUnitRepo = new InMemoryCodeUnitRepository();
    dependencyRepo = new InMemoryFileDependencyRepository();
    envVarRepo = new InMemoryEnvVariableRepository();
    fileClusterRepo = new InMemoryFileClusterRepository();

    app = express();
    app.use('/api', createStatsRoutes({ codeUnitRepo, dependencyRepo, envVarRepo, fileClusterRepo }));
  });

  it('should return zeros for empty repos', async () => {
    const resp = await request(app, '/api/stats');

    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({
      total_code_units: 0,
      total_files: 0,
      total_patterns: 0,
      total_dependencies: 0,
      total_env_variables: 0,
      languages: {},
      total_clusters: 0,
    });
  });

  it('should return correct totals for populated repos', async () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
    }));
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/b.ts', name: 'fnB', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));
    envVarRepo.save(createEnvVariable({ name: 'API_KEY', lineNumber: 1 }));

    const resp = await request(app, '/api/stats');
    const body = resp.body as Record<string, unknown>;

    expect(body.total_code_units).toBe(2);
    expect(body.total_files).toBe(2);
    expect(body.total_dependencies).toBe(1);
    expect(body.total_env_variables).toBe(1);
  });

  it('should aggregate language breakdown correctly', async () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
    }));
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/b.py', name: 'fn_b', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'python',
    }));
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/c.ts', name: 'fnC', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 8, isAsync: false, isExported: true, language: 'typescript',
    }));

    const resp = await request(app, '/api/stats');
    const body = resp.body as Record<string, unknown>;

    expect(body.languages).toEqual({ typescript: 2, python: 1 });
  });

  it('should include cluster count', async () => {
    const cluster = createFileCluster({
      name: 'auth', cohesion: 0.8, internalEdges: 3, externalEdges: 1,
    });
    const member = createFileClusterMember({
      clusterId: cluster.id, filePath: 'src/auth.ts', isEntryPoint: true,
    });
    fileClusterRepo.save(cluster, [member]);

    const resp = await request(app, '/api/stats');
    const body = resp.body as Record<string, unknown>;

    expect(body.total_clusters).toBe(1);
  });

  it('should count patterns across code units', async () => {
    const unitId = 'unit-1';
    codeUnitRepo.save(createCodeUnit({
      id: unitId,
      filePath: 'src/a.ts', name: 'getUsers', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: true, isExported: true, language: 'typescript',
      patterns: [
        createCodeUnitPattern({ codeUnitId: unitId, patternType: PatternType.API_ENDPOINT, patternValue: 'GET /users' }),
        createCodeUnitPattern({ codeUnitId: unitId, patternType: PatternType.DATABASE_READ, patternValue: 'users' }),
      ],
    }));

    const resp = await request(app, '/api/stats');
    const body = resp.body as Record<string, unknown>;

    expect(body.total_patterns).toBe(2);
  });

  it('should count unique files not total code units for total_files', async () => {
    // Two code units in the same file
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
    }));
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'fnB', unitType: CodeUnitType.FUNCTION,
      lineStart: 12, lineEnd: 20, isAsync: false, isExported: true, language: 'typescript',
    }));

    const resp = await request(app, '/api/stats');
    const body = resp.body as Record<string, unknown>;

    expect(body.total_code_units).toBe(2);
    expect(body.total_files).toBe(1);
  });
});
