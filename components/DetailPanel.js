
import { html } from '../html.js';
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
  if (!node) return null;

  return html`
    <!-- Backdrop -->
    ${isOpen && html`
      <div
        className="fixed inset-0 bg-black/20 z-40 sm:hidden"
        onClick=${onClose}
      />
    `}

    <!-- Panel -->
    <div
      className=${`
        fixed right-0 top-0 h-full w-full sm:w-96 bg-white border-l border-stone-200
        shadow-xl z-50 transform transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
      `}
    >
      <!-- Header -->
      <div className="sticky top-0 bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
          ${TYPE_LABELS[node.type] || 'Section'}
        </span>
        <button
          onClick=${onClose}
          className="p-1.5 hover:bg-stone-100 rounded transition-colors"
        >
          <${X} className="w-5 h-5 text-stone-500" />
        </button>
      </div>

      <!-- Content -->
      <div className="p-6 overflow-y-auto h-[calc(100%-64px)]">
        <!-- Title -->
        <h2 className="font-display text-xl font-bold text-stone-900 leading-tight mb-2">
          ${node.label}
        </h2>

        ${node.subtitle && html`
          <p className="text-stone-600 text-sm mb-4">${node.subtitle}</p>
        `}

        <!-- Page reference -->
        ${node.pageStart && html`
          <div className="flex items-center gap-2 text-xs text-stone-400 mb-6 font-mono">
            <${FileText} className="w-3.5 h-3.5" />
            <span>
              Pages ${node.pageStart}${node.pageEnd ? `–${node.pageEnd}` : '+'}
            </span>
          </div>
        `}

        <!-- Pull Quote -->
        ${node.pullQuote && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${Quote} className="w-3.5 h-3.5" />
              <span>From the text</span>
            </div>
            <blockquote className="border-l-2 border-amber-300 pl-4 italic text-stone-700 text-sm leading-relaxed">
              "${node.pullQuote}"
            </blockquote>
          </div>
        `}

        <!-- Summary -->
        ${node.summary && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${BookOpen} className="w-3.5 h-3.5" />
              <span>Summary</span>
            </div>
            <p className="text-stone-600 text-sm leading-relaxed">
              ${node.summary}
            </p>
          </div>
        `}

        <!-- Key Concepts -->
        ${node.keyConcepts && node.keyConcepts.length > 0 && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${Lightbulb} className="w-3.5 h-3.5" />
              <span>Key Concepts</span>
            </div>
            <div className="flex flex-wrap gap-2">
              ${node.keyConcepts.map((concept, i) => html`
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

        <!-- Key Figures -->
        ${node.keyFigures && node.keyFigures.length > 0 && html`
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-2">
              <${User} className="w-3.5 h-3.5" />
              <span>Key Figures</span>
            </div>
            <div className="flex flex-wrap gap-2">
              ${node.keyFigures.map((figure, i) => html`
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

        <!-- Placeholder if no detail content -->
        ${!node.summary && !node.pullQuote && !node.keyConcepts?.length && !node.keyFigures?.length && html`
          <div className="text-center py-8 text-stone-400">
            <${FileText} className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Detailed content coming soon</p>
          </div>
        `}
      </div>
    </div>
  `;
};

export default DetailPanel;
