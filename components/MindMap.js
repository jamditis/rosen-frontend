
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { html } from '../html.js';
import { ChevronDown, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// Node type styles
const NODE_STYLES = {
  root: { bg: '#292524', text: '#ffffff', border: '#1c1917' },
  intro: { bg: '#f5f5f4', text: '#44403c', border: '#d6d3d1' },
  part: { bg: '#fef3c7', text: '#78350f', border: '#fde68a' },
  chapter: { bg: '#e0f2fe', text: '#0c4a6e', border: '#bae6fd' },
  conclusion: { bg: '#f5f5f4', text: '#44403c', border: '#d6d3d1' },
  concept: { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  figure: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' }
};

// Calculate tree layout
const calculateLayout = (nodes, expandedIds) => {
  const NODE_WIDTH = 180;
  const NODE_HEIGHT = 70;
  const HORIZONTAL_GAP = 40;
  const VERTICAL_GAP = 30;

  const visibleNodes = [];
  const edges = [];
  const positions = new Map();

  // Get visible nodes based on expansion state
  const getVisibleChildren = (parentId) => {
    if (!expandedIds.has(parentId)) return [];
    return nodes.filter(n => n.parentId === parentId);
  };

  // Calculate subtree width
  const getSubtreeWidth = (nodeId) => {
    const children = getVisibleChildren(nodeId);
    if (children.length === 0) return NODE_WIDTH;

    const childrenWidth = children.reduce((sum, child) => {
      return sum + getSubtreeWidth(child.id) + HORIZONTAL_GAP;
    }, -HORIZONTAL_GAP);

    return Math.max(NODE_WIDTH, childrenWidth);
  };

  // Position nodes recursively
  const positionNode = (node, x, y, level) => {
    positions.set(node.id, { x, y, level });
    visibleNodes.push({ ...node, x, y });

    const children = getVisibleChildren(node.id);
    if (children.length === 0) return;

    const totalWidth = children.reduce((sum, child) => {
      return sum + getSubtreeWidth(child.id) + HORIZONTAL_GAP;
    }, -HORIZONTAL_GAP);

    let currentX = x - totalWidth / 2;

    children.forEach(child => {
      const childWidth = getSubtreeWidth(child.id);
      const childX = currentX + childWidth / 2;
      const childY = y + NODE_HEIGHT + VERTICAL_GAP;

      edges.push({
        id: `${node.id}-${child.id}`,
        from: { x: x, y: y + NODE_HEIGHT / 2 },
        to: { x: childX, y: childY - NODE_HEIGHT / 2 }
      });

      positionNode(child, childX, childY, level + 1);
      currentX += childWidth + HORIZONTAL_GAP;
    });
  };

  // Start from root
  const rootNode = nodes.find(n => n.id === 'root');
  if (rootNode) {
    positionNode(rootNode, 0, 0, 0);
  }

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  visibleNodes.forEach(n => {
    minX = Math.min(minX, n.x - NODE_WIDTH / 2);
    maxX = Math.max(maxX, n.x + NODE_WIDTH / 2);
    minY = Math.min(minY, n.y - NODE_HEIGHT / 2);
    maxY = Math.max(maxY, n.y + NODE_HEIGHT / 2);
  });

  const padding = 60;
  const bounds = {
    x: minX - padding,
    y: minY - padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2
  };

  return { visibleNodes, edges, bounds, nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT };
};

// Mind Map Node Component
const MindMapNode = ({ node, nodeWidth, nodeHeight, isExpanded, hasChildren, onSelect, onToggle }) => {
  const style = NODE_STYLES[node.type] || NODE_STYLES.chapter;
  const isRoot = node.type === 'root';

  return html`
    <g
      transform="translate(${node.x - nodeWidth / 2}, ${node.y - nodeHeight / 2})"
      className="cursor-pointer"
      onClick=${(e) => { e.stopPropagation(); onSelect(node); }}
      onDblClick=${(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.id); }}
    >
      <!-- Node background -->
      <rect
        width=${nodeWidth}
        height=${nodeHeight}
        rx="2"
        fill=${style.bg}
        stroke=${style.border}
        strokeWidth="1"
        className="transition-all duration-150 hover:stroke-stone-400"
      />

      <!-- Node content -->
      <foreignObject width=${nodeWidth} height=${nodeHeight}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          className="w-full h-full p-3 flex flex-col justify-center overflow-hidden"
          style=${{ color: style.text }}
        >
          <div className=${`font-bold leading-tight truncate ${isRoot ? 'font-display text-sm' : 'text-xs'}`}>
            ${node.label}
          </div>
          ${node.subtitle && html`
            <div className="text-[10px] opacity-70 leading-snug mt-1 truncate">
              ${node.subtitle}
            </div>
          `}
          ${node.pageStart && !isRoot && html`
            <div className="text-[9px] opacity-50 mt-1 font-mono">
              p. ${node.pageStart}${node.pageEnd ? `–${node.pageEnd}` : ''}
            </div>
          `}
        </div>
      </foreignObject>

      <!-- Expand/collapse indicator -->
      ${hasChildren && html`
        <g transform="translate(${nodeWidth - 20}, ${nodeHeight / 2 - 8})">
          <rect
            width="16"
            height="16"
            rx="2"
            fill=${style.bg}
            stroke=${style.border}
            strokeWidth="1"
          />
          <foreignObject width="16" height="16">
            <div xmlns="http://www.w3.org/1999/xhtml" className="w-full h-full flex items-center justify-center" style=${{ color: style.text }}>
              ${isExpanded
                ? html`<${ChevronDown} className="w-3 h-3" />`
                : html`<${ChevronRight} className="w-3 h-3" />`
              }
            </div>
          </foreignObject>
        </g>
      `}

      <!-- Child count badge -->
      ${hasChildren && !isExpanded && html`
        <g transform="translate(${nodeWidth - 8}, ${nodeHeight - 8})">
          <rect
            width="20"
            height="14"
            rx="2"
            fill="#78716c"
          />
          <text
            x="10"
            y="11"
            textAnchor="middle"
            fill="white"
            fontSize="9"
            fontWeight="bold"
          >
            ${node.childCount}
          </text>
        </g>
      `}
    </g>
  `;
};

// Mind Map Edge Component
const MindMapEdge = ({ edge }) => {
  const { from, to } = edge;

  // Create a smooth path
  const midY = (from.y + to.y) / 2;
  const path = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;

  return html`
    <path
      d=${path}
      fill="none"
      stroke="#d6d3d1"
      strokeWidth="1"
    />
  `;
};

// Main Mind Map Component
const MindMap = ({ nodes, onNodeSelect, className = '' }) => {
  const containerRef = useRef(null);
  const [expandedIds, setExpandedIds] = useState(new Set(['root']));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Add child counts to nodes
  const nodesWithCounts = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      childCount: nodes.filter(n => n.parentId === node.id).length
    }));
  }, [nodes]);

  // Calculate layout
  const { visibleNodes, edges, bounds, nodeWidth, nodeHeight } = useMemo(() => {
    return calculateLayout(nodesWithCounts, expandedIds);
  }, [nodesWithCounts, expandedIds]);

  // Toggle node expansion
  const toggleNode = useCallback((nodeId) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        // Collapse: remove this node and all descendants
        const removeDescendants = (id) => {
          next.delete(id);
          nodes.filter(n => n.parentId === id).forEach(child => removeDescendants(child.id));
        };
        nodes.filter(n => n.parentId === nodeId).forEach(child => removeDescendants(child.id));
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, [nodes]);

  // Zoom controls
  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 3));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.3));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Pan handling
  const handleMouseDown = (e) => {
    if (e.target.tagName === 'svg') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Center the view on mount
  useEffect(() => {
    if (containerRef.current && bounds.width) {
      const container = containerRef.current;
      const centerX = container.clientWidth / 2 - bounds.width / 2 - bounds.x;
      const centerY = 40;
      setPan({ x: centerX, y: centerY });
    }
  }, [bounds.width]);

  const viewBox = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;

  return html`
    <div className=${`relative w-full h-full bg-stone-50 ${className}`} ref=${containerRef}>
      <!-- Controls -->
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick=${handleZoomIn}
          className="p-2 bg-white border border-stone-200 hover:bg-stone-50 transition-colors"
          title="Zoom in"
        >
          <${ZoomIn} className="w-4 h-4 text-stone-600" />
        </button>
        <button
          onClick=${handleZoomOut}
          className="p-2 bg-white border border-stone-200 hover:bg-stone-50 transition-colors"
          title="Zoom out"
        >
          <${ZoomOut} className="w-4 h-4 text-stone-600" />
        </button>
        <button
          onClick=${handleReset}
          className="p-2 bg-white border border-stone-200 hover:bg-stone-50 transition-colors"
          title="Reset view"
        >
          <${Maximize2} className="w-4 h-4 text-stone-600" />
        </button>
      </div>

      <!-- Zoom level indicator -->
      <div className="absolute bottom-4 left-4 z-10 text-xs text-stone-400 bg-white/80 px-2 py-1 border border-stone-200">
        ${Math.round(zoom * 100)}%
      </div>

      <!-- SVG Canvas -->
      <svg
        className="w-full h-full"
        style=${{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown=${handleMouseDown}
        onMouseMove=${handleMouseMove}
        onMouseUp=${handleMouseUp}
        onMouseLeave=${handleMouseUp}
      >
        <g transform="translate(${pan.x}, ${pan.y}) scale(${zoom})">
          <!-- Edges -->
          ${edges.map(edge => html`
            <${MindMapEdge} key=${edge.id} edge=${edge} />
          `)}

          <!-- Nodes -->
          ${visibleNodes.map(node => html`
            <${MindMapNode}
              key=${node.id}
              node=${node}
              nodeWidth=${nodeWidth}
              nodeHeight=${nodeHeight}
              isExpanded=${expandedIds.has(node.id)}
              hasChildren=${node.childCount > 0}
              onSelect=${onNodeSelect}
              onToggle=${toggleNode}
            />
          `)}
        </g>
      </svg>
    </div>
  `;
};

export default MindMap;
