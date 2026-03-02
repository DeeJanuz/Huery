import { describe, it, expect, beforeEach } from 'vitest';

import { generateModulesManifest } from '@/application/manifest/modules-generator.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFileDependencyRepository,
  InMemoryTypeFieldRepository,
  InMemoryFileClusterRepository,
} from '../../helpers/fakes/index.js';
import {
  createCodeUnit,
  createCodeUnitPattern,
  createFileDependency,
  createTypeField,
  createFileCluster,
  createFileClusterMember,
  CodeUnitType,
  PatternType,
} from '@/domain/models/index.js';

describe('generateModulesManifest', () => {
  let repo: InMemoryCodeUnitRepository;
  let depRepo: InMemoryFileDependencyRepository;

  beforeEach(() => {
    repo = new InMemoryCodeUnitRepository();
    depRepo = new InMemoryFileDependencyRepository();
  });

  it('should generate markdown with file groupings', () => {
    repo.save(
      createCodeUnit({
        filePath: 'src/auth/login.ts',
        name: 'login',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 20,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 12,
      }),
    );
    repo.save(
      createCodeUnit({
        filePath: 'src/users/service.ts',
        name: 'getUser',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 10,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 5,
      }),
    );

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('# Modules');
    expect(result).toContain('## src/auth/login.ts');
    expect(result).toContain('## src/users/service.ts');
  });

  it('should list code units with type and complexity', () => {
    repo.save(
      createCodeUnit({
        filePath: 'src/utils.ts',
        name: 'formatDate',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 5,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 3,
      }),
    );
    repo.save(
      createCodeUnit({
        filePath: 'src/utils.ts',
        name: 'fetchData',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 10,
        lineEnd: 25,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 8,
      }),
    );

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('formatDate');
    expect(result).toContain('function');
    expect(result).toContain('complexity: 3');
    expect(result).toContain('fetchData');
    expect(result).toContain('async');
    expect(result).toContain('complexity: 8');
  });

  it('should show methods as children of classes', () => {
    const classUnit = createCodeUnit({
      id: 'class-1',
      filePath: 'src/services/user.ts',
      name: 'UserService',
      unitType: CodeUnitType.CLASS,
      lineStart: 1,
      lineEnd: 50,
      isAsync: false,
      isExported: true,
      language: 'typescript',
      complexityScore: 0,
    });
    const methodUnit = createCodeUnit({
      filePath: 'src/services/user.ts',
      name: 'getUser',
      unitType: CodeUnitType.METHOD,
      lineStart: 5,
      lineEnd: 15,
      parentUnitId: 'class-1',
      isAsync: true,
      isExported: false,
      language: 'typescript',
      complexityScore: 8,
    });

    repo.save(classUnit);
    repo.save(methodUnit);

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('`UserService` - class');
    expect(result).toContain('`getUser`');
    // Method should be indented under class
    const classLine = result.split('\n').find((l) => l.includes('UserService'));
    const methodLine = result.split('\n').find((l) => l.includes('getUser'));
    expect(classLine).toBeDefined();
    expect(methodLine).toBeDefined();
    // Method line should have more indentation
    const classIndent = classLine!.search(/\S/);
    const methodIndent = methodLine!.search(/\S/);
    expect(methodIndent).toBeGreaterThan(classIndent);
  });

  it('should format TYPE_ALIAS units as "type"', () => {
    repo.save(
      createCodeUnit({
        filePath: 'src/types.ts',
        name: 'UserID',
        unitType: CodeUnitType.TYPE_ALIAS,
        lineStart: 1,
        lineEnd: 1,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 0,
        signature: 'string | number',
      }),
    );

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('`UserID` - type');
    expect(result).toContain('string | number');
  });

  it('should handle empty repository', () => {
    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('# Modules');
    expect(result.split('\n').filter((l) => l.trim()).length).toBeLessThanOrEqual(2);
  });

  it('should summarize patterns per file', () => {
    const unit = createCodeUnit({
      id: 'unit-1',
      filePath: 'src/api/routes.ts',
      name: 'getUsers',
      unitType: CodeUnitType.FUNCTION,
      lineStart: 1,
      lineEnd: 20,
      isAsync: true,
      isExported: true,
      language: 'typescript',
      complexityScore: 10,
      patterns: [
        createCodeUnitPattern({
          codeUnitId: 'unit-1',
          patternType: PatternType.API_ENDPOINT,
          patternValue: 'GET /api/users',
        }),
        createCodeUnitPattern({
          codeUnitId: 'unit-1',
          patternType: PatternType.DATABASE_READ,
          patternValue: 'prisma.user.findMany',
        }),
      ],
    });
    repo.save(unit);

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('API_ENDPOINT');
    expect(result).toContain('DATABASE_READ');
  });

  it('should include signature for exported units that have signatures', () => {
    repo.save(
      createCodeUnit({
        filePath: 'src/api/handler.ts',
        name: 'fetchUser',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 20,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 5,
        signature: '(userId: string): Promise<User>',
      }),
    );

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain(
      '`fetchUser` - async function(userId: string): Promise<User>, complexity: 5',
    );
  });

  it('should not include signature for non-exported units even if they have one', () => {
    repo.save(
      createCodeUnit({
        filePath: 'src/internal/helper.ts',
        name: 'internalHelper',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 10,
        isAsync: false,
        isExported: false,
        language: 'typescript',
        complexityScore: 2,
        signature: '(x: number): number',
      }),
    );

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('`internalHelper` - function, complexity: 2');
    expect(result).not.toContain('(x: number): number');
  });

  it('should handle exported units with no signature gracefully', () => {
    repo.save(
      createCodeUnit({
        filePath: 'src/config.ts',
        name: 'AppConfig',
        unitType: CodeUnitType.CLASS,
        lineStart: 1,
        lineEnd: 30,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 0,
      }),
    );

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result).toContain('`AppConfig` - class');
    expect(result).not.toContain('undefined');
  });

  it('should respect token budget', () => {
    // Add many code units to exceed a small budget
    for (let i = 0; i < 50; i++) {
      repo.save(
        createCodeUnit({
          filePath: `src/modules/module-${i}.ts`,
          name: `function${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: i,
        }),
      );
    }

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 50 }); // very small budget
    // Result should be truncated
    expect(result.length).toBeLessThan(300); // 50 tokens * ~4 chars + some buffer
  });

  it('should order files by relevance score, not alphabetically', () => {
    // File z-low.ts: 1 export, 0 patterns => score = 3
    repo.save(
      createCodeUnit({
        filePath: 'src/z-low.ts',
        name: 'lowFunc',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 5,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 1,
      }),
    );

    // File a-high.ts: 4 exports + 2 patterns => score = 4*3 + 2*2 = 16
    for (let i = 0; i < 4; i++) {
      repo.save(
        createCodeUnit({
          id: `high-${i}`,
          filePath: 'src/a-high.ts',
          name: `highFunc${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: i * 10 + 1,
          lineEnd: i * 10 + 9,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 1,
          patterns:
            i < 2
              ? [
                  createCodeUnitPattern({
                    codeUnitId: `high-${i}`,
                    patternType: PatternType.API_ENDPOINT,
                    patternValue: `GET /api/${i}`,
                  }),
                ]
              : [],
        }),
      );
    }

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    // a-high.ts (score 16) should appear before z-low.ts (score 3)
    // despite z-low coming first alphabetically
    expect(result.indexOf('a-high.ts')).toBeLessThan(result.indexOf('z-low.ts'));
  });

  it('should score fan-in dependencies', () => {
    // File with many importers (high fan-in) should rank higher
    repo.save(
      createCodeUnit({
        filePath: 'src/shared/utils.ts',
        name: 'helper',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 5,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 1,
      }),
    );

    // File with no importers
    repo.save(
      createCodeUnit({
        filePath: 'src/a-leaf.ts',
        name: 'leafFunc',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 5,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 1,
      }),
    );

    // 5 files import shared/utils.ts => +5 fan-in
    for (let i = 0; i < 5; i++) {
      depRepo.save(
        createFileDependency({
          sourceFile: `src/consumer-${i}.ts`,
          targetFile: 'src/shared/utils.ts',
        }),
      );
    }

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    // shared/utils.ts (score: 3 export + 5 fan-in = 8) should appear
    // before a-leaf.ts (score: 3 export + 0 fan-in = 3)
    expect(result.indexOf('shared/utils.ts')).toBeLessThan(result.indexOf('a-leaf.ts'));
  });

  it('should score complexity >= 15', () => {
    // File with high complexity unit
    repo.save(
      createCodeUnit({
        filePath: 'src/z-complex.ts',
        name: 'complexFunc',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 100,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 20,
      }),
    );

    // File with low complexity
    repo.save(
      createCodeUnit({
        filePath: 'src/a-simple.ts',
        name: 'simpleFunc',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 5,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 2,
      }),
    );

    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    // z-complex.ts (score: 3 export + 1 complexity = 4) should appear
    // before a-simple.ts (score: 3 export + 0 complexity = 3)
    expect(result.indexOf('z-complex.ts')).toBeLessThan(result.indexOf('a-simple.ts'));
  });

  it('should show omission summary when budget is small', () => {
    for (let i = 0; i < 10; i++) {
      repo.save(
        createCodeUnit({
          filePath: `src/mod-${i}.ts`,
          name: `fn${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 1,
        }),
      );
    }

    // Budget small enough that not all 10 files fit
    const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 30 });

    expect(result).toContain('more files available via MCP tools');
  });

  it('should maintain stable ordering for files with equal scores', () => {
    // Create files with identical scores - order should be stable (deterministic)
    const files = ['src/b-file.ts', 'src/a-file.ts', 'src/c-file.ts'];
    for (const filePath of files) {
      repo.save(
        createCodeUnit({
          filePath,
          name: `func_${filePath}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 5,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 1,
        }),
      );
    }

    const result1 = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });
    const result2 = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

    expect(result1).toBe(result2);
  });

  describe('type fields integration', () => {
    let typeFieldRepo: InMemoryTypeFieldRepository;

    beforeEach(() => {
      typeFieldRepo = new InMemoryTypeFieldRepository();
    });

    it('should show type fields inline under interfaces when typeFieldRepo is provided', () => {
      const unitId = 'iface-1';
      repo.save(
        createCodeUnit({
          id: unitId,
          filePath: 'src/models/user.ts',
          name: 'User',
          unitType: CodeUnitType.INTERFACE,
          lineStart: 1,
          lineEnd: 10,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 0,
        }),
      );

      typeFieldRepo.save(
        createTypeField({
          parentUnitId: unitId,
          name: 'id',
          fieldType: 'string',
          isOptional: false,
          isReadonly: false,
          lineNumber: 2,
        }),
      );
      typeFieldRepo.save(
        createTypeField({
          parentUnitId: unitId,
          name: 'email',
          fieldType: 'string',
          isOptional: false,
          isReadonly: false,
          lineNumber: 3,
        }),
      );
      typeFieldRepo.save(
        createTypeField({
          parentUnitId: unitId,
          name: 'name',
          fieldType: 'string',
          isOptional: true,
          isReadonly: false,
          lineNumber: 4,
        }),
      );
      typeFieldRepo.save(
        createTypeField({
          parentUnitId: unitId,
          name: 'createdAt',
          fieldType: 'Date',
          isOptional: false,
          isReadonly: true,
          lineNumber: 5,
        }),
      );

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, typeFieldRepo });

      expect(result).toContain('`User` - interface');
      expect(result).toContain('  - id: string');
      expect(result).toContain('  - email: string');
      expect(result).toContain('  - name?: string (optional)');
      expect(result).toContain('  - readonly createdAt: Date');
    });

    it('should show type fields under classes', () => {
      const classId = 'class-tf-1';
      repo.save(
        createCodeUnit({
          id: classId,
          filePath: 'src/models/config.ts',
          name: 'AppConfig',
          unitType: CodeUnitType.CLASS,
          lineStart: 1,
          lineEnd: 20,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 0,
        }),
      );

      typeFieldRepo.save(
        createTypeField({
          parentUnitId: classId,
          name: 'port',
          fieldType: 'number',
          isOptional: false,
          isReadonly: false,
          lineNumber: 2,
        }),
      );

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, typeFieldRepo });

      expect(result).toContain('`AppConfig` - class');
      expect(result).toContain('  - port: number');
    });

    it('should show type fields under type aliases, structs, and enums', () => {
      const typeId = 'type-1';
      repo.save(
        createCodeUnit({
          id: typeId,
          filePath: 'src/types.ts',
          name: 'Options',
          unitType: CodeUnitType.TYPE_ALIAS,
          lineStart: 1,
          lineEnd: 5,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 0,
        }),
      );

      typeFieldRepo.save(
        createTypeField({
          parentUnitId: typeId,
          name: 'verbose',
          fieldType: 'boolean',
          isOptional: true,
          isReadonly: false,
          lineNumber: 2,
        }),
      );

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, typeFieldRepo });

      expect(result).toContain('`Options` - type');
      expect(result).toContain('  - verbose?: boolean (optional)');
    });

    it('should not show type fields for functions or methods', () => {
      const funcId = 'func-tf-1';
      repo.save(
        createCodeUnit({
          id: funcId,
          filePath: 'src/service.ts',
          name: 'doWork',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
        }),
      );

      // Even if type fields exist for a function (shouldn't normally happen),
      // they should not be rendered
      typeFieldRepo.save(
        createTypeField({
          parentUnitId: funcId,
          name: 'strayField',
          fieldType: 'string',
          isOptional: false,
          isReadonly: false,
          lineNumber: 2,
        }),
      );

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, typeFieldRepo });

      expect(result).toContain('`doWork` - function');
      expect(result).not.toContain('strayField');
    });

    it('should work without typeFieldRepo (backward compat)', () => {
      repo.save(
        createCodeUnit({
          id: 'compat-1',
          filePath: 'src/compat.ts',
          name: 'MyInterface',
          unitType: CodeUnitType.INTERFACE,
          lineStart: 1,
          lineEnd: 10,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 0,
        }),
      );

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

      expect(result).toContain('`MyInterface` - interface');
      // No type fields should appear since no repo was provided
    });

    it('should indent type fields deeper than the code unit', () => {
      const unitId = 'indent-1';
      repo.save(
        createCodeUnit({
          id: unitId,
          filePath: 'src/models/test.ts',
          name: 'TestType',
          unitType: CodeUnitType.INTERFACE,
          lineStart: 1,
          lineEnd: 5,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 0,
        }),
      );

      typeFieldRepo.save(
        createTypeField({
          parentUnitId: unitId,
          name: 'value',
          fieldType: 'number',
          isOptional: false,
          isReadonly: false,
          lineNumber: 2,
        }),
      );

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, typeFieldRepo });

      const unitLine = result.split('\n').find((l) => l.includes('TestType'));
      const fieldLine = result.split('\n').find((l) => l.includes('value: number'));
      expect(unitLine).toBeDefined();
      expect(fieldLine).toBeDefined();
      const unitIndent = unitLine!.search(/\S/);
      const fieldIndent = fieldLine!.search(/\S/);
      expect(fieldIndent).toBeGreaterThan(unitIndent);
    });
  });

  describe('feature areas (file clusters)', () => {
    let clusterRepo: InMemoryFileClusterRepository;

    beforeEach(() => {
      clusterRepo = new InMemoryFileClusterRepository();
    });

    it('should show Feature Areas section when clusters exist', () => {
      const cluster = createFileCluster({
        id: 'cluster-1',
        name: 'api',
        cohesion: 0.85,
        internalEdges: 10,
        externalEdges: 2,
      });
      clusterRepo.save(cluster, [
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/api/router.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/api/handler.ts', isEntryPoint: false }),
      ]);

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      expect(result).toContain('## Feature Areas (Import Graph Clusters)');
      expect(result).toContain('### api');
    });

    it('should show cohesion and file count for each cluster', () => {
      const cluster = createFileCluster({
        id: 'cluster-1',
        name: 'storage',
        cohesion: 0.92,
        internalEdges: 8,
        externalEdges: 1,
      });
      clusterRepo.save(cluster, [
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/storage/index.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/storage/db.ts', isEntryPoint: false }),
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/storage/cache.ts', isEntryPoint: false }),
      ]);

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      expect(result).toContain('### storage (cohesion: 0.92, 3 files)');
    });

    it('should list entry points for each cluster', () => {
      const cluster = createFileCluster({
        id: 'cluster-1',
        name: 'api',
        cohesion: 0.85,
        internalEdges: 10,
        externalEdges: 2,
      });
      clusterRepo.save(cluster, [
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/api/router.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/api/middleware.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: 'cluster-1', filePath: 'src/api/handler.ts', isEntryPoint: false }),
      ]);

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      expect(result).toContain('Entry points: src/api/router.ts, src/api/middleware.ts');
    });

    it('should sort clusters by file count descending', () => {
      const smallCluster = createFileCluster({
        id: 'cluster-small',
        name: 'utils',
        cohesion: 0.90,
        internalEdges: 2,
        externalEdges: 1,
      });
      clusterRepo.save(smallCluster, [
        createFileClusterMember({ clusterId: 'cluster-small', filePath: 'src/utils/a.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: 'cluster-small', filePath: 'src/utils/b.ts', isEntryPoint: false }),
      ]);

      const largeCluster = createFileCluster({
        id: 'cluster-large',
        name: 'api',
        cohesion: 0.80,
        internalEdges: 15,
        externalEdges: 5,
      });
      clusterRepo.save(largeCluster, [
        createFileClusterMember({ clusterId: 'cluster-large', filePath: 'src/api/a.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: 'cluster-large', filePath: 'src/api/b.ts', isEntryPoint: false }),
        createFileClusterMember({ clusterId: 'cluster-large', filePath: 'src/api/c.ts', isEntryPoint: false }),
        createFileClusterMember({ clusterId: 'cluster-large', filePath: 'src/api/d.ts', isEntryPoint: false }),
        createFileClusterMember({ clusterId: 'cluster-large', filePath: 'src/api/e.ts', isEntryPoint: false }),
      ]);

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      expect(result.indexOf('### api')).toBeLessThan(result.indexOf('### utils'));
    });

    it('should aggregate and show top patterns from cluster files', () => {
      // Create code units in files belonging to the cluster
      repo.save(
        createCodeUnit({
          id: 'cu-1',
          filePath: 'src/api/router.ts',
          name: 'getUsers',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 20,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
          patterns: [
            createCodeUnitPattern({ codeUnitId: 'cu-1', patternType: PatternType.API_ENDPOINT, patternValue: 'GET /users' }),
          ],
        }),
      );
      repo.save(
        createCodeUnit({
          id: 'cu-2',
          filePath: 'src/api/router.ts',
          name: 'createUser',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 25,
          lineEnd: 50,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 8,
          patterns: [
            createCodeUnitPattern({ codeUnitId: 'cu-2', patternType: PatternType.API_ENDPOINT, patternValue: 'POST /users' }),
            createCodeUnitPattern({ codeUnitId: 'cu-2', patternType: PatternType.DATABASE_WRITE, patternValue: 'prisma.user.create' }),
          ],
        }),
      );
      repo.save(
        createCodeUnit({
          id: 'cu-3',
          filePath: 'src/api/handler.ts',
          name: 'handleAuth',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 15,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 6,
          patterns: [
            createCodeUnitPattern({ codeUnitId: 'cu-3', patternType: PatternType.EXTERNAL_SERVICE, patternValue: 'jwt.verify' }),
          ],
        }),
      );

      const cluster = createFileCluster({
        id: 'cluster-api',
        name: 'api',
        cohesion: 0.85,
        internalEdges: 10,
        externalEdges: 2,
      });
      clusterRepo.save(cluster, [
        createFileClusterMember({ clusterId: 'cluster-api', filePath: 'src/api/router.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: 'cluster-api', filePath: 'src/api/handler.ts', isEntryPoint: false }),
      ]);

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      expect(result).toContain('Top patterns: API_ENDPOINT (2), DATABASE_WRITE (1), EXTERNAL_SERVICE (1)');
    });

    it('should limit top patterns to 5', () => {
      // Create code units with 6 different pattern types
      const patternTypes = [
        PatternType.API_ENDPOINT,
        PatternType.DATABASE_READ,
        PatternType.DATABASE_WRITE,
        PatternType.API_CALL,
        PatternType.EXTERNAL_SERVICE,
        PatternType.ENV_VARIABLE,
      ];
      for (let i = 0; i < patternTypes.length; i++) {
        repo.save(
          createCodeUnit({
            id: `cu-limit-${i}`,
            filePath: 'src/big/file.ts',
            name: `func${i}`,
            unitType: CodeUnitType.FUNCTION,
            lineStart: i * 10 + 1,
            lineEnd: i * 10 + 9,
            isAsync: false,
            isExported: true,
            language: 'typescript',
            complexityScore: 1,
            patterns: [
              createCodeUnitPattern({ codeUnitId: `cu-limit-${i}`, patternType: patternTypes[i], patternValue: `val-${i}` }),
            ],
          }),
        );
      }

      const cluster = createFileCluster({
        id: 'cluster-big',
        name: 'big',
        cohesion: 0.70,
        internalEdges: 5,
        externalEdges: 3,
      });
      clusterRepo.save(cluster, [
        createFileClusterMember({ clusterId: 'cluster-big', filePath: 'src/big/file.ts', isEntryPoint: true }),
      ]);

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      // Count pattern entries in the Top patterns line
      const clusterSection = result.substring(result.indexOf('### big'));
      const patternsLine = clusterSection.split('\n').find((l) => l.startsWith('Top patterns:'));
      expect(patternsLine).toBeDefined();
      // Count commas + 1 = number of patterns
      const patternCount = (patternsLine!.match(/\(/g) ?? []).length;
      expect(patternCount).toBeLessThanOrEqual(5);
    });

    it('should not show Feature Areas section when fileClusterRepo is not provided', () => {
      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000 });

      expect(result).not.toContain('Feature Areas');
    });

    it('should not show Feature Areas section when no clusters exist', () => {
      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      expect(result).not.toContain('Feature Areas');
    });

    it('should respect token budget for cluster section', () => {
      // Create many clusters to exceed a small budget
      for (let i = 0; i < 20; i++) {
        const cluster = createFileCluster({
          id: `cluster-${i}`,
          name: `cluster-with-a-long-name-${i}`,
          cohesion: 0.80,
          internalEdges: 5,
          externalEdges: 2,
        });
        const members = [];
        for (let j = 0; j < 5; j++) {
          members.push(
            createFileClusterMember({
              clusterId: `cluster-${i}`,
              filePath: `src/cluster-${i}/file-${j}.ts`,
              isEntryPoint: j === 0,
            }),
          );
        }
        clusterRepo.save(cluster, members);
      }

      // Very small budget — not all clusters can fit
      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 50, fileClusterRepo: clusterRepo });

      // Result should be bounded
      expect(result.length).toBeLessThan(300);
    });

    it('should show no Top patterns line when cluster files have no patterns', () => {
      repo.save(
        createCodeUnit({
          filePath: 'src/clean/index.ts',
          name: 'cleanFunc',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 1,
        }),
      );

      const cluster = createFileCluster({
        id: 'cluster-clean',
        name: 'clean',
        cohesion: 0.95,
        internalEdges: 3,
        externalEdges: 0,
      });
      clusterRepo.save(cluster, [
        createFileClusterMember({ clusterId: 'cluster-clean', filePath: 'src/clean/index.ts', isEntryPoint: true }),
      ]);

      const result = generateModulesManifest({ codeUnitRepo: repo, dependencyRepo: depRepo, maxTokens: 5000, fileClusterRepo: clusterRepo });

      expect(result).toContain('### clean');
      // The cluster section should not have a Top patterns line
      const clusterSection = result.substring(result.indexOf('### clean'));
      expect(clusterSection).not.toContain('Top patterns:');
    });
  });
});
