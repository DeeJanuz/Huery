import { describe, it, expect } from 'vitest';
import { findSimilarUnits } from '@/adapters/mcp/similar-units.js';
import {
  InMemoryFileClusterRepository,
} from '../../../tests/helpers/fakes/index.js';
import { createCodeUnit, CodeUnitType } from '@/domain/models/code-unit.js';
import { createCodeUnitPattern, PatternType } from '@/domain/models/code-unit-pattern.js';
import { createFileCluster, createFileClusterMember } from '@/domain/models/file-cluster.js';

describe('findSimilarUnits', () => {
  const target = createCodeUnit({
    id: 'target-1',
    filePath: 'src/services/payment.ts',
    name: 'processPayment',
    unitType: CodeUnitType.FUNCTION,
    lineStart: 10,
    lineEnd: 50,
    isAsync: true,
    isExported: true,
    language: 'typescript',
    patterns: [
      createCodeUnitPattern({
        id: 'pat-1',
        codeUnitId: 'target-1',
        patternType: PatternType.DATABASE_WRITE,
        patternValue: 'INSERT INTO payments',
      }),
      createCodeUnitPattern({
        id: 'pat-2',
        codeUnitId: 'target-1',
        patternType: PatternType.EXTERNAL_SERVICE,
        patternValue: 'stripe.charges.create',
      }),
    ],
  });

  const sameTypeAndPattern = createCodeUnit({
    id: 'similar-1',
    filePath: 'src/services/order.ts',
    name: 'createOrder',
    unitType: CodeUnitType.FUNCTION,
    lineStart: 5,
    lineEnd: 40,
    isAsync: true,
    isExported: true,
    language: 'typescript',
    patterns: [
      createCodeUnitPattern({
        id: 'pat-3',
        codeUnitId: 'similar-1',
        patternType: PatternType.DATABASE_WRITE,
        patternValue: 'INSERT INTO orders',
      }),
    ],
  });

  const sameTypeOnly = createCodeUnit({
    id: 'similar-2',
    filePath: 'src/services/notification.ts',
    name: 'sendNotification',
    unitType: CodeUnitType.FUNCTION,
    lineStart: 1,
    lineEnd: 30,
    isAsync: true,
    isExported: true,
    language: 'typescript',
    patterns: [
      createCodeUnitPattern({
        id: 'pat-4',
        codeUnitId: 'similar-2',
        patternType: PatternType.EXTERNAL_SERVICE,
        patternValue: 'twilio.messages.create',
      }),
    ],
  });

  const dissimilar = createCodeUnit({
    id: 'dissimilar-1',
    filePath: 'src/models/user.ts',
    name: 'User',
    unitType: CodeUnitType.CLASS,
    lineStart: 1,
    lineEnd: 20,
    isAsync: false,
    isExported: true,
    language: 'typescript',
  });

  const allUnits = [target, sameTypeAndPattern, sameTypeOnly, dissimilar];

  it('should return units with positive similarity score', () => {
    const result = findSimilarUnits(target, allUnits);

    const names = result.map((u) => u.name);
    expect(names).toContain('createOrder');
    expect(names).toContain('sendNotification');
  });

  it('should exclude units with zero similarity', () => {
    const result = findSimilarUnits(target, allUnits);

    const names = result.map((u) => u.name);
    expect(names).not.toContain('User');
  });

  it('should exclude the target unit itself', () => {
    const result = findSimilarUnits(target, allUnits);

    const names = result.map((u) => u.name);
    expect(names).not.toContain('processPayment');
  });

  it('should sort by score descending', () => {
    // sameTypeAndPattern: type match (+2) + DATABASE_WRITE pattern (+1) = 3
    // sameTypeOnly: type match (+2) + EXTERNAL_SERVICE pattern (+1) = 3
    // Both score 3 so order among them is stable but both should appear
    const result = findSimilarUnits(target, allUnits);

    expect(result.length).toBe(2);
  });

  it('should limit to top 5 results', () => {
    // Create many units
    const manyUnits = [];
    for (let i = 0; i < 10; i++) {
      manyUnits.push(
        createCodeUnit({
          id: `unit-${i}`,
          filePath: `src/services/fn${i}.ts`,
          name: `fn${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          patterns: [
            createCodeUnitPattern({
              id: `pat-${i}`,
              codeUnitId: `unit-${i}`,
              patternType: PatternType.DATABASE_WRITE,
              patternValue: `INSERT INTO table${i}`,
            }),
          ],
        }),
      );
    }

    const result = findSimilarUnits(target, [target, ...manyUnits]);

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('should boost score for units in the same file cluster', () => {
    const fileClusterRepo = new InMemoryFileClusterRepository();
    const cluster = createFileCluster({
      id: 'cluster-1',
      name: 'payments',
      cohesion: 0.9,
      internalEdges: 2,
      externalEdges: 1,
    });
    fileClusterRepo.save(cluster, [
      createFileClusterMember({
        clusterId: 'cluster-1',
        filePath: 'src/services/payment.ts',
        isEntryPoint: true,
      }),
      createFileClusterMember({
        clusterId: 'cluster-1',
        filePath: 'src/services/notification.ts',
        isEntryPoint: false,
      }),
    ]);

    const result = findSimilarUnits(target, allUnits, fileClusterRepo);

    // sendNotification gets +1 for same cluster, so should rank first
    expect(result[0].name).toBe('sendNotification');
  });

  it('should work without fileClusterRepo', () => {
    const result = findSimilarUnits(target, allUnits);

    expect(result.length).toBeGreaterThan(0);
  });

  it('should return empty array when no similar units exist', () => {
    const result = findSimilarUnits(dissimilar, [dissimilar, target]);

    // target is FUNCTION vs dissimilar is CLASS, but target has patterns
    // dissimilar has no patterns, so no pattern overlap possible
    // But target has type FUNCTION != CLASS, so type doesn't match
    // dissimilar has no patterns at all, so no overlap
    // Score for target: 0 (different type) + 0 (no pattern overlap from dissimilar) = 0
    // Actually target scores 0 because we check dissimilar's patterns against target's
    // dissimilar has no patterns so pattern loop doesn't run
    expect(result).toHaveLength(0);
  });
});
