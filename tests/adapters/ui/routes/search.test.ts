import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createSearchRoutes } from '@/adapters/ui/routes/search.js';
import { InMemoryCodeUnitRepository } from '../../../helpers/fakes/index.js';
import {
  createCodeUnit,
  CodeUnitType,
  createCodeUnitPattern,
  PatternType,
} from '@/domain/models/index.js';
import { request } from '../test-helpers.js';

describe('GET /api/search', () => {
  let codeUnitRepo: InMemoryCodeUnitRepository;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    codeUnitRepo = new InMemoryCodeUnitRepository();
    app = express();
    app.use('/api', createSearchRoutes({ codeUnitRepo }));
  });

  it('should return 400 when q parameter is missing', async () => {
    const resp = await request(app, '/api/search');

    expect(resp.status).toBe(400);
    expect(resp.body).toEqual({ error: 'Query parameter "q" is required' });
  });

  it('should search by code_unit name by default', async () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'getUserById', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: true, isExported: true, language: 'typescript',
    }));
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/b.ts', name: 'deleteUser', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
    }));

    const resp = await request(app, '/api/search?q=getUser');
    const body = resp.body as { total: number; items: Array<{ name: string }> };

    expect(body.total).toBe(1);
    expect(body.items[0].name).toBe('getUserById');
  });

  it('should search by file path when type=file', async () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/auth/login.ts', name: 'login', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: true, isExported: true, language: 'typescript',
    }));
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/users/list.ts', name: 'listUsers', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
    }));

    const resp = await request(app, '/api/search?q=auth&type=file');
    const body = resp.body as { total: number; items: Array<{ filePath: string }> };

    expect(body.total).toBe(1);
    expect(body.items[0].filePath).toBe('src/auth/login.ts');
  });

  it('should search by pattern when type=pattern', async () => {
    const unitId = 'u1';
    codeUnitRepo.save(createCodeUnit({
      id: unitId,
      filePath: 'src/a.ts', name: 'getUsers', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: true, isExported: true, language: 'typescript',
      patterns: [
        createCodeUnitPattern({ codeUnitId: unitId, patternType: PatternType.API_ENDPOINT, patternValue: 'GET /api/users' }),
      ],
    }));
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/b.ts', name: 'helper', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
    }));

    const resp = await request(app, '/api/search?q=/api/users&type=pattern');
    const body = resp.body as { total: number; items: Array<{ name: string }> };

    expect(body.total).toBe(1);
    expect(body.items[0].name).toBe('getUsers');
  });

  it('should respect limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      codeUnitRepo.save(createCodeUnit({
        filePath: `src/${i}.ts`, name: `fn${i}`, unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
      }));
    }

    const resp = await request(app, '/api/search?q=fn&limit=2');
    const body = resp.body as { total: number; items: unknown[] };

    expect(body.total).toBe(5);
    expect(body.items).toHaveLength(2);
  });

  it('should return empty results when nothing matches', async () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
    }));

    const resp = await request(app, '/api/search?q=nonexistent');
    const body = resp.body as { total: number; items: unknown[] };

    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it('should be case insensitive', async () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'GetUserById', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
    }));

    const resp = await request(app, '/api/search?q=getuser');
    const body = resp.body as { total: number; items: Array<{ name: string }> };

    expect(body.total).toBe(1);
    expect(body.items[0].name).toBe('GetUserById');
  });

  it('should return expected fields in search results', async () => {
    codeUnitRepo.save(createCodeUnit({
      id: 'u1',
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
      signature: 'function fnA(): void',
    }));

    const resp = await request(app, '/api/search?q=fnA');
    const body = resp.body as { items: Array<Record<string, unknown>> };

    expect(body.items[0]).toEqual({
      id: 'u1',
      name: 'fnA',
      unitType: CodeUnitType.FUNCTION,
      filePath: 'src/a.ts',
      lineStart: 1,
      lineEnd: 10,
      language: 'typescript',
      signature: 'function fnA(): void',
    });
  });
});
