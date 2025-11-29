import { Node, Edge } from 'reactflow';

// Node types for the mind map
export type MindMapNodeType =
  | 'root'
  | 'intro'
  | 'part'
  | 'chapter'
  | 'conclusion'
  | 'concept'
  | 'figure';

// Data attached to each node
export interface MindMapNodeData {
  id: string;
  type: MindMapNodeType;
  label: string;
  subtitle?: string;
  pageStart?: number;
  pageEnd?: number;

  // Detail panel content
  summary?: string;
  pullQuote?: string;
  keyFigures?: string[];
  keyConcepts?: string[];
  relatedArchiveIds?: string[];

  // Visual state
  isExpanded?: boolean;
  isSelected?: boolean;
  childCount?: number;
}

// React Flow typed node
export type MindMapNode = Node<MindMapNodeData>;

// React Flow typed edge
export type MindMapEdge = Edge;

// Props for the detail panel
export interface DetailPanelProps {
  node: MindMapNodeData | null;
  onClose: () => void;
  isOpen: boolean;
}

// Props for custom node component
export interface MindMapNodeProps {
  data: MindMapNodeData;
  selected?: boolean;
}

// Layout direction
export type LayoutDirection = 'TB' | 'LR'; // Top-to-bottom or Left-to-right

// Mind map container props
export interface MindMapContainerProps {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  onNodeClick?: (node: MindMapNodeData) => void;
  onNodeExpand?: (nodeId: string) => void;
  direction?: LayoutDirection;
  className?: string;
}
