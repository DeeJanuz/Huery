/**
 * Shared module: similar unit discovery.
 * Scores code units by type match, pattern overlap, and cluster membership
 * to find units similar to a target.
 */

import type { CodeUnit } from '@/domain/models/index.js';
import type { IFileClusterRepository } from '@/domain/ports/index.js';

export function findSimilarUnits(
  target: CodeUnit,
  allUnits: CodeUnit[],
  fileClusterRepo?: IFileClusterRepository,
): CodeUnit[] {
  const targetPatternTypes = new Set(target.patterns.map((p) => p.patternType));

  // Look up the target's file cluster
  let targetClusterFilePaths: Set<string> | undefined;
  if (fileClusterRepo) {
    const clusterResult = fileClusterRepo.findByFilePath(target.filePath);
    if (clusterResult) {
      targetClusterFilePaths = new Set(clusterResult.members.map((m) => m.filePath));
    }
  }

  const scored = allUnits
    .filter((u) => u.id !== target.id)
    .map((unit) => {
      let score = 0;

      // Same unit type: +2
      if (unit.unitType === target.unitType) {
        score += 2;
      }

      // Overlapping pattern types: +1 per match
      for (const pattern of unit.patterns) {
        if (targetPatternTypes.has(pattern.patternType)) {
          score += 1;
        }
      }

      // Same file cluster: +1
      if (targetClusterFilePaths?.has(unit.filePath)) {
        score += 1;
      }

      return { unit, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map((s) => s.unit);
}
