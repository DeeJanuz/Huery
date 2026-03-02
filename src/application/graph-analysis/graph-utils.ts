import type { FileDependency } from '@/domain/models/index.js';

export type AdjacencyGraph = Map<string, Set<string>>;

export function buildAdjacencyGraph(
  deps: FileDependency[],
  direction: 'dependents' | 'dependencies' = 'dependencies',
): AdjacencyGraph {
  const graph = new Map<string, Set<string>>();
  const seen = new Set<string>();

  for (const dep of deps) {
    const key = `${dep.sourceFile}->${dep.targetFile}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const from = direction === 'dependencies' ? dep.sourceFile : dep.targetFile;
    const to = direction === 'dependencies' ? dep.targetFile : dep.sourceFile;

    if (!graph.has(from)) {
      graph.set(from, new Set());
    }
    graph.get(from)!.add(to);

    // Ensure the target node exists in the graph even if it has no outgoing edges
    if (!graph.has(to)) {
      graph.set(to, new Set());
    }
  }

  return graph;
}
