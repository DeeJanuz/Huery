import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type Edge,
  type NodeMouseHandler,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import type { Cluster, ClusterRelationships } from '../types';

interface ClusterGraphProps {
  clusters: Cluster[];
  relationships: ClusterRelationships | null;
  selectedClusterId: string | null;
  onClusterClick: (clusterId: string) => void;
}

const BASE_WIDTH = 180;
const BASE_HEIGHT = 70;

// 10 visually distinct hues for connected component coloring (HSL hue values)
const GROUP_HUES = [210, 340, 120, 40, 270, 180, 15, 300, 90, 200];

function getGroupColor(groupIndex: number): { hue: number; border: string; bgLight: string; bgSelected: string; haloFill: string; haloBorder: string; minimap: string } {
  const hue = GROUP_HUES[groupIndex % GROUP_HUES.length];
  return {
    hue,
    border: `hsl(${hue}, 55%, 50%)`,
    bgLight: `hsl(${hue}, 50%, 96%)`,
    bgSelected: `hsl(${hue}, 55%, 90%)`,
    haloFill: `hsla(${hue}, 50%, 85%, 0.18)`,
    haloBorder: `hsl(${hue}, 40%, 70%)`,
    minimap: `hsl(${hue}, 55%, 55%)`,
  };
}

const HALO_PADDING = 50;

interface SimNode extends SimulationNodeDatum {
  id: string;
  cluster: Cluster;
  width: number;
  height: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  weight: number;
}

