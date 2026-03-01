/**
 * Shared domain logic for cluster detail views.
 *
 * Extracted from the clusters route handler (MED-007) so the same
 * code-unit collection and dependency classification logic can be
 * reused across the UI routes and (eventually) MCP tools.
 */

import type { ICodeUnitRepository, IFileDependencyRepository } from '@/domain/ports/index.js';

export interface ClusterCodeUnit {
  id: string;
  name: string;
  filePath: string;
  unitType: string;
  lineStart: number;
  lineEnd: number;
  signature: string | undefined;
  complexity: number | undefined;
  patterns: Array<{ patternType: string; patternValue: string }>;
}

export interface ClassifiedDependencies {
  internalDeps: Array<{ source: string; target: string }>;
  externalDeps: Array<{ source: string; target: string; direction: 'inbound' | 'outbound' }>;
}

/**
 * Collect code units for every file path in a cluster.
 */
export function collectClusterCodeUnits(
  codeUnitRepo: ICodeUnitRepository,
  filePaths: string[],
): ClusterCodeUnit[] {
  const codeUnits: ClusterCodeUnit[] = [];

  for (const fp of filePaths) {
    const units = codeUnitRepo.findByFilePath(fp);
    for (const unit of units) {
      codeUnits.push({
        id: unit.id,
        name: unit.name,
        filePath: unit.filePath,
        unitType: unit.unitType,
        lineStart: unit.lineStart,
        lineEnd: unit.lineEnd,
        signature: unit.signature,
        complexity: unit.complexityScore > 0 ? unit.complexityScore : undefined,
        patterns: unit.patterns.map((p) => ({
          patternType: p.patternType,
          patternValue: p.patternValue,
        })),
      });
    }
  }

  return codeUnits;
}

/**
 * Classify dependencies as internal (both endpoints inside the cluster)
 * or external (one endpoint outside), with direction for externals.
 */
export function classifyClusterDependencies(
  dependencyRepo: IFileDependencyRepository,
  filePaths: string[],
  clusterFileSet: Set<string>,
): ClassifiedDependencies {
  const internalDeps: ClassifiedDependencies['internalDeps'] = [];
  const externalDeps: ClassifiedDependencies['externalDeps'] = [];
  const seen = new Set<string>();

  for (const fp of filePaths) {
    const outgoing = dependencyRepo.findBySourceFile(fp);
    for (const dep of outgoing) {
      const key = `${dep.sourceFile}->${dep.targetFile}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (clusterFileSet.has(dep.targetFile)) {
        internalDeps.push({ source: dep.sourceFile, target: dep.targetFile });
      } else {
        externalDeps.push({
          source: dep.sourceFile,
          target: dep.targetFile,
          direction: 'outbound',
        });
      }
    }

    const incoming = dependencyRepo.findByTargetFile(fp);
    for (const dep of incoming) {
      const key = `${dep.sourceFile}->${dep.targetFile}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!clusterFileSet.has(dep.sourceFile)) {
        externalDeps.push({
          source: dep.sourceFile,
          target: dep.targetFile,
          direction: 'inbound',
        });
      }
    }
  }

  return { internalDeps, externalDeps };
}
