
import { useState, useEffect, useRef } from 'react';
import { html } from '../html.js?v=3.6.5';
import { X, FileText, Quote, BookOpen, Lightbulb, User } from 'lucide-react';

// Type labels for display
const TYPE_LABELS = {
  root: 'Dissertation',
  intro: 'Introduction',
  part: 'Part',
  chapter: 'Chapter',
  conclusion: 'Conclusion',
  concept: 'Key Concept',
  figure: 'Key Figure'
};

const DetailPanel = ({ node, isOpen, onClose }) => {
  // Keep the last node data so panel can animate out with content
  const [displayNode, setDisplayNode] = useState(node);
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (node) {
      setDisplayNode(node);
    }
    // Don't clear displayNode when node becomes null - keep it for animation
  }, [node]);

  // Focus management: focus close button when panel opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      // Small delay to ensure animation has started
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Don't render anything if we've never had a node
  if (!displayNode) return null;

  return html`
    ${isOpen && html`
      <div
        className="fixed inset-0 bg-black/20 z-40 sm:hidden"
        onClick=${onClose}
      />
    `}

    <div
      ref=${panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-panel-title"
      className=${`
        fixed top-0 h-full w-full sm:w-[420px] bg-white border-l border-stone-200
        shadow-xl z-50 transform transition-transform duration-300 ease-out
        ${isOpen ? 'right-0' : '-right-full sm:-right-[420px]'}
      `}
      style=${{ maxWidth: 'calc(100vw - 16px)' }}
    >
      <div className="sticky top-0 bg-white border-b border-stone-200 px-4 sm:px-6 py-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
          ${TYPE_LABELS[displayNode.type] || 'Section'}
        </span>
        <button
          ref=${closeButtonRef}
          onClick=${onClose}
          className="p-2.5 sm:p-1.5 hover:bg-stone-100 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
          title="Close panel (ESC)"
          aria-label="Close detail panel"
        >
          <${X} className="w-5 h-5 text-stone-500" />
        </button>
      </div>

      <div className="pl-4 pr-6 sm:pl-6 sm:pr-8 py-6 overflow-y-auto overflow-x-hidden h-[calc(100%-64px)]">
        <h2 id="detail-panel-title" className="font-display text-xl font-bold text-stone-900 leading-tight mb-2 break-words">
          ${displayNode.label}
        </h2>

        ${displayNode.subtitle && html`
          <p className="text-stone-600 text-sm mb-4 break-words">${displayNode.subtitle}</p>
        `}

        ${(displayNode.pageStart || displayNode.pageRef) && html`
          <div className="flex items-center gap-2 text-xs text-stone-400 mb-6 font-mono">
            <${FileText} className="w-3.5 h-3.5" />
            <span>
              ${displayNode.pageRef || `Pages ${displayNode.pageStart}${displayNode.pageEnd ? `–${displayNode.pageEnd}` : '+'}`}
            </span>
          </div>
        `}

        ${displayNode.pullQuote && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${Quote} className="w-3.5 h-3.5" />
              <span>From the text</span>
            </div>
            <blockquote className="border-l-2 border-amber-300 pl-4 italic text-stone-700 text-sm leading-relaxed break-words">
              "${displayNode.pullQuote}"
            </blockquote>
          </div>
        `}

        ${displayNode.summary && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${BookOpen} className="w-3.5 h-3.5" />
              <span>Summary</span>
            </div>
            <p className="text-stone-600 text-sm leading-relaxed break-words">
              ${displayNode.summary}
            </p>
          </div>
        `}

        ${displayNode.keyConcepts && displayNode.keyConcepts.length > 0 && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${Lightbulb} className="w-3.5 h-3.5" />
              <span>Key Concepts</span>
            </div>
            <div className="flex flex-wrap gap-2">
              ${displayNode.keyConcepts.map((concept, i) => html`
                <span
                  key=${i}
                  className="text-xs bg-violet-50 text-violet-800 px-2 py-1 border border-violet-200"
                >
                  ${concept}
                </span>
              `)}
            </div>
          </div>
        `}

        ${displayNode.keyFigures && displayNode.keyFigures.length > 0 && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${User} className="w-3.5 h-3.5" />
              <span>Key Figures</span>
            </div>
            <div className="flex flex-wrap gap-2">
              ${displayNode.keyFigures.map((figure, i) => html`
                <span
                  key=${i}
                  className="text-xs bg-green-50 text-green-800 px-2 py-1 border border-green-200"
                >
                  ${figure}
                </span>
              `)}
            </div>
          </div>
        `}

        ${!displayNode.summary && !displayNode.pullQuote && !displayNode.keyConcepts?.length && !displayNode.keyFigures?.length && html`
          <div className="text-center py-8 text-stone-400">
            <${FileText} className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No additional detail for this item</p>
          </div>
        `}
      </div>
    </div>
  `;
};

export default DetailPanel;
