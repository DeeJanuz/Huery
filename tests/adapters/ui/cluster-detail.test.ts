import { describe, it, expect, beforeEach } from 'vitest';
import { collectClusterCodeUnits, classifyClusterDependencies } from '@/adapters/ui/cluster-detail.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFileDependencyRepository,
} from '../../helpers/fakes/index.js';
import {
  createCodeUnit,
  CodeUnitType,
  createCodeUnitPattern,
  PatternType,
  createFileDependency,
  ImportType,
} from '@/domain/models/index.js';

describe('collectClusterCodeUnits', () => {
  let codeUnitRepo: InMemoryCodeUnitRepository;

  beforeEach(() => {
    codeUnitRepo = new InMemoryCodeUnitRepository();
  });

  it('should return code units for multiple file paths', () => {
    const unitA = createCodeUnit({
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: false, isExported: true, language: 'typescript',
    });
    const unitB = createCodeUnit({
      filePath: 'src/b.ts', name: 'fnB', unitType: CodeUnitType.FUNCTION,
      lineStart: 5, lineEnd: 20, isAsync: true, isExported: false, language: 'typescript',
    });
    codeUnitRepo.save(unitA);
    codeUnitRepo.save(unitB);

    const result = collectClusterCodeUnits(codeUnitRepo, ['src/a.ts', 'src/b.ts']);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('fnA');
    expect(result[1].name).toBe('fnB');
  });

  it('should return empty array for empty file paths', () => {
    const result = collectClusterCodeUnits(codeUnitRepo, []);
    expect(result).toEqual([]);
  });

  it('should return empty array when no code units match the file paths', () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/other.ts', name: 'fnOther', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
    }));

    const result = collectClusterCodeUnits(codeUnitRepo, ['src/a.ts']);
    expect(result).toEqual([]);
  });

  it('should map complexity score of 0 to undefined', () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
      complexityScore: 0,
    }));

    const result = collectClusterCodeUnits(codeUnitRepo, ['src/a.ts']);
    expect(result[0].complexity).toBeUndefined();
  });

  it('should include complexity score when greater than 0', () => {
    codeUnitRepo.save(createCodeUnit({
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 5, isAsync: false, isExported: true, language: 'typescript',
      complexityScore: 7,
    }));

    const result = collectClusterCodeUnits(codeUnitRepo, ['src/a.ts']);
    expect(result[0].complexity).toBe(7);
  });

  it('should include mapped patterns', () => {
    const unitId = 'unit-1';
    const pattern = createCodeUnitPattern({
      codeUnitId: unitId,
      patternType: PatternType.API_ENDPOINT,
      patternValue: 'GET /api/users',
    });
    codeUnitRepo.save(createCodeUnit({
      id: unitId,
      filePath: 'src/a.ts', name: 'getUsers', unitType: CodeUnitType.FUNCTION,
      lineStart: 1, lineEnd: 10, isAsync: true, isExported: true, language: 'typescript',
      patterns: [pattern],
    }));

    const result = collectClusterCodeUnits(codeUnitRepo, ['src/a.ts']);
    expect(result[0].patterns).toEqual([
      { patternType: PatternType.API_ENDPOINT, patternValue: 'GET /api/users' },
    ]);
  });

  it('should include all expected fields in the output', () => {
    codeUnitRepo.save(createCodeUnit({
      id: 'u1',
      filePath: 'src/a.ts', name: 'fnA', unitType: CodeUnitType.CLASS,
      lineStart: 1, lineEnd: 50, isAsync: false, isExported: true, language: 'typescript',
      signature: 'class MyClass',
    }));

    const result = collectClusterCodeUnits(codeUnitRepo, ['src/a.ts']);
    expect(result[0]).toMatchObject({
      id: 'u1',
      name: 'fnA',
      filePath: 'src/a.ts',
      unitType: CodeUnitType.CLASS,
      lineStart: 1,
      lineEnd: 50,
      signature: 'class MyClass',
    });
  });
});

describe('classifyClusterDependencies', () => {
  let dependencyRepo: InMemoryFileDependencyRepository;

  beforeEach(() => {
    dependencyRepo = new InMemoryFileDependencyRepository();
  });

  it('should classify internal dependencies (both files in cluster)', () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));

    const clusterFiles = ['src/a.ts', 'src/b.ts'];
    const clusterFileSet = new Set(clusterFiles);

    const result = classifyClusterDependencies(dependencyRepo, clusterFiles, clusterFileSet);

    expect(result.internalDeps).toHaveLength(1);
    expect(result.internalDeps[0]).toEqual({ source: 'src/a.ts', target: 'src/b.ts' });
    expect(result.externalDeps).toHaveLength(0);
  });

  it('should classify outbound external dependencies', () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/external.ts', importType: ImportType.NAMED,
    }));

    const clusterFiles = ['src/a.ts'];
    const clusterFileSet = new Set(clusterFiles);

    const result = classifyClusterDependencies(dependencyRepo, clusterFiles, clusterFileSet);

    expect(result.internalDeps).toHaveLength(0);
    expect(result.externalDeps).toHaveLength(1);
    expect(result.externalDeps[0]).toEqual({
      source: 'src/a.ts', target: 'src/external.ts', direction: 'outbound',
    });
  });

  it('should classify inbound external dependencies', () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/external.ts', targetFile: 'src/a.ts', importType: ImportType.NAMED,
    }));

    const clusterFiles = ['src/a.ts'];
    const clusterFileSet = new Set(clusterFiles);

    const result = classifyClusterDependencies(dependencyRepo, clusterFiles, clusterFileSet);

    expect(result.internalDeps).toHaveLength(0);
    expect(result.externalDeps).toHaveLength(1);
    expect(result.externalDeps[0]).toEqual({
      source: 'src/external.ts', target: 'src/a.ts', direction: 'inbound',
    });
  });

  it('should deduplicate dependencies', () => {
    // The same dependency seen from both source and target file lookups
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));

    const clusterFiles = ['src/a.ts', 'src/b.ts'];
    const clusterFileSet = new Set(clusterFiles);

    const result = classifyClusterDependencies(dependencyRepo, clusterFiles, clusterFileSet);

    // Should appear exactly once even though a.ts outgoing and b.ts incoming both match
    expect(result.internalDeps).toHaveLength(1);
  });

  it('should return empty results for empty file paths', () => {
    const result = classifyClusterDependencies(dependencyRepo, [], new Set());

    expect(result.internalDeps).toEqual([]);
    expect(result.externalDeps).toEqual([]);
  });

  it('should handle mixed internal and external dependencies', () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'lib/utils.ts', importType: ImportType.NAMED,
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'lib/other.ts', targetFile: 'src/b.ts', importType: ImportType.DEFAULT,
    }));

    const clusterFiles = ['src/a.ts', 'src/b.ts'];
    const clusterFileSet = new Set(clusterFiles);

    const result = classifyClusterDependencies(dependencyRepo, clusterFiles, clusterFileSet);

    expect(result.internalDeps).toHaveLength(1);
    expect(result.externalDeps).toHaveLength(2);

    const outbound = result.externalDeps.find(d => d.direction === 'outbound');
    expect(outbound).toEqual({ source: 'src/a.ts', target: 'lib/utils.ts', direction: 'outbound' });

    const inbound = result.externalDeps.find(d => d.direction === 'inbound');
    expect(inbound).toEqual({ source: 'lib/other.ts', target: 'src/b.ts', direction: 'inbound' });
  });
});
