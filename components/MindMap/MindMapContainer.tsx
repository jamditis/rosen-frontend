import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ConnectionMode,
  Panel
} from 'reactflow';
import dagre from '@dagrejs/dagre';
import 'reactflow/dist/style.css';

import MindMapNode from './MindMapNode';
import { MindMapContainerProps, MindMapNode as MindMapNodeType, MindMapEdge, LayoutDirection } from './types';

// Register custom node types
const nodeTypes = {
  mindMapNode: MindMapNode
};

// Default edge style - clean, minimal lines
const defaultEdgeOptions = {
  type: 'smoothstep',
  style: {
    stroke: '#d6d3d1', // stone-300
    strokeWidth: 1
  },
  animated: false
};

// Dagre layout configuration
const getLayoutedElements = (
  nodes: MindMapNodeType[],
  edges: MindMapEdge[],
  direction: LayoutDirection = 'TB'
): { nodes: MindMapNodeType[]; edges: MindMapEdge[] } => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 80,
    marginx: 50,
    marginy: 50
  });

  // Add nodes to dagre
  nodes.forEach((node) => {
    // Estimate node dimensions based on type
    const isRoot = node.data.type === 'root';
    const width = isRoot ? 250 : 180;
    const height = isRoot ? 80 : 60;
    dagreGraph.setNode(node.id, { width, height });
  });

  // Add edges to dagre
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run layout
  dagre.layout(dagreGraph);

  // Get positioned nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const isRoot = node.data.type === 'root';
    const width = isRoot ? 250 : 180;
    const height = isRoot ? 80 : 60;

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2
      }
    };
  });

  return { nodes: layoutedNodes, edges };
};

const MindMapContainer: React.FC<MindMapContainerProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodeClick,
  onNodeExpand,
  direction = 'TB',
  className = ''
}) => {
  // Apply layout to nodes
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes, initialEdges, direction),
    [initialNodes, initialEdges, direction]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update nodes when props change
  React.useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = getLayoutedElements(
      initialNodes,
      initialEdges,
      direction
    );
    setNodes(newNodes);
    setEdges(newEdges);
  }, [initialNodes, initialEdges, direction, setNodes, setEdges]);

  // Handle node click
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.data);
      }
    },
    [onNodeClick]
  );

  // Handle node double-click for expand/collapse
  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeExpand && node.data.childCount > 0) {
        onNodeExpand(node.id);
      }
    },
    [onNodeExpand]
  );

  // MiniMap node color
  const nodeColor = (node: Node) => {
    switch (node.data.type) {
      case 'root':
        return '#292524'; // stone-800
      case 'part':
        return '#fef3c7'; // amber-100
      case 'chapter':
        return '#e0f2fe'; // sky-100
      case 'concept':
        return '#ede9fe'; // violet-100
      case 'figure':
        return '#dcfce7'; // green-100
      default:
        return '#f5f5f4'; // stone-100
    }
  };

  return (
    <div className={`w-full h-full ${className}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.5,
          minZoom: 0.3
        }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
      >
        {/* Subtle dot grid background */}
        <Background color="#e7e5e4" gap={20} size={1} />

        {/* Controls - zoom buttons */}
        <Controls
          showInteractive={false}
          className="!bg-white !border-stone-200 !shadow-sm"
        />

        {/* MiniMap for navigation */}
        <MiniMap
          nodeColor={nodeColor}
          maskColor="rgba(255, 255, 255, 0.8)"
          className="!bg-stone-50 !border-stone-200"
          pannable
          zoomable
        />

        {/* Legend panel */}
        <Panel position="top-left" className="!m-4">
          <div className="bg-white/90 backdrop-blur-sm border border-stone-200 px-3 py-2 text-[10px] text-stone-500">
            <span className="font-bold uppercase tracking-wider">Tip:</span>{' '}
            Click to select, double-click to expand
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default MindMapContainer;
