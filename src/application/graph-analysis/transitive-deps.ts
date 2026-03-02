import type { FileDependency } from '@/domain/models/index.js';
import { buildAdjacencyGraph } from '@/application/graph-analysis/graph-utils.js';

export interface TransitiveDep {
  readonly file: string;
  readonly depth: number;
  readonly path: string[];
}

export function computeTransitiveDeps(
  startFile: string,
  direction: 'dependents' | 'dependencies',
  deps: FileDependency[],
  maxDepth?: number,
): TransitiveDep[] {
  if (deps.length === 0 || maxDepth === 0) {
    return [];
  }

  const adjacency = buildAdjacencyGraph(deps, direction);

  if (!adjacency.has(startFile)) {
    return [];
  }

  return bfs(startFile, adjacency, maxDepth);
}

interface BfsEntry {
  readonly file: string;
  readonly depth: number;
  readonly path: string[];
}

function bfs(
  startFile: string,
  adjacency: Map<string, Set<string>>,
  maxDepth: number | undefined,
): TransitiveDep[] {
  const visited = new Set<string>([startFile]);
  const results: TransitiveDep[] = [];
  const queue: BfsEntry[] = [];

  const neighbors = adjacency.get(startFile);
  if (!neighbors) {
    return [];
  }

  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      visited.add(neighbor);
      const entry: BfsEntry = {
        file: neighbor,
        depth: 1,
        path: [startFile, neighbor],
      };
      queue.push(entry);
      results.push(entry);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head++];

    if (maxDepth !== undefined && current.depth >= maxDepth) {
      continue;
    }

    const currentNeighbors = adjacency.get(current.file);
    if (!currentNeighbors) {
      continue;
    }

    for (const neighbor of currentNeighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        const entry: BfsEntry = {
          file: neighbor,
          depth: current.depth + 1,
          path: [...current.path, neighbor],
        };
        queue.push(entry);
        results.push(entry);
      }
    }
  }

  results.sort((a, b) => {
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    return a.file.localeCompare(b.file);
  });

  return results;
}
