import React, { useState, useMemo, useCallback } from 'react';
import { MindMapContainer, DetailPanel, MindMapNode, MindMapEdge, MindMapNodeData } from '../MindMap';
import { DISSERTATION_NODES, DissertationNodeConfig, getChildNodes } from './dissertationData';

interface DissertationMindMapProps {
  className?: string;
}

const DissertationMindMap: React.FC<DissertationMindMapProps> = ({ className = '' }) => {
  // Track which nodes are expanded
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));

  // Track selected node for detail panel
  const [selectedNode, setSelectedNode] = useState<MindMapNodeData | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // Toggle node expansion
  const toggleNodeExpansion = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        // Collapse: remove this node and all its descendants
        const removeDescendants = (id: string) => {
          next.delete(id);
          getChildNodes(id).forEach(child => removeDescendants(child.id));
        };
        // Only remove children, keep the node itself to show it's collapsible
        getChildNodes(nodeId).forEach(child => removeDescendants(child.id));
        next.delete(nodeId);
      } else {
        // Expand: add this node
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Handle node click - show detail panel
  const handleNodeClick = useCallback((nodeData: MindMapNodeData) => {
    setSelectedNode(nodeData);
    setDetailPanelOpen(true);
  }, []);

  // Handle node double-click - expand/collapse
  const handleNodeExpand = useCallback((nodeId: string) => {
    toggleNodeExpansion(nodeId);
  }, [toggleNodeExpansion]);

  // Close detail panel
  const closeDetailPanel = useCallback(() => {
    setDetailPanelOpen(false);
  }, []);

  // Build visible nodes based on expansion state
  const { nodes, edges } = useMemo(() => {
    const visibleNodes: MindMapNode[] = [];
    const visibleEdges: MindMapEdge[] = [];
    const visited = new Set<string>();

    // Recursive function to add nodes and their visible children
    const addNode = (nodeConfig: DissertationNodeConfig) => {
      if (visited.has(nodeConfig.id)) return;
      visited.add(nodeConfig.id);

      const children = getChildNodes(nodeConfig.id);
      const isExpanded = expandedNodes.has(nodeConfig.id);

      // Create the node
      const node: MindMapNode = {
        id: nodeConfig.id,
        type: 'mindMapNode',
        position: { x: 0, y: 0 }, // Will be set by dagre layout
        data: {
          ...nodeConfig,
          isExpanded,
          childCount: children.length
        }
      };
      visibleNodes.push(node);

      // If expanded, add children
      if (isExpanded && children.length > 0) {
        children.forEach(child => {
          // Add edge from parent to child
          visibleEdges.push({
            id: `${nodeConfig.id}-${child.id}`,
            source: nodeConfig.id,
            target: child.id
          });

          // Recursively add child
          addNode(child);
        });
      }
    };

    // Start from root
    const rootNode = DISSERTATION_NODES.find(n => n.id === 'root');
    if (rootNode) {
      addNode(rootNode);
    }

    return { nodes: visibleNodes, edges: visibleEdges };
  }, [expandedNodes]);

  return (
    <div className={`relative ${className}`}>
      {/* Mind Map */}
      <div className="w-full h-full">
        <MindMapContainer
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
          onNodeExpand={handleNodeExpand}
          direction="TB"
          className="w-full h-full"
        />
      </div>

      {/* Detail Panel */}
      <DetailPanel
        node={selectedNode}
        isOpen={detailPanelOpen}
        onClose={closeDetailPanel}
      />

      {/* Backdrop for detail panel on mobile */}
      {detailPanelOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 sm:hidden"
          onClick={closeDetailPanel}
        />
      )}
    </div>
  );
};

export default DissertationMindMap;
