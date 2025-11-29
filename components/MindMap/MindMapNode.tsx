import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ChevronDown, ChevronRight, FileText, BookOpen, Lightbulb, User } from 'lucide-react';
import { MindMapNodeData, MindMapNodeType } from './types';

// Style configurations per node type
const nodeStyles: Record<MindMapNodeType, { bg: string; text: string; border: string; icon?: React.ReactNode }> = {
  root: {
    bg: 'bg-stone-800',
    text: 'text-white',
    border: 'border-stone-900',
    icon: <BookOpen className="w-4 h-4" />
  },
  intro: {
    bg: 'bg-stone-100',
    text: 'text-stone-700',
    border: 'border-stone-300',
    icon: <FileText className="w-3.5 h-3.5" />
  },
  part: {
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-200',
    icon: <BookOpen className="w-3.5 h-3.5" />
  },
  chapter: {
    bg: 'bg-sky-50',
    text: 'text-sky-900',
    border: 'border-sky-200',
    icon: <FileText className="w-3.5 h-3.5" />
  },
  conclusion: {
    bg: 'bg-stone-100',
    text: 'text-stone-700',
    border: 'border-stone-300',
    icon: <FileText className="w-3.5 h-3.5" />
  },
  concept: {
    bg: 'bg-violet-50',
    text: 'text-violet-900',
    border: 'border-violet-200',
    icon: <Lightbulb className="w-3.5 h-3.5" />
  },
  figure: {
    bg: 'bg-green-50',
    text: 'text-green-900',
    border: 'border-green-200',
    icon: <User className="w-3.5 h-3.5" />
  }
};

const MindMapNode: React.FC<NodeProps<MindMapNodeData>> = ({ data, selected }) => {
  const style = nodeStyles[data.type] || nodeStyles.chapter;
  const hasChildren = data.childCount && data.childCount > 0;
  const isRoot = data.type === 'root';

  return (
    <div
      className={`
        relative px-4 py-3 border transition-all duration-150
        ${style.bg} ${style.text} ${style.border}
        ${selected ? 'ring-2 ring-stone-400 ring-offset-1' : ''}
        ${isRoot ? 'px-6 py-4' : ''}
        font-body
      `}
      style={{
        minWidth: isRoot ? 220 : 160,
        maxWidth: isRoot ? 280 : 200,
        borderRadius: '2px'
      }}
    >
      {/* Input handle (top) - hidden for root */}
      {!isRoot && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-stone-400 !w-2 !h-2 !border-0"
        />
      )}

      {/* Content */}
      <div className="flex items-start gap-2">
        {/* Icon */}
        <span className="mt-0.5 opacity-60">
          {style.icon}
        </span>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className={`font-bold leading-tight ${isRoot ? 'font-display text-base' : 'text-xs'}`}>
            {data.label}
          </div>
          {data.subtitle && (
            <div className={`opacity-70 leading-snug mt-1 ${isRoot ? 'text-sm' : 'text-[10px]'}`}>
              {data.subtitle}
            </div>
          )}
          {data.pageStart && !isRoot && (
            <div className="text-[9px] opacity-50 mt-1 font-mono">
              p. {data.pageStart}{data.pageEnd ? `–${data.pageEnd}` : ''}
            </div>
          )}
        </div>

        {/* Expand indicator */}
        {hasChildren && (
          <span className="opacity-40 mt-0.5">
            {data.isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        )}
      </div>

      {/* Child count badge */}
      {hasChildren && !data.isExpanded && (
        <div className="absolute -bottom-1 -right-1 bg-stone-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm">
          {data.childCount}
        </div>
      )}

      {/* Output handle (bottom) - shown if has children */}
      {hasChildren && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-stone-400 !w-2 !h-2 !border-0"
        />
      )}
    </div>
  );
};

export default memo(MindMapNode);
