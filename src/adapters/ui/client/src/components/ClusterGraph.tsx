import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import type { Cluster, ClusterRelationships } from '../types';

interface ClusterGraphProps {
  clusters: Cluster[];
  relationships: ClusterRelationships | null;
  selectedClusterId: string | null;
  onClusterClick: (clusterId: string) => void;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

function buildLayoutedElements(
  clusters: Cluster[],
  relationships: ClusterRelationships | null,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });

  for (const cluster of clusters) {
    g.setNode(cluster.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const edges: Edge[] = [];

  if (relationships?.edges) {
    for (const rel of relationships.edges) {
      const edgeId = `${rel.sourceClusterId}-${rel.targetClusterId}`;
      g.setEdge(rel.sourceClusterId, rel.targetClusterId);
      edges.push({
        id: edgeId,
        source: rel.sourceClusterId,
        target: rel.targetClusterId,
        style: { stroke: '#94a3b8', strokeWidth: Math.min(1 + rel.weight * 0.5, 4) },
        animated: true,
        label: rel.weight > 1 ? String(rel.weight) : undefined,
      });
    }
  }

  dagre.layout(g);

  const nodes: Node[] = clusters.map((cluster) => {
    const nodeWithPos = g.node(cluster.id);
    return {
      id: cluster.id,
      position: {
        x: (nodeWithPos?.x ?? 0) - NODE_WIDTH / 2,
        y: (nodeWithPos?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: { cluster },
      type: 'clusterNode',
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  return { nodes, edges };
}

const ClusterNode: React.FC<{ data: { cluster: Cluster }; selected?: boolean }> = ({ data, selected }) => {
  const { cluster } = data;
  const cohesionPercent = Math.round(cluster.cohesion * 100);
  const cohesionColor =
    cohesionPercent >= 70 ? '#22c55e' : cohesionPercent >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '8px',
        backgroundColor: selected ? '#e8eaf6' : '#fff',
        border: selected ? '2px solid #4361ee' : '2px solid #e0e0e0',
        boxShadow: selected ? '0 4px 12px rgba(67, 97, 238, 0.3)' : '0 2px 8px rgba(0,0,0,0.08)',
        width: NODE_WIDTH,
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

const nodeTypes = { clusterNode: ClusterNode };

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
      <Background color="#e0e0e0" gap={20} />
      <Controls />
      <MiniMap
        nodeColor={() => '#4361ee'}
        style={{ backgroundColor: '#f5f5f5' }}
      />
    </ReactFlow>
  );
};