function findConnectedComponents(
  nodeIds: string[],
  edges: { sourceClusterId: string; targetClusterId: string }[],
): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    adj.set(id, new Set());
  }
  for (const e of edges) {
    adj.get(e.sourceClusterId)?.add(e.targetClusterId);
    adj.get(e.targetClusterId)?.add(e.sourceClusterId);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    const component: string[] = [];
    const queue = [id];
    visited.add(id);
    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      for (const neighbor of adj.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  return components;
}

function buildLayoutedElements(
  clusters: Cluster[],
  relationships: ClusterRelationships | null,
): { nodes: Node[]; edges: Edge[] } {
  if (clusters.length === 0) return { nodes: [], edges: [] };

  const maxMemberCount = Math.max(...clusters.map((c) => c.memberCount), 1);

  // Dynamic sizing: scale 0.7x-1.4x of base size relative to max memberCount
  const clusterSizes = new Map<string, { width: number; height: number }>();
  for (const c of clusters) {
    const scale = 0.7 + 0.7 * (c.memberCount / maxMemberCount);
    clusterSizes.set(c.id, {
      width: Math.round(BASE_WIDTH * scale),
      height: Math.round(BASE_HEIGHT * scale),
    });
  }

  const rawEdges = relationships?.edges ?? [];

  // Find connected components for initial positioning
  const components = findConnectedComponents(
    clusters.map((c) => c.id),
    rawEdges,
  );

  const connectedComponents = components.filter((comp) => comp.length > 1);
  const isolatedNodes = components.filter((comp) => comp.length === 1).map((comp) => comp[0]);

  const layoutRadius = Math.max(200, clusters.length * 30);
  const innerRadius = layoutRadius * 0.5;
  const outerRadius = layoutRadius * 0.85;

  // Assign initial positions
  const initialPositions = new Map<string, { x: number; y: number }>();

  // Place connected components at evenly spaced angles on the inner ring
  connectedComponents.forEach((comp, i) => {
    const angle = (2 * Math.PI * i) / Math.max(connectedComponents.length, 1);
    const cx = Math.cos(angle) * innerRadius;
    const cy = Math.sin(angle) * innerRadius;
    comp.forEach((id, j) => {
      // Spread members of a component around its center
      const memberAngle = angle + ((j - (comp.length - 1) / 2) * 0.3);
      const memberRadius = innerRadius + (j * 20 - (comp.length * 10));
      initialPositions.set(id, {
        x: cx + Math.cos(memberAngle) * Math.abs(memberRadius - innerRadius + 30),
        y: cy + Math.sin(memberAngle) * Math.abs(memberRadius - innerRadius + 30),
      });
    });
  });

  // Place isolated nodes on the outer ring with slight random radial variation
  isolatedNodes.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(isolatedNodes.length, 1);
    const radialVariation = (Math.sin(i * 7.3) * 0.15 + 1) * outerRadius; // deterministic pseudo-random
    initialPositions.set(id, {
      x: Math.cos(angle) * radialVariation,
      y: Math.sin(angle) * radialVariation,
    });
  });

  // Build simulation nodes
  const simNodes: SimNode[] = clusters.map((cluster) => {
    const pos = initialPositions.get(cluster.id) ?? { x: 0, y: 0 };
    const size = clusterSizes.get(cluster.id)!;
    return {
      id: cluster.id,
      x: pos.x,
      y: pos.y,
      cluster,
      width: size.width,
      height: size.height,
    };
  });

  const nodeById = new Map(simNodes.map((n) => [n.id, n]));

  // Build simulation links
  const simLinks: SimLink[] = rawEdges
    .filter((e) => nodeById.has(e.sourceClusterId) && nodeById.has(e.targetClusterId))
    .map((e) => ({
      source: e.sourceClusterId,
      target: e.targetClusterId,
      weight: e.weight,
    }));

  // Build edges for React Flow
  const edges: Edge[] = rawEdges
    .filter((e) => nodeById.has(e.sourceClusterId) && nodeById.has(e.targetClusterId))
    .map((rel) => ({
      id: `${rel.sourceClusterId}-${rel.targetClusterId}`,
      source: rel.sourceClusterId,
      target: rel.targetClusterId,
      style: { stroke: '#94a3b8', strokeWidth: Math.min(1 + rel.weight * 0.5, 4) },
      animated: true,
      label: rel.weight > 1 ? String(rel.weight) : undefined,
    }));

  // Configure and run d3-force simulation
  const simulation = forceSimulation<SimNode>(simNodes)
    .force(
      'charge',
      forceManyBody<SimNode>().strength((d) => {
        const radius = Math.sqrt(d.width * d.width + d.height * d.height) / 2;
        return -150 - radius * 2;
      }),
    )
    .force(
      'link',
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(200)
        .strength((d) => Math.min(0.1 + d.weight * 0.1, 0.7)),
    )
    .force('center', forceCenter(0, 0).strength(0.05))
    .force(
      'collide',
      forceCollide<SimNode>()
        .radius((d) => {
          const halfDiagonal = Math.sqrt(d.width * d.width + d.height * d.height) / 2;
          return halfDiagonal + 20;
        })
        .iterations(3),
    )
    .force('forceX', forceX<SimNode>(0).strength(0.02))
    .force('forceY', forceY<SimNode>(0).strength(0.02))
    .stop();

  // Run synchronously (no animation)
  for (let i = 0; i < 300; i++) {
    simulation.tick();
  }

  // Build group color assignments: nodeId -> groupColor (or null for isolated)
  const nodeGroupColor = new Map<string, ReturnType<typeof getGroupColor> | null>();
  let groupIndex = 0;
  for (const comp of components) {
    if (comp.length > 1) {
      const color = getGroupColor(groupIndex);
      for (const id of comp) {
        nodeGroupColor.set(id, color);
      }
      groupIndex++;
    } else {
      nodeGroupColor.set(comp[0], null);
    }
  }

  // Map final positions to React Flow nodes
  const clusterNodes: Node[] = simNodes.map((simNode) => ({
    id: simNode.id,
    position: {
      x: (simNode.x ?? 0) - simNode.width / 2,
      y: (simNode.y ?? 0) - simNode.height / 2,
    },
    data: {
      cluster: simNode.cluster,
      width: simNode.width,
      height: simNode.height,
      groupColor: nodeGroupColor.get(simNode.id) ?? null,
    },
    type: 'clusterNode',
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));

  // Build background halo nodes for connected components
  const haloNodes: Node[] = [];
  groupIndex = 0;
  for (const comp of components) {
    if (comp.length <= 1) continue;
    const color = getGroupColor(groupIndex);
    groupIndex++;

    // Compute bounding box from final sim positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of comp) {
      const sn = nodeById.get(id)!;
      const cx = sn.x ?? 0;
      const cy = sn.y ?? 0;
      minX = Math.min(minX, cx - sn.width / 2);
      minY = Math.min(minY, cy - sn.height / 2);
      maxX = Math.max(maxX, cx + sn.width / 2);
      maxY = Math.max(maxY, cy + sn.height / 2);
    }

    const haloWidth = (maxX - minX) + HALO_PADDING * 2;
    const haloHeight = (maxY - minY) + HALO_PADDING * 2;

    haloNodes.push({
      id: `group-halo-${comp[0]}`,
      position: {
        x: minX - HALO_PADDING,
        y: minY - HALO_PADDING,
      },
      data: {
        width: haloWidth,
        height: haloHeight,
        color,
      },
      type: 'groupBackground',
      selectable: false,
      draggable: false,
      connectable: false,
      style: { zIndex: -1 },
    });
  }

  // Halo nodes first so they render behind cluster nodes
  const nodes: Node[] = [...haloNodes, ...clusterNodes];

  return { nodes, edges };
}

