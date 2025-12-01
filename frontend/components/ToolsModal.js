// ToolsModal.js - Modal with icons for exploring dissertation tools
import { useEffect, useRef, useCallback } from 'react';
import { html } from '../html.js';
import { X, Map, Zap, BookOpen, Calendar, FileText, Tv, HelpCircle, Network, BarChart3, BookMarked } from 'lucide-react';

// Tool definitions with categories
const TOOLS = {
  dissertation: [
    {
      id: 'mindmap',
      name: 'Mind Map',
      description: 'Interactive dissertation structure',
      icon: Map,
      action: 'mindmap', // in-page action
      status: 'ready'
    },
    {
      id: 'comparison',
      name: 'Then & Now',
      description: '1986 vs 2025 comparisons',
      icon: Zap,
      href: '/wp-content/rosen-archive/comparison-tool/',
      status: 'ready'
    },
    {
      id: 'glossary',
      name: 'Glossary',
      description: 'Key concepts defined',
      icon: BookOpen,
      href: '/wp-content/rosen-archive/glossary/',
      status: 'ready'
    },
    {
      id: 'timeline',
      name: 'Timeline',
      description: '40 years of ideas',
      icon: Calendar,
      href: '/wp-content/rosen-archive/timeline/',
      status: 'ready'
    },
    {
      id: 'excerpts',
      name: 'Annotated Excerpts',
      description: 'Key passages with commentary',
      icon: FileText,
      href: '/wp-content/rosen-archive/annotated-excerpts/',
      status: 'ready'
    },
    {
      id: 'context',
      name: '1986 Context',
      description: 'The media landscape then',
      icon: Tv,
      href: '/wp-content/rosen-archive/context-1986/',
      status: 'ready'
    },
    {
      id: 'faq',
      name: 'FAQ',
      description: 'Questions & answers',
      icon: HelpCircle,
      href: '/wp-content/rosen-archive/faq/',
      status: 'ready'
    },
    {
      id: 'reader',
      name: 'Dissertation Reader',
      description: 'Read the full text',
      icon: BookMarked,
      href: '/wp-content/rosen-archive/tools/dissertation-reader/dist/',
      status: 'beta'
    }
  ],
  data: [
    {
      id: 'explorer',
      name: 'Network Explorer',
      description: 'Visual record connections',
      icon: Network,
      action: 'explorer', // in-page action
      status: 'ready'
    },
    {
      id: 'dataviz',
      name: 'Data Visualization',
      description: 'Charts and analysis',
      icon: BarChart3,
      href: '/wp-content/rosen-archive/tools/dataviz/dataviz.html',
      status: 'beta'
    }
  ]
};

const ToolsModal = ({ isOpen, onClose, onSelectTool }) => {
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const firstToolRef = useRef(null);

  // Focus management
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleToolClick = useCallback((tool) => {
    if (tool.action) {
      // In-page action
      onSelectTool(tool.action);
      onClose();
    } else if (tool.href) {
      // External link
      window.location.href = tool.href;
    }
  }, [onSelectTool, onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const renderToolCard = (tool, index, isFirst = false) => {
    const IconComponent = tool.icon;

    return html`
      <button
        key=${tool.id}
        ref=${isFirst ? firstToolRef : null}
        onClick=${() => handleToolClick(tool)}
        className="group relative flex flex-col items-center p-6 bg-white rounded-lg border border-stone-200 hover:border-stone-400 hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
      >
        ${tool.status === 'beta' && html`
          <span className="absolute top-2 right-2 text-[10px] font-bold uppercase px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200">
            Beta
          </span>
        `}

        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-stone-100 group-hover:bg-stone-200 transition-colors mb-3">
          <${IconComponent} className="w-6 h-6 text-stone-600 group-hover:text-stone-800 transition-colors" />
        </div>

        <h3 className="font-display text-sm font-bold text-stone-800 mb-1 text-center">
          ${tool.name}
        </h3>

        <p className="text-xs text-stone-500 text-center leading-relaxed">
          ${tool.description}
        </p>
      </button>
    `;
  };

  return html`
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick=${handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tools-modal-title"
    >
      <div
        ref=${modalRef}
        className="bg-paper w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl"
      >
        <!-- Header -->
        <div className="sticky top-0 bg-paper border-b border-stone-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 id="tools-modal-title" className="font-display text-xl text-stone-800">
              Explore Tools
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Choose a tool to explore the archive and dissertation
            </p>
          </div>
          <button
            ref=${closeButtonRef}
            onClick=${onClose}
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
            aria-label="Close tools menu"
          >
            <${X} className="w-5 h-5" />
          </button>
        </div>

        <!-- Content -->
        <div className="p-6 space-y-8">
          <!-- Dissertation Tools -->
          <section>
            <h3 className="font-display text-sm font-bold text-stone-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <${BookOpen} className="w-4 h-4" />
              Dissertation Tools
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              ${TOOLS.dissertation.map((tool, i) => renderToolCard(tool, i, i === 0))}
            </div>
          </section>

          <!-- Data Tools -->
          <section>
            <h3 className="font-display text-sm font-bold text-stone-600 uppercase tracking-wider mb-4 flex items-center gap-2">
              <${BarChart3} className="w-4 h-4" />
              Data Tools
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              ${TOOLS.data.map((tool, i) => renderToolCard(tool, i))}
            </div>
          </section>
        </div>

        <!-- Footer -->
        <div className="border-t border-stone-200 px-6 py-4 bg-stone-50">
          <p className="text-xs text-stone-500 text-center">
            Tools marked <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">Beta</span> are still in development
          </p>
        </div>
      </div>
    </div>
  `;
};

export default ToolsModal;
