/**
 * Shared domain logic for cluster detail views.
 *
 * Extracted from the clusters route handler (MED-007) so the same
 * code-unit collection and dependency classification logic can be
 * reused across the UI routes and (eventually) MCP tools.
 */

import type { ICodeUnitRepository, IFileDependencyRepository, IFileClusterRepository } from '@/domain/ports/index.js';

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

/** Extension fallback map: if a lookup with the original extension finds nothing, try these. */
const EXTENSION_FALLBACKS: Record<string, string[]> = {
  '.js': ['.ts'],
  '.jsx': ['.tsx'],
  '.ts': ['.js'],
  '.tsx': ['.jsx'],
};

/** Extensions to try when the path has no extension at all. */
const EXTENSIONLESS_FALLBACKS = ['.ts', '.tsx', '.js', '.jsx'];

function findCodeUnitsWithFallback(
  codeUnitRepo: ICodeUnitRepository,
  filePath: string,
): ReturnType<ICodeUnitRepository['findByFilePath']> {
  const units = codeUnitRepo.findByFilePath(filePath);
  if (units.length > 0) return units;

  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const hasExtension = lastDot > lastSlash && lastDot > 0;

  if (hasExtension) {
    const ext = filePath.slice(lastDot);
    const base = filePath.slice(0, lastDot);
    const fallbacks = EXTENSION_FALLBACKS[ext];
    if (fallbacks) {
      for (const altExt of fallbacks) {
        const altUnits = codeUnitRepo.findByFilePath(base + altExt);
        if (altUnits.length > 0) return altUnits;
      }
    }
  } else {
    for (const ext of EXTENSIONLESS_FALLBACKS) {
      const altUnits = codeUnitRepo.findByFilePath(filePath + ext);
      if (altUnits.length > 0) return altUnits;
    }
  }

  return [];
}

/**
 * Collect code units for every file path in a cluster.
 *
 * Handles extension mismatches between dependency-graph paths (which may use
 * `.js` extensions from TypeScript ESM imports) and code-unit storage paths
 * (which use the actual source extension, e.g. `.ts`).
 */
export function collectClusterCodeUnits(
  codeUnitRepo: ICodeUnitRepository,
  filePaths: string[],
): ClusterCodeUnit[] {
  const codeUnits: ClusterCodeUnit[] = [];

  for (const fp of filePaths) {
    const units = findCodeUnitsWithFallback(codeUnitRepo, fp);
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

export interface InterClusterEdge {
  sourceClusterId: string;
  targetClusterId: string;
  weight: number;
}

/**
 * Compute directed, weighted edges between clusters based on file-level dependencies.
 *
 * Each edge represents one or more file dependencies from files in the source
 * cluster to files in the target cluster. The weight is the count of such deps.
 * Same-cluster deps and deps involving un-clustered files are ignored.
 */
export function computeInterClusterEdges(
  fileClusterRepo: IFileClusterRepository,
  dependencyRepo: IFileDependencyRepository,
): InterClusterEdge[] {
  // Step 1: Build filePath → clusterId map
  const fileToCluster = new Map<string, string>();
  for (const { cluster, members } of fileClusterRepo.findAll()) {
    for (const member of members) {
      fileToCluster.set(member.filePath, cluster.id);
    }
  }

  // Step 2: Iterate all deps, accumulate weights for cross-cluster pairs
  const weightMap = new Map<string, number>();
  for (const dep of dependencyRepo.findAll()) {
    const sourceClusterId = fileToCluster.get(dep.sourceFile);
    const targetClusterId = fileToCluster.get(dep.targetFile);
    if (!sourceClusterId || !targetClusterId) continue;
    if (sourceClusterId === targetClusterId) continue;

    const key = `${sourceClusterId}->${targetClusterId}`;
    weightMap.set(key, (weightMap.get(key) ?? 0) + 1);
  }

  // Step 3: Convert to array
  const edges: InterClusterEdge[] = [];
  for (const [key, weight] of weightMap) {
    const [sourceClusterId, targetClusterId] = key.split('->');
    edges.push({ sourceClusterId, targetClusterId, weight });
  }

  return edges;
}