const ClusterNode: React.FC<{
  data: { cluster: Cluster; width?: number; height?: number; groupColor: ReturnType<typeof getGroupColor> | null };
  selected?: boolean;
}> = ({ data, selected }) => {
  const { cluster, groupColor } = data;
  const width = data.width ?? BASE_WIDTH;
  const cohesionPercent = Math.round(cluster.cohesion * 100);
  const cohesionColor =
    cohesionPercent >= 70 ? '#22c55e' : cohesionPercent >= 40 ? '#f59e0b' : '#ef4444';

  const borderColor = selected
    ? (groupColor?.border ?? '#4361ee')
    : (groupColor?.border ?? '#e0e0e0');
  const bgColor = selected
    ? (groupColor?.bgSelected ?? '#e8eaf6')
    : (groupColor?.bgLight ?? '#fff');
  const shadowColor = groupColor
    ? `0 ${selected ? '4px 12px' : '2px 8px'} hsla(${groupColor.hue}, 55%, 50%, ${selected ? 0.3 : 0.1})`
    : selected ? '0 4px 12px rgba(67, 97, 238, 0.3)' : '0 2px 8px rgba(0,0,0,0.08)';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: bgColor,
        border: `2px solid ${borderColor}`,
        boxShadow: shadowColor,
        width,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#1a1a2e',
          marginBottom: '6px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {cluster.name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
        <span>{cluster.memberCount} units</span>
        <span style={{ color: cohesionColor, fontWeight: 600 }}>{cohesionPercent}% cohesion</span>
      </div>
    </div>
  );
};

const GroupBackgroundNode: React.FC<{
  data: { width: number; height: number; color: ReturnType<typeof getGroupColor> };
}> = ({ data }) => {
  return (
    <div
      style={{
        width: data.width,
        height: data.height,
        borderRadius: '16px',
        backgroundColor: data.color.haloFill,
        border: `2px dashed ${data.color.haloBorder}`,
        pointerEvents: 'none',
      }}
    />
  );
};

const nodeTypes = { clusterNode: ClusterNode, groupBackground: GroupBackgroundNode };

interface ClusterSearchProps {
  clusters: Cluster[];
  onClusterClick: (clusterId: string) => void;
}

const ClusterSearch: React.FC<ClusterSearchProps> = ({ clusters, onClusterClick }) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return clusters
      .filter((c) => c.name.toLowerCase().includes(lower))
      .slice(0, 8);
  }, [query, clusters]);

  const showDropdown = isOpen && query.trim().length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as globalThis.Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const selectCluster = useCallback(
    (clusterId: string) => {
      onClusterClick(clusterId);
      setQuery('');
      setIsOpen(false);
      inputRef.current?.blur();
      // Delay fitView to run after React re-render settles
      requestAnimationFrame(() => {
        fitView({ nodes: [{ id: clusterId }], duration: 500, padding: 0.5 });
      });
    },
    [onClusterClick, fitView],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            selectCluster(filtered[activeIndex].id);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [showDropdown, filtered, activeIndex, selectCluster],
  );

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const listboxId = 'cluster-search-listbox';

  const highlightMatch = (name: string): React.ReactNode => {
    const lower = name.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return name;
    return (
      <>
        {name.slice(0, idx)}
        <strong style={{ fontWeight: 700 }}>{name.slice(idx, idx + query.length)}</strong>
        {name.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        zIndex: 10,
        width: '280px',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search clusters..."
        role="combobox"
        aria-label="Search clusters"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `cluster-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: '13px',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          backgroundColor: '#fff',
          outline: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          boxSizing: 'border-box',
        }}
      />
      {showDropdown && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Cluster suggestions"
          style={{
            margin: '4px 0 0',
            padding: 0,
            listStyle: 'none',
            backgroundColor: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            maxHeight: '320px',
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 ? (
            <li
              style={{
                padding: '10px 12px',
                fontSize: '13px',
                color: '#999',
              }}
            >
              No clusters found
            </li>
          ) : (
            filtered.map((cluster, idx) => (
              <li
                key={cluster.id}
                id={`cluster-option-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectCluster(cluster.id);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  backgroundColor: idx === activeIndex ? '#f0f4ff' : '#fff',
                  borderBottom: idx < filtered.length - 1 ? '1px solid #f0f0f0' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {highlightMatch(cluster.name)}
                </span>
                <span style={{ fontSize: '11px', color: '#999', marginLeft: '8px', flexShrink: 0 }}>
                  {cluster.memberCount} units
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export const ClusterGraph: React.FC<ClusterGraphProps> = ({
  clusters,
  relationships,
  selectedClusterId,
  onClusterClick,
}) => {
  const { nodes, edges } = useMemo(
    () => buildLayoutedElements(clusters, relationships),
    [clusters, relationships],
  );

  const nodesWithSelection = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedClusterId,
      })),
    [nodes, selectedClusterId],
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === 'groupBackground') return;
      onClusterClick(node.id);
    },
    [onClusterClick],
  );

  if (clusters.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#999',
          fontSize: '14px',
        }}
      >
        No clusters to display
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodesWithSelection}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.3}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <ClusterSearch clusters={clusters} onClusterClick={onClusterClick} />
      <Background color="#e0e0e0" gap={20} />
      <Controls />
      <MiniMap
        nodeColor={(node) => {
          if (node.type === 'groupBackground') return 'transparent';
          const gc = (node.data as { groupColor?: ReturnType<typeof getGroupColor> | null })?.groupColor;
          return gc?.minimap ?? '#4361ee';
        }}
        style={{ backgroundColor: '#f5f5f5' }}
      />
    </ReactFlow>
  );
};
