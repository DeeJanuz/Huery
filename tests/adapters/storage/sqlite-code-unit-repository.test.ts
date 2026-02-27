import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseManager } from '@/adapters/storage/database.js';
import { SqliteCodeUnitRepository } from '@/adapters/storage/sqlite-code-unit-repository.js';
import {
  CodeUnitType,
  createCodeUnit,
  PatternType,
  createCodeUnitPattern,
} from '@/domain/models/index.js';
import type { CodeUnit } from '@/domain/models/index.js';

function makeCodeUnit(overrides: Partial<Parameters<typeof createCodeUnit>[0]> = {}): CodeUnit {
  return createCodeUnit({
    filePath: 'src/index.ts',
    name: 'main',
    unitType: CodeUnitType.FUNCTION,
    lineStart: 1,
    lineEnd: 10,
    isAsync: false,
    isExported: true,
    language: 'typescript',
    ...overrides,
  });
}

describe('SqliteCodeUnitRepository', () => {
  let dbManager: DatabaseManager;
  let repo: SqliteCodeUnitRepository;

  beforeEach(() => {
    dbManager = new DatabaseManager({ path: ':memory:', inMemory: true });
    dbManager.initialize();
    repo = new SqliteCodeUnitRepository(dbManager.getDatabase());
  });

  afterEach(() => {
    dbManager.close();
  });

  it('should save and find a code unit by id', () => {
    const unit = makeCodeUnit({ id: 'unit-1' });
    repo.save(unit);
    const found = repo.findById('unit-1');
    expect(found).toBeDefined();
    expect(found!.id).toBe('unit-1');
    expect(found!.name).toBe('main');
    expect(found!.filePath).toBe('src/index.ts');
    expect(found!.unitType).toBe(CodeUnitType.FUNCTION);
    expect(found!.isAsync).toBe(false);
    expect(found!.isExported).toBe(true);
    expect(found!.language).toBe('typescript');
    expect(found!.children).toEqual([]);
  });

  it('should return undefined for non-existent id', () => {
    expect(repo.findById('non-existent')).toBeUndefined();
  });

  it('should save with patterns and retrieve them', () => {
    const unitId = 'unit-with-patterns';
    const patterns = [
      createCodeUnitPattern({
        id: 'p1',
        codeUnitId: unitId,
        patternType: PatternType.API_ENDPOINT,
        patternValue: 'GET /users',
        lineNumber: 5,
      }),
      createCodeUnitPattern({
        id: 'p2',
        codeUnitId: unitId,
        patternType: PatternType.DATABASE_READ,
        patternValue: 'SELECT users',
        columnAccess: { read: ['name', 'email'], write: [] },
      }),
    ];
    const unit = makeCodeUnit({ id: unitId, patterns });
    repo.save(unit);

    const found = repo.findById(unitId);
    expect(found).toBeDefined();
    expect(found!.patterns).toHaveLength(2);
    expect(found!.patterns[0].patternType).toBe(PatternType.API_ENDPOINT);
    expect(found!.patterns[0].patternValue).toBe('GET /users');
    expect(found!.patterns[0].lineNumber).toBe(5);
    expect(found!.patterns[1].columnAccess).toEqual({ read: ['name', 'email'], write: [] });
  });

  it('should find by file path', () => {
    repo.save(makeCodeUnit({ id: 'u1', filePath: 'src/a.ts', name: 'a' }));
    repo.save(makeCodeUnit({ id: 'u2', filePath: 'src/b.ts', name: 'b' }));
    repo.save(makeCodeUnit({ id: 'u3', filePath: 'src/a.ts', name: 'c' }));
    expect(repo.findByFilePath('src/a.ts')).toHaveLength(2);
    expect(repo.findByFilePath('src/b.ts')).toHaveLength(1);
    expect(repo.findByFilePath('src/c.ts')).toHaveLength(0);
  });

  it('should find by type', () => {
    repo.save(makeCodeUnit({ id: 'u1', unitType: CodeUnitType.CLASS, name: 'MyClass' }));
    repo.save(makeCodeUnit({ id: 'u2', unitType: CodeUnitType.FUNCTION, name: 'fn' }));
    expect(repo.findByType(CodeUnitType.CLASS)).toHaveLength(1);
    expect(repo.findByType(CodeUnitType.FUNCTION)).toHaveLength(1);
    expect(repo.findByType(CodeUnitType.METHOD)).toHaveLength(0);
  });

  it('should find by language', () => {
    repo.save(makeCodeUnit({ id: 'u1', language: 'python', name: 'py_fn' }));
    repo.save(makeCodeUnit({ id: 'u2', language: 'typescript', name: 'ts_fn' }));
    expect(repo.findByLanguage('python')).toHaveLength(1);
    expect(repo.findByLanguage('typescript')).toHaveLength(1);
    expect(repo.findByLanguage('rust')).toHaveLength(0);
  });

  it('should save batch in transaction', () => {
    const units = [
      makeCodeUnit({ id: 'u1', name: 'a' }),
      makeCodeUnit({ id: 'u2', name: 'b' }),
      makeCodeUnit({ id: 'u3', name: 'c' }),
    ];
    repo.saveBatch(units);
    expect(repo.findAll()).toHaveLength(3);
  });

  it('should delete by file path and cascade to patterns', () => {
    const pattern = createCodeUnitPattern({
      id: 'p1',
      codeUnitId: 'u1',
      patternType: PatternType.API_CALL,
      patternValue: 'fetch /api',
    });
    repo.save(makeCodeUnit({ id: 'u1', filePath: 'src/a.ts', name: 'a', patterns: [pattern] }));
    repo.save(makeCodeUnit({ id: 'u2', filePath: 'src/b.ts', name: 'b' }));

    repo.deleteByFilePath('src/a.ts');
    expect(repo.findAll()).toHaveLength(1);
    expect(repo.findByFilePath('src/a.ts')).toHaveLength(0);
    // Verify patterns were also deleted
    expect(repo.findById('u1')).toBeUndefined();
  });

  it('should clear all units and patterns', () => {
    repo.save(makeCodeUnit({ id: 'u1' }));
    repo.save(makeCodeUnit({ id: 'u2' }));
    repo.clear();
    expect(repo.findAll()).toHaveLength(0);
  });

  it('should overwrite existing unit on save with same id', () => {
    repo.save(makeCodeUnit({ id: 'u1', name: 'original' }));
    repo.save(makeCodeUnit({ id: 'u1', name: 'updated' }));
    expect(repo.findById('u1')?.name).toBe('updated');
    expect(repo.findAll()).toHaveLength(1);
  });

  it('should store and retrieve complexity data', () => {
    const unit = makeCodeUnit({
      id: 'u1',
      complexity: { cyclomatic: 5, cognitive: 3 },
      complexityScore: 4.5,
    });
    repo.save(unit);
    const found = repo.findById('u1');
    expect(found!.complexity).toEqual({ cyclomatic: 5, cognitive: 3 });
    expect(found!.complexityScore).toBe(4.5);
  });

  describe('children persistence', () => {
    it('should save unit with children and retrieve them via findById', () => {
      const child1 = makeCodeUnit({
        id: 'child-1',
        name: 'method1',
        unitType: CodeUnitType.METHOD,
        parentUnitId: 'parent-1',
        lineStart: 3,
        lineEnd: 5,
      });
      const child2 = makeCodeUnit({
        id: 'child-2',
        name: 'method2',
        unitType: CodeUnitType.METHOD,
        parentUnitId: 'parent-1',
        lineStart: 7,
        lineEnd: 9,
      });
      const parent = makeCodeUnit({
        id: 'parent-1',
        name: 'MyClass',
        unitType: CodeUnitType.CLASS,
        lineStart: 1,
        lineEnd: 10,
        children: [child1, child2],
      });

      repo.save(parent);

      const found = repo.findById('parent-1');
      expect(found).toBeDefined();
      expect(found!.children).toHaveLength(2);
      expect(found!.children[0].id).toBe('child-1');
      expect(found!.children[0].name).toBe('method1');
      expect(found!.children[0].parentUnitId).toBe('parent-1');
      expect(found!.children[1].id).toBe('child-2');
      expect(found!.children[1].name).toBe('method2');
    });

    it('should set parentUnitId on persisted children', () => {
      const child = makeCodeUnit({
        id: 'child-1',
        name: 'method1',
        unitType: CodeUnitType.METHOD,
        parentUnitId: 'parent-1',
        lineStart: 3,
        lineEnd: 5,
      });
      const parent = makeCodeUnit({
        id: 'parent-1',
        name: 'MyClass',
        unitType: CodeUnitType.CLASS,
        lineStart: 1,
        lineEnd: 10,
        children: [child],
      });

      repo.save(parent);

      // The child should be retrievable directly and have the correct parentUnitId
      const foundChild = repo.findById('child-1');
      expect(foundChild).toBeDefined();
      expect(foundChild!.parentUnitId).toBe('parent-1');
    });

    it('should not duplicate children in findAll results', () => {
      const child = makeCodeUnit({
        id: 'child-1',
        name: 'method1',
        unitType: CodeUnitType.METHOD,
        parentUnitId: 'parent-1',
        lineStart: 3,
        lineEnd: 5,
      });
      const parent = makeCodeUnit({
        id: 'parent-1',
        name: 'MyClass',
        unitType: CodeUnitType.CLASS,
        lineStart: 1,
        lineEnd: 10,
        children: [child],
      });

      repo.save(parent);

      const all = repo.findAll();
      // Only the parent should be at top level; child is nested inside
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('parent-1');
      expect(all[0].children).toHaveLength(1);
    });

    it('should not duplicate children in findByFilePath results', () => {
      const child = makeCodeUnit({
        id: 'child-1',
        name: 'method1',
        unitType: CodeUnitType.METHOD,
        parentUnitId: 'parent-1',
        lineStart: 3,
        lineEnd: 5,
      });
      const parent = makeCodeUnit({
        id: 'parent-1',
        name: 'MyClass',
        unitType: CodeUnitType.CLASS,
        lineStart: 1,
        lineEnd: 10,
        children: [child],
      });

      repo.save(parent);

      const results = repo.findByFilePath('src/index.ts');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('parent-1');
      expect(results[0].children).toHaveLength(1);
    });

    it('should delete children when deleting by file path', () => {
      const child = makeCodeUnit({
        id: 'child-1',
        name: 'method1',
        unitType: CodeUnitType.METHOD,
        parentUnitId: 'parent-1',
        lineStart: 3,
        lineEnd: 5,
      });
      const parent = makeCodeUnit({
        id: 'parent-1',
        name: 'MyClass',
        unitType: CodeUnitType.CLASS,
        lineStart: 1,
        lineEnd: 10,
        children: [child],
      });

      repo.save(parent);
      repo.deleteByFilePath('src/index.ts');

      expect(repo.findById('parent-1')).toBeUndefined();
      expect(repo.findById('child-1')).toBeUndefined();
    });

    it('should handle saveBatch with children', () => {
      const child = makeCodeUnit({
        id: 'child-1',
        name: 'method1',
        unitType: CodeUnitType.METHOD,
        parentUnitId: 'parent-1',
        lineStart: 3,
        lineEnd: 5,
      });
      const parent = makeCodeUnit({
        id: 'parent-1',
        name: 'MyClass',
        unitType: CodeUnitType.CLASS,
        lineStart: 1,
        lineEnd: 10,
        children: [child],
      });
      const standalone = makeCodeUnit({ id: 'standalone-1', name: 'helper' });

      repo.saveBatch([parent, standalone]);

      const all = repo.findAll();
      expect(all).toHaveLength(2);

      const foundParent = repo.findById('parent-1');
      expect(foundParent!.children).toHaveLength(1);
    });
  });
});
