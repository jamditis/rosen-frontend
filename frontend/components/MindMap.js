
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { html } from '../html.js?v=3.8.7';
import { ChevronDown, ChevronRight, ZoomIn, ZoomOut, Maximize2, Focus, HelpCircle, X } from 'lucide-react';

// Enhanced node type styles with gradients and shadows
const NODE_STYLES = {
  root: {
    bg: '#1c1917',
    bgHover: '#292524',
    text: '#ffffff',
    border: '#44403c',
    shadow: 'rgba(28, 25, 23, 0.4)',
    accent: '#78716c'
  },
  intro: {
    bg: '#fafaf9',
    bgHover: '#f5f5f4',
    text: '#44403c',
    border: '#a8a29e',
    shadow: 'rgba(168, 162, 158, 0.3)',
    accent: '#78716c'
  },
  part: {
    bg: '#fef3c7',
    bgHover: '#fde68a',
    text: '#78350f',
    border: '#f59e0b',
    shadow: 'rgba(245, 158, 11, 0.3)',
    accent: '#d97706'
  },
  chapter: {
    bg: '#e0f2fe',
    bgHover: '#bae6fd',
    text: '#0c4a6e',
    border: '#0284c7',
    shadow: 'rgba(2, 132, 199, 0.25)',
    accent: '#0369a1'
  },
  conclusion: {
    bg: '#fafaf9',
    bgHover: '#f5f5f4',
    text: '#44403c',
    border: '#a8a29e',
    shadow: 'rgba(168, 162, 158, 0.3)',
    accent: '#78716c'
  },
  concept: {
    bg: '#ede9fe',
    bgHover: '#ddd6fe',
    text: '#5b21b6',
    border: '#8b5cf6',
    shadow: 'rgba(139, 92, 246, 0.25)',
    accent: '#7c3aed'
  },
  figure: {
    bg: '#dcfce7',
    bgHover: '#bbf7d0',
    text: '#166534',
    border: '#22c55e',
    shadow: 'rgba(34, 197, 94, 0.25)',
    accent: '#16a34a'
  }
};

