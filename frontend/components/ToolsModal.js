// ToolsModal.js - Modal with icons for exploring archive tools
import { useEffect, useRef, useCallback } from 'react';
import { html } from '../html.js?v=3.8.15';
import { X, Compass, Map, BookOpen, HelpCircle, BarChart3, BookMarked, Monitor } from 'lucide-react';
import { resolveSitePath } from '../utils/pathResolver.js?v=3.8.15';
import { acquireBodyScrollLock } from '../services/bodyScrollLock.js?v=3.8.15';

// Tool definitions with categories
const TOOLS = {
  archive: [
    {
      id: 'start',
      name: 'Start here',
      description: 'Choose a guided path into the archive',
      icon: Compass,
      action: 'start',
      status: 'ready'
    },
    {
      id: 'desktop',
      name: 'Archive desktop',
      description: 'Explore through an optional desktop view',
      icon: Monitor,
      action: 'desktop',
      status: 'beta'
    }
  ],
  dissertation: [
    {
      id: 'mindmap',
      name: 'Mind map',
      description: 'Interactive dissertation structure',
      icon: Map,
      action: 'mindmap', // in-page action
      status: 'ready'
    },
    {
      id: 'faq',
      name: 'FAQ',
      description: 'Archive & dissertation Q&A',
      icon: HelpCircle,
      href: 'faq/',
      status: 'ready'
    },
    {
      id: 'reader',
      name: 'Dissertation reader',
      description: 'Read the full text',
      icon: BookMarked,
      href: 'dissertation/reader/',
      status: 'ready'
    }
  ],
  data: [
    {
      id: 'dataviz',
      name: 'Data visualization',
      description: 'Charts and analysis',
      icon: BarChart3,
      href: 'tools/active/dataviz/dataviz.html',
      status: 'beta'
    }
  ]
};

const ToolsModal = ({ isOpen, onClose, onSelectTool }) => {
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const openerRef = useRef(null);
  const backgroundStateRef = useRef([]);

  // Move focus into the dialog, isolate the page behind it, then restore the
  // exact opener when the dialog closes.
  useEffect(() => {
    if (!isOpen) return undefined;

    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();

    const backdrop = modalRef.current?.parentElement;
    const backgroundElements = backdrop?.parentElement
      ? Array.from(backdrop.parentElement.children).filter((element) => element !== backdrop)
      : [];

    backgroundStateRef.current = backgroundElements.map((element) => ({
      element,
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: element.inert
    }));

    backgroundStateRef.current.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });

    return () => {
      backgroundStateRef.current.forEach(({ element, ariaHidden, inert }) => {
        element.inert = inert;
        if (ariaHidden === null) {
          element.removeAttribute('aria-hidden');
        } else {
          element.setAttribute('aria-hidden', ariaHidden);
        }
      });
      backgroundStateRef.current = [];

      if (openerRef.current?.isConnected) {
        openerRef.current?.focus();
      }
      openerRef.current = null;
    };
  }, [isOpen]);

  // Keep keyboard focus inside the modal and preserve Escape-to-close.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && isOpen && modalRef.current) {
        const focusableElements = Array.from(modalRef.current.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )).filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null);

        if (focusableElements.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const focusIsOutside = !modalRef.current.contains(document.activeElement);

        if (e.shiftKey && (document.activeElement === firstElement || focusIsOutside)) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && (document.activeElement === lastElement || focusIsOutside)) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return undefined;
    return acquireBodyScrollLock();
  }, [isOpen]);

  const handleToolClick = useCallback((tool) => {
    if (tool.action) {
      // In-page action
      onSelectTool(tool.action);
      onClose();
    } else if (tool.href) {
      // Site-root-relative path resolved for the current environment so the
      // link works in local preview and GitHub Pages, not just production.
      window.location.href = resolveSitePath(tool.href);
    }
  }, [onSelectTool, onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const renderToolCard = (tool) => {
    const IconComponent = tool.icon;

    return html`
      <button
        key=${tool.id}
        onClick=${() => handleToolClick(tool)}
        className="archive-panel archive-tool-card group relative flex flex-col items-center p-4 sm:p-6"
      >
        ${tool.status === 'beta' && html`
          <span className="archive-section-label absolute top-2 right-2">
            Beta
          </span>
        `}

        <div className="w-12 h-12 flex items-center justify-center rounded-none bg-stone-100 group-hover:bg-stone-200 transition-colors mb-3">
          <${IconComponent} className="w-6 h-6 text-stone-600 group-hover:text-stone-800 transition-colors" aria-hidden="true" />
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
      className="archive-tools-dialog-backdrop archive-dialog-backdrop z-[100]"
      onClick=${handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tools-modal-title"
    >
      <div
        ref=${modalRef}
        className="archive-dialog archive-tools-dialog"
        tabIndex="-1"
      >
        <div className="archive-tools-dialog__header sticky top-0 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 id="tools-modal-title" className="font-display text-xl text-stone-800">
              Tools
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Choose a tool to explore the archive and dissertation
            </p>
          </div>
          <button
            ref=${closeButtonRef}
            onClick=${onClose}
              className="archive-action archive-action--quiet archive-tools-dialog__close"
              aria-label="Close tools menu"
            >
              <${X} className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          <section>
            <h3 className="archive-tools-dialog__section-title">
              <${Compass} className="w-4 h-4" aria-hidden="true" />
              Explore the archive
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              ${TOOLS.archive.map((tool) => renderToolCard(tool))}
            </div>
          </section>

          <section>
            <h3 className="archive-tools-dialog__section-title">
              <${BookOpen} className="w-4 h-4" aria-hidden="true" />
              Dissertation tools
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              ${TOOLS.dissertation.map((tool) => renderToolCard(tool))}
            </div>
          </section>

          <section>
            <h3 className="archive-tools-dialog__section-title">
              <${BarChart3} className="w-4 h-4" aria-hidden="true" />
              Data tools
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              ${TOOLS.data.map((tool) => renderToolCard(tool))}
            </div>
          </section>
        </div>

        <div className="archive-notice archive-tools-dialog__notice">
          <p className="text-xs text-stone-700 text-center">
            Tools marked <span className="archive-section-label">Beta</span> are still in development
          </p>
        </div>
      </div>
    </div>
  `;
};

export default ToolsModal;
