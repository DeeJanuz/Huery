import type { FileDependency } from '@/domain/models/index.js';
import { buildAdjacencyGraph } from '@/application/graph-analysis/graph-utils.js';

export interface CircularDep {
  readonly cycle: string[];
  readonly length: number;
}

interface TarjanState {
  index: number;
  readonly stack: string[];
  readonly onStack: Set<string>;
  readonly indices: Map<string, number>;
  readonly lowlinks: Map<string, number>;
  readonly sccs: string[][];
}

export function detectCircularDeps(deps: FileDependency[]): CircularDep[] {
  if (deps.length === 0) {
    return [];
  }

  const adjacency = buildAdjacencyGraph(deps);
  const sccs = findStronglyConnectedComponents(adjacency);
  const cyclicSccs = sccs.filter(scc => isCyclic(scc, adjacency));

  return cyclicSccs
    .map(scc => buildCircularDep(scc, adjacency))
    .sort((a, b) => a.length - b.length);
}

function findStronglyConnectedComponents(
  adjacency: Map<string, Set<string>>,
): string[][] {
  const state: TarjanState = {
    index: 0,
    stack: [],
    onStack: new Set(),
    indices: new Map(),
    lowlinks: new Map(),
    sccs: [],
  };

  const nodes = Array.from(adjacency.keys()).sort();

  for (const node of nodes) {
    if (!state.indices.has(node)) {
      strongConnect(node, adjacency, state);
    }
  }

  return state.sccs;
}

function strongConnect(
  node: string,
  adjacency: Map<string, Set<string>>,
  state: TarjanState,
): void {
  state.indices.set(node, state.index);
  state.lowlinks.set(node, state.index);
  state.index++;
  state.stack.push(node);
  state.onStack.add(node);

  const neighbors = adjacency.get(node) ?? new Set();
  for (const neighbor of neighbors) {
    if (!state.indices.has(neighbor)) {
      strongConnect(neighbor, adjacency, state);
      state.lowlinks.set(
        node,
        Math.min(state.lowlinks.get(node)!, state.lowlinks.get(neighbor)!),
      );
    } else if (state.onStack.has(neighbor)) {
      state.lowlinks.set(
        node,
        Math.min(state.lowlinks.get(node)!, state.indices.get(neighbor)!),
      );
    }
  }

  if (state.lowlinks.get(node) === state.indices.get(node)) {
    const scc: string[] = [];
    let w: string;
    do {
      w = state.stack.pop()!;
      state.onStack.delete(w);
      scc.push(w);
    } while (w !== node);

    state.sccs.push(scc);
  }
}

function isCyclic(scc: string[], adjacency: Map<string, Set<string>>): boolean {
  if (scc.length > 1) {
    return true;
  }

  // Single-node SCC: only cyclic if there's a self-edge
  const node = scc[0];
  const neighbors = adjacency.get(node);
  return neighbors !== undefined && neighbors.has(node);
}

function buildCircularDep(
  scc: string[],
  adjacency: Map<string, Set<string>>,
): CircularDep {
  const sorted = [...scc].sort();

  if (sorted.length === 1) {
    return {
      cycle: [sorted[0], sorted[0]],
      length: 1,
    };
  }

  const cyclePath = constructCyclePath(sorted, adjacency);

  return {
    cycle: cyclePath,
    length: sorted.length,
  };
}

function constructCyclePath(
  sortedNodes: string[],
  adjacency: Map<string, Set<string>>,
): string[] {
  const nodeSet = new Set(sortedNodes);
  const start = sortedNodes[0];

  const path: string[] = [start];
  const visited = new Set<string>([start]);
  let current = start;

  while (path.length < sortedNodes.length) {
    const neighbors = adjacency.get(current) ?? new Set();
    const sortedNeighbors = Array.from(neighbors)
      .filter(n => nodeSet.has(n) && !visited.has(n))
      .sort();

    if (sortedNeighbors.length === 0) {
      break;
    }

    current = sortedNeighbors[0];
    path.push(current);
    visited.add(current);
  }

  path.push(start);
  return path;
}