// Calculate LEFT-TO-RIGHT tree layout
const calculateLayout = (nodes, expandedIds) => {
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 72;
  const HORIZONTAL_GAP = 80;  // Gap between levels (left to right)
  const VERTICAL_GAP = 20;    // Gap between siblings (top to bottom)

  const visibleNodes = [];
  const edges = [];

  // Get visible children based on expansion state
  const getVisibleChildren = (parentId) => {
    if (!expandedIds.has(parentId)) return [];
    return nodes.filter(n => n.parentId === parentId);
  };

  // Calculate subtree height (vertical space needed)
  const getSubtreeHeight = (nodeId) => {
    const children = getVisibleChildren(nodeId);
    if (children.length === 0) return NODE_HEIGHT;

    const childrenHeight = children.reduce((sum, child) => {
      return sum + getSubtreeHeight(child.id) + VERTICAL_GAP;
    }, -VERTICAL_GAP);

    return Math.max(NODE_HEIGHT, childrenHeight);
  };

  // Position nodes recursively (left-to-right)
  const positionNode = (node, x, y, level) => {
    visibleNodes.push({ ...node, x, y, level });

    const children = getVisibleChildren(node.id);
    if (children.length === 0) return;

    // Calculate total height of all children subtrees
    const totalHeight = children.reduce((sum, child) => {
      return sum + getSubtreeHeight(child.id) + VERTICAL_GAP;
    }, -VERTICAL_GAP);

    // Start y position (centered relative to parent)
    let currentY = y - totalHeight / 2;

    children.forEach(child => {
      const childHeight = getSubtreeHeight(child.id);
      const childX = x + NODE_WIDTH + HORIZONTAL_GAP;
      const childY = currentY + childHeight / 2;

      // Create edge from parent right side to child left side
      edges.push({
        id: `${node.id}-${child.id}`,
        from: { x: x + NODE_WIDTH / 2, y: y },
        to: { x: childX - NODE_WIDTH / 2, y: childY }
      });

      positionNode(child, childX, childY, level + 1);
      currentY += childHeight + VERTICAL_GAP;
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

  const padding = 80;
  const bounds = {
    x: minX - padding,
    y: minY - padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2
  };

  return { visibleNodes, edges, bounds, nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT };
};

// Mind Map Node Component - single click to expand, detail panel via icon
const MindMapNode = ({ node, nodeWidth, nodeHeight, isExpanded, hasChildren, isSelected, onSelect, onToggle }) => {
  const style = NODE_STYLES[node.type] || NODE_STYLES.chapter;
  const isRoot = node.type === 'root';
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Single click on node: expand if has children, always select
  const handleNodeClick = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    // Always select the node (opens detail panel)
    onSelect(node);
    // If has children, also toggle expansion
    if (hasChildren) {
      onToggle(node.id);
    }
  }, [node, hasChildren, onSelect, onToggle]);

  // Click on expand button only toggles, doesn't open panel
  const handleExpandClick = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    onToggle(node.id);
  }, [node.id, onToggle]);

  const handleNodeKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleNodeClick(e);
    }
  }, [handleNodeClick]);

  const isEmphasized = isSelected || isFocused;
  const shadowOffset = isEmphasized ? 4 : isHovered ? 3 : 2;
  const borderWidth = isEmphasized ? 2.5 : isHovered ? 2 : 1.5;

  return html`
    <g
      transform="translate(${node.x - nodeWidth / 2}, ${node.y - nodeHeight / 2})"
      role="button"
      tabIndex="0"
      aria-label=${`${node.label}${node.subtitle ? `: ${node.subtitle}` : ''}`}
      aria-expanded=${hasChildren ? isExpanded : undefined}
      aria-pressed=${isSelected}
      style=${{
        cursor: 'pointer',
        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      onClick=${handleNodeClick}
      onKeyDown=${handleNodeKeyDown}
      onMouseEnter=${() => setIsHovered(true)}
      onMouseLeave=${() => setIsHovered(false)}
      onFocus=${() => setIsFocused(true)}
      onBlur=${() => setIsFocused(false)}
    >
      <rect
        x=${shadowOffset}
        y=${shadowOffset}
        width=${nodeWidth}
        height=${nodeHeight}
        rx="2"
        fill=${style.shadow}
        style=${{ transition: 'all 0.2s ease' }}
      />

      <rect
        width=${nodeWidth}
        height=${nodeHeight}
        rx="2"
        fill=${isHovered ? style.bgHover : style.bg}
        stroke=${isEmphasized ? style.accent : style.border}
        strokeWidth=${borderWidth}
        style=${{ transition: 'all 0.2s ease', cursor: 'pointer' }}
      />

      ${isEmphasized && html`
        <rect
          x="-3"
          y="-3"
          width=${nodeWidth + 6}
          height=${nodeHeight + 6}
          rx="4"
          fill="none"
          stroke=${style.accent}
          strokeWidth="2"
          strokeDasharray="4 2"
          style=${{ opacity: 0.6 }}
        />
      `}

      <foreignObject
        width=${nodeWidth}
        height=${nodeHeight}
        style=${{ pointerEvents: 'none' }}
      >
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style=${{
            width: '100%',
            height: '100%',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            overflow: 'hidden',
            color: style.text,
            pointerEvents: 'none'
          }}
        >
          <div style=${{
            fontWeight: 700,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: isRoot ? '14px' : '12px',
            fontFamily: isRoot ? "'Special Elite', cursive" : 'inherit'
          }}>
            ${node.label}
          </div>
          ${node.subtitle && html`
            <div style=${{
              fontSize: '11px',
              opacity: 0.8,
              lineHeight: 1.3,
              marginTop: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              ${node.subtitle}
            </div>
          `}
          ${node.pageStart && !isRoot && html`
            <div style=${{
              fontSize: '10px',
              opacity: 0.6,
              marginTop: '4px',
              fontFamily: "'Roboto Mono', monospace"
            }}>
              pp. ${node.pageStart}${node.pageEnd ? `–${node.pageEnd}` : '+'}
            </div>
          `}
        </div>
      </foreignObject>

      ${hasChildren && html`
        <g
          transform="translate(${nodeWidth - 14}, ${nodeHeight / 2 - 14})"
          onClick=${handleExpandClick}
          style=${{ cursor: 'pointer' }}
        >
          <circle
            cx="14"
            cy="14"
            r="14"
            fill=${isExpanded ? style.accent : '#ffffff'}
            stroke=${style.border}
            strokeWidth="2"
            style=${{ transition: 'all 0.2s ease' }}
          />
          <foreignObject x="4" y="4" width="20" height="20" style=${{ pointerEvents: 'none' }}>
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              style=${{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isExpanded ? '#ffffff' : style.accent,
                pointerEvents: 'none'
              }}
            >
              ${isExpanded
                ? html`<${ChevronDown} style=${{ width: '16px', height: '16px' }} />`
                : html`<${ChevronRight} style=${{ width: '16px', height: '16px' }} />`
              }
            </div>
          </foreignObject>
        </g>
      `}

      ${hasChildren && !isExpanded && html`
        <g transform="translate(${nodeWidth - 28}, ${nodeHeight - 10})">
          <rect
            width="24"
            height="18"
            rx="9"
            fill=${style.accent}
          />
          <text
            x="12"
            y="13"
            textAnchor="middle"
            fill="white"
            fontSize="10"
            fontWeight="bold"
            style=${{ fontFamily: "'Roboto Mono', monospace" }}
          >
            ${node.childCount}
          </text>
        </g>
      `}
    </g>
  `;
};

// Mind Map Edge Component - horizontal bezier curves with smooth animation
const MindMapEdge = ({ edge }) => {
  const { from, to } = edge;

  // Create a smooth horizontal bezier curve (S-curve from right of parent to left of child)
  const midX = (from.x + to.x) / 2;
  const path = `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;

  return html`
    <g style=${{ transition: 'opacity 0.3s ease' }}>
      <path
        d=${path}
        fill="none"
        stroke="rgba(168, 162, 158, 0.2)"
        strokeWidth="8"
        strokeLinecap="round"
        style=${{ transition: 'd 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
      <path
        d=${path}
        fill="none"
        stroke="#a8a29e"
        strokeWidth="2.5"
        strokeLinecap="round"
        style=${{ transition: 'd 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
    </g>
  `;
};

// Main Mind Map Component
const MindMap = ({
  nodes,
  onNodeSelect,
  className = '',
  isPanelOpen = false,
  minimumZoom = 0.3,
}) => {
  const containerRef = useRef(null);
  const [expandedIds, setExpandedIds] = useState(new Set(['root']));
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [targetPan, setTargetPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const animationRef = useRef(null);
  const safeMinimumZoom = Number.isFinite(minimumZoom)
    ? Math.min(1.5, Math.max(0.3, minimumZoom))
    : 0.3;

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

  // Smooth animated transition to target zoom and pan
  const animateToFit = useCallback((targetZoom, targetPan, duration = 400) => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startZoom = zoom;
    const startPan = { ...pan };
    const startTime = performance.now();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || duration <= 0) {
      setZoom(targetZoom);
      setPan(targetPan);
      setIsAnimating(false);
      return;
    }

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const newZoom = startZoom + (targetZoom - startZoom) * easeProgress;
      const newPanX = startPan.x + (targetPan.x - startPan.x) * easeProgress;
      const newPanY = startPan.y + (targetPan.y - startPan.y) * easeProgress;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    setIsAnimating(true);
    animationRef.current = requestAnimationFrame(animate);
  }, [zoom, pan]);

  // Fit all visible nodes in view
  const fitToView = useCallback((newBounds, animate = true) => {
    if (!containerRef.current || !newBounds || newBounds.width === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const padding = 60; // Padding around the content
    const availableWidth = containerWidth - padding * 2;
    const availableHeight = containerHeight - padding * 2;

    // Calculate zoom to fit content
    const scaleX = availableWidth / newBounds.width;
    const scaleY = availableHeight / newBounds.height;
    const targetZoom = Math.max(
      safeMinimumZoom,
      Math.min(scaleX, scaleY, 1.5),
    ); // Cap max zoom at 1.5 without shrinking desktop touch targets.

    // Calculate pan to center content
    const contentCenterX = newBounds.x + newBounds.width / 2;
    const contentCenterY = newBounds.y + newBounds.height / 2;
    const targetPanX = containerWidth / 2 - contentCenterX * targetZoom;
    const targetPanY = containerHeight / 2 - contentCenterY * targetZoom;

    if (animate) {
      animateToFit(targetZoom, { x: targetPanX, y: targetPanY }, 400);
    } else {
      setZoom(targetZoom);
      setPan({ x: targetPanX, y: targetPanY });
    }
  }, [animateToFit, safeMinimumZoom]);

  // Fit view to a specific node and its immediate connections
  const fitToNodeCluster = useCallback((nodeId, animate = true) => {
    if (!containerRef.current) return;

    // Find the node and its immediate connections
    const node = visibleNodes.find(n => n.id === nodeId);
    if (!node) return;

    // Get parent node (if visible)
    const parentNode = visibleNodes.find(n => n.id === node.parentId);

    // Get child nodes (if visible)
    const childNodes = visibleNodes.filter(n => n.parentId === nodeId);

    // Collect all nodes in the cluster
    const clusterNodes = [node];
    if (parentNode) clusterNodes.push(parentNode);
    clusterNodes.push(...childNodes);

    // Calculate bounding box for the cluster
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    clusterNodes.forEach(n => {
      minX = Math.min(minX, n.x - nodeWidth / 2);
      maxX = Math.max(maxX, n.x + nodeWidth / 2);
      minY = Math.min(minY, n.y - nodeHeight / 2);
      maxY = Math.max(maxY, n.y + nodeHeight / 2);
    });

    const padding = 80;
    const clusterBounds = {
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + padding * 2,
      height: (maxY - minY) + padding * 2
    };

    // Fit to the cluster bounds
    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const availableWidth = containerWidth - 120;
    const availableHeight = containerHeight - 120;

    // Calculate zoom to fit cluster
    const scaleX = availableWidth / clusterBounds.width;
    const scaleY = availableHeight / clusterBounds.height;
    const targetZoom = Math.max(
      safeMinimumZoom,
      Math.min(scaleX, scaleY, 1.2),
    ); // Cap at 1.2 for readability.

    // Calculate pan to center the cluster
    const clusterCenterX = clusterBounds.x + clusterBounds.width / 2;
    const clusterCenterY = clusterBounds.y + clusterBounds.height / 2;
    const targetPanX = containerWidth / 2 - clusterCenterX * targetZoom;
    const targetPanY = containerHeight / 2 - clusterCenterY * targetZoom;

    if (animate) {
      animateToFit(targetZoom, { x: targetPanX, y: targetPanY }, 350);
    } else {
      setZoom(targetZoom);
      setPan({ x: targetPanX, y: targetPanY });
    }
  }, [visibleNodes, nodeWidth, nodeHeight, animateToFit, safeMinimumZoom]);

  // Handle node selection - auto-fit to node cluster and notify parent
  const handleNodeSelect = useCallback((node) => {
    setSelectedNodeId(node.id);

    // Auto-fit to show the selected node and its connections
    fitToNodeCluster(node.id, true);

    if (onNodeSelect) {
      onNodeSelect(node);
    }
  }, [onNodeSelect, fitToNodeCluster]);

  // Handle deselecting a node (close panel)
  const handleDeselectNode = useCallback(() => {
    setSelectedNodeId(null);
    if (onNodeSelect) {
      onNodeSelect(null);
    }
    // Fit back to full view
    fitToView(bounds, true);
  }, [onNodeSelect, fitToView, bounds]);

  // Toggle node expansion and auto-fit view
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
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, safeMinimumZoom));
  const handleReset = () => fitToView(bounds, true);
  const handleFitToView = () => fitToView(bounds, true);

  // Pan handling - also deselect when clicking empty space
  const handleMouseDown = (e) => {
    if (e.target.tagName === 'svg') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Click on empty SVG space deselects the node
  const handleSvgClick = (e) => {
    // Only deselect if clicking directly on SVG (not on a node)
    if (e.target.tagName === 'svg' && selectedNodeId) {
      handleDeselectNode();
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

  // Touch handling for mobile
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1 && e.target.tagName === 'svg') {
      const touch = e.touches[0];
      setIsPanning(true);
      setPanStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
    }
  }, [pan]);

  const handleTouchMove = useCallback((e) => {
    if (isPanning && e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      setPan({ x: touch.clientX - panStart.x, y: touch.clientY - panStart.y });
    }
  }, [isPanning, panStart]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(safeMinimumZoom, Math.min(3, z * delta)));
  }, [safeMinimumZoom]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Keep map shortcuts local to the map. This matters when the canonical
      // component is embedded in another shell with its own arrow-key model.
      if (!containerRef.current?.contains(document.activeElement)) return;

      switch(e.key) {
        case 'Escape':
          // Close detail panel and deselect node
          if (selectedNodeId) {
            e.preventDefault();
            handleDeselectNode();
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          setZoom(z => Math.min(z * 1.2, 3));
          break;
        case '-':
          e.preventDefault();
          setZoom(z => Math.max(z / 1.2, safeMinimumZoom));
          break;
        case '0':
          e.preventDefault();
          setZoom(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPan(p => ({ ...p, x: p.x + 50 }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPan(p => ({ ...p, x: p.x - 50 }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setPan(p => ({ ...p, y: p.y + 50 }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPan(p => ({ ...p, y: p.y - 50 }));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, handleDeselectNode, safeMinimumZoom]);

  // Cancel any in-flight fit-to-view animation on unmount. animateToFit
  // re-schedules requestAnimationFrame until the tween finishes; without this,
  // unmounting mid-tween (navigating away during the 400ms fit) leaves the
  // loop calling setZoom/setPan on an unmounted component. See issue #152.
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Expand all nodes function
  const expandAll = useCallback(() => {
    const allIds = new Set(nodes.map(n => n.id));
    setExpandedIds(allIds);
  }, [nodes]);

  // Collapse all function
  const collapseAll = useCallback(() => {
    setExpandedIds(new Set(['root']));
  }, []);

  // Track if this is the initial mount
  const isInitialMount = useRef(true);
  const prevBoundsRef = useRef(bounds);
  const hasInitialFit = useRef(false);

  // Initial fit on mount - wait for container to have dimensions
  useEffect(() => {
    if (hasInitialFit.current) return;
    if (!containerRef.current || !bounds.width) return;

    // Use a small delay to ensure container is fully rendered
    const timer = setTimeout(() => {
      if (containerRef.current && containerRef.current.clientWidth > 0) {
        fitToView(bounds, false);
        hasInitialFit.current = true;
        isInitialMount.current = false;
        prevBoundsRef.current = bounds;
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [bounds, fitToView]);

  // Auto-fit view when layout changes (after initial mount)
  useEffect(() => {
    // Skip if not yet initialized
    if (!hasInitialFit.current) return;
    if (!containerRef.current || !bounds.width) return;

    // Check if bounds actually changed
    const prev = prevBoundsRef.current;
    if (
      bounds.x !== prev.x ||
      bounds.y !== prev.y ||
      bounds.width !== prev.width ||
      bounds.height !== prev.height
    ) {
      fitToView(bounds, true);
      prevBoundsRef.current = bounds;
    }
  }, [bounds, fitToView]);

  return html`
    <div className=${`archive-mind-map ${className}`} ref=${containerRef}>
      <div className="archive-mind-map__controls">
        <button
          type="button"
          onClick=${handleZoomIn}
          className="archive-mind-map__control"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <${ZoomIn} className="w-5 h-5 text-stone-600" />
        </button>
        <button
          type="button"
          onClick=${handleZoomOut}
          className="archive-mind-map__control"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <${ZoomOut} className="w-5 h-5 text-stone-600" />
        </button>
        <div className="archive-mind-map__control-rule" />
        <button
          type="button"
          onClick=${handleReset}
          className="archive-mind-map__control"
          title="Re-center view"
          aria-label="Re-center view to show all nodes"
        >
          <${Focus} className="w-5 h-5 text-stone-600" />
        </button>
      </div>

      <div className="archive-mind-map__status">
        <div className="archive-mind-map__zoom" aria-live="polite" aria-label=${`Zoom level: ${Math.round(zoom * 100)} percent`}>
          ${Math.round(zoom * 100)}%
        </div>
        <button
          type="button"
          onClick=${collapseAll}
          className="archive-action archive-action--secondary"
          title="Collapse all nodes"
          aria-label="Collapse all nodes"
        >
          Collapse all
        </button>
        <button
          type="button"
          onClick=${expandAll}
          className="archive-action archive-action--primary"
          title="Expand all nodes"
          aria-label="Expand all nodes"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick=${() => setShowShortcuts(!showShortcuts)}
          className="archive-mind-map__control"
          title="Keyboard shortcuts"
          aria-label="Show keyboard shortcuts"
        >
          <${HelpCircle} className="w-5 h-5" />
        </button>
      </div>

      ${showShortcuts && html`
        <div className="archive-data-panel archive-mind-map__shortcuts">
          <div className="archive-mind-map__shortcuts-header">
            <h3>Keyboard shortcuts</h3>
            <button
              type="button"
              onClick=${() => setShowShortcuts(false)}
              className="archive-action archive-action--quiet"
              aria-label="Close shortcuts panel"
            >
              <${X} className="w-4 h-4" />
            </button>
          </div>
          <div className="archive-mind-map__shortcut-list">
            <div>
              <span>Zoom in</span>
              <kbd>+</kbd>
            </div>
            <div>
              <span>Zoom out</span>
              <kbd>-</kbd>
            </div>
            <div>
              <span>Reset zoom</span>
              <kbd>0</kbd>
            </div>
            <div>
              <span>Pan view</span>
              <div>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>←</kbd>
                <kbd>→</kbd>
              </div>
            </div>
            <div>
              <span>Close panel</span>
              <kbd>Esc</kbd>
            </div>
            <div className="archive-mind-map__shortcut-note">
              <p>Click nodes to expand or collapse. Drag to pan.</p>
            </div>
          </div>
        </div>
      `}

      <svg
        className="w-full h-full touch-none"
        style=${{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown=${handleMouseDown}
        onMouseMove=${handleMouseMove}
        onMouseUp=${handleMouseUp}
        onMouseLeave=${handleMouseUp}
        onTouchStart=${handleTouchStart}
        onTouchMove=${handleTouchMove}
        onTouchEnd=${handleTouchEnd}
        onClick=${handleSvgClick}
        onWheel=${handleWheel}
        tabIndex="0"
        role="region"
        aria-roledescription="interactive mind map"
        aria-label="Dissertation mind map. Use arrow keys to pan, +/- to zoom. Press ESC to close panel. On touch devices, drag to pan."
      >
        <g
          transform="translate(${pan.x}, ${pan.y}) scale(${zoom})"
          style=${{
            transition: isAnimating ? 'none' : (isPanning ? 'none' : 'transform 0.3s ease-out')
          }}
        >
          ${edges.map(edge => html`
            <${MindMapEdge} key=${edge.id} edge=${edge} />
          `)}

          ${visibleNodes.map(node => html`
            <${MindMapNode}
              key=${node.id}
              node=${node}
              nodeWidth=${nodeWidth}
              nodeHeight=${nodeHeight}
              isExpanded=${expandedIds.has(node.id)}
              hasChildren=${node.childCount > 0}
              isSelected=${selectedNodeId === node.id}
              onSelect=${handleNodeSelect}
              onToggle=${toggleNode}
            />
          `)}
        </g>
      </svg>
    </div>
  `;
};

export default MindMap;
