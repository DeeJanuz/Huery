import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createCodeUnitsRoutes } from '@/adapters/ui/routes/code-units.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFileSystem,
  InMemoryFunctionCallRepository,
  InMemoryTypeFieldRepository,
} from '../../../helpers/fakes/index.js';
import {
  createCodeUnit,
  CodeUnitType,
  createFunctionCall,
  createTypeField,
} from '@/domain/models/index.js';
import { request } from '../test-helpers.js';

describe('code-units routes', () => {
  let codeUnitRepo: InMemoryCodeUnitRepository;
  let functionCallRepo: InMemoryFunctionCallRepository;
  let typeFieldRepo: InMemoryTypeFieldRepository;
  let fileSystem: InMemoryFileSystem;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    codeUnitRepo = new InMemoryCodeUnitRepository();
    functionCallRepo = new InMemoryFunctionCallRepository();
    typeFieldRepo = new InMemoryTypeFieldRepository();
    fileSystem = new InMemoryFileSystem();

    app = express();
    app.use('/api', createCodeUnitsRoutes({ codeUnitRepo, functionCallRepo, typeFieldRepo, fileSystem }));
  });

  describe('GET /api/code-units', () => {
    it('should return all code units when no filters are given', async () => {
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
      }));
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/b.ts', name: 'fnB', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 5, isAsync: false, isExported: false, language: 'python',
      }));

      const resp = await request(app, '/api/code-units');
      const body = resp.body as { total: number; items: unknown[] };

      expect(resp.status).toBe(200);
      expect(body.total).toBe(2);
      expect(body.items).toHaveLength(2);
    });

    it('should filter by file_path', async () => {
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
      }));
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/b.ts', name: 'fnB', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
      }));

      const resp = await request(app, '/api/code-units?file_path=src/a.ts');
      const body = resp.body as { total: number; items: Array<{ name: string }> };

      expect(body.total).toBe(1);
      expect(body.items[0].name).toBe('fnA');
    });

    it('should filter by type', async () => {
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
      }));
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/b.ts', name: 'MyClass', unitType: CodeUnitType.CLASS,
        lineStart: 1, lineEnd: 50, isAsync: false, isExported: true, language: 'typescript',
      }));

      const resp = await request(app, '/api/code-units?type=CLASS');
      const body = resp.body as { total: number; items: Array<{ name: string }> };

      expect(body.total).toBe(1);
      expect(body.items[0].name).toBe('MyClass');
    });

    it('should filter by language', async () => {
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
      }));
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/b.py', name: 'fn_b', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'python',
      }));

      const resp = await request(app, '/api/code-units?language=python');
      const body = resp.body as { total: number; items: Array<{ name: string }> };

      expect(body.total).toBe(1);
      expect(body.items[0].name).toBe('fn_b');
    });

    it('should filter by exported', async () => {
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
      }));
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/b.ts', name: 'fnB', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 5, isAsync: false, isExported: false, language: 'typescript',
      }));

      const resp = await request(app, '/api/code-units?exported=false');
      const body = resp.body as { total: number; items: Array<{ name: string }> };

      expect(body.total).toBe(1);
      expect(body.items[0].name).toBe('fnB');
    });

    it('should filter by min_complexity', async () => {
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/a.ts', name: 'simple', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
        complexityScore: 2,
      }));
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/b.ts', name: 'complex', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 50, isAsync: false, isExported: true, language: 'typescript',
        complexityScore: 15,
      }));

      const resp = await request(app, '/api/code-units?min_complexity=10');
      const body = resp.body as { total: number; items: Array<{ name: string }> };

      expect(body.total).toBe(1);
      expect(body.items[0].name).toBe('complex');
    });

    it('should support pagination with limit and offset', async () => {
      for (let i = 0; i < 5; i++) {
        codeUnitRepo.save(createCodeUnit({
          filePath: `src/${i}.ts`, name: `fn${i}`, unitType: CodeUnitType.FUNCTION,
          lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
        }));
      }

      const resp = await request(app, '/api/code-units?limit=2&offset=1');
      const body = resp.body as { total: number; items: unknown[] };

      expect(body.total).toBe(5);
      expect(body.items).toHaveLength(2);
    });

    it('should return empty items for empty repo', async () => {
      const resp = await request(app, '/api/code-units');
      const body = resp.body as { total: number; items: unknown[] };

      expect(body.total).toBe(0);
      expect(body.items).toEqual([]);
    });
  });

  describe('GET /api/code-units/:id', () => {
    it('should return code unit detail with function calls and type fields', async () => {
      const unitId = 'unit-1';
      codeUnitRepo.save(createCodeUnit({
        id: unitId,
        filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
      }));
      functionCallRepo.save(createFunctionCall({
        callerUnitId: unitId, calleeName: 'helper', lineNumber: 5, isAsync: false,
      }));
      functionCallRepo.save(createFunctionCall({
        callerUnitId: 'other-unit', calleeName: 'fnA', calleeUnitId: unitId, lineNumber: 3, isAsync: false,
      }));
      typeFieldRepo.save(createTypeField({
        parentUnitId: unitId, name: 'value', fieldType: 'string',
        isOptional: false, isReadonly: true, lineNumber: 2,
      }));

      const resp = await request(app, `/api/code-units/${unitId}`);
      const body = resp.body as Record<string, unknown>;

      expect(resp.status).toBe(200);
      expect(body.name).toBe('fnA');
      expect((body.functionCalls as Record<string, unknown[]>).callees).toHaveLength(1);
      expect((body.functionCalls as Record<string, unknown[]>).callers).toHaveLength(1);
      expect((body.typeFields as unknown[])).toHaveLength(1);
    });

    it('should return 404 for missing code unit', async () => {
      const resp = await request(app, '/api/code-units/nonexistent');

      expect(resp.status).toBe(404);
      expect(resp.body).toEqual({ error: 'Code unit not found' });
    });
  });
});
