
import { useState, useEffect, useRef } from 'react';
import { html } from '../html.js?v=3.8.27';
import { X, FileText, Quote, BookOpen, Lightbulb, User } from 'lucide-react';

// Type labels for display
const TYPE_LABELS = {
  root: 'Dissertation',
  intro: 'Introduction',
  part: 'Part',
  chapter: 'Chapter',
  conclusion: 'Conclusion',
  concept: 'Key concept',
  figure: 'Key figure'
};

const DetailPanel = ({ node, isOpen, onClose, contained = false }) => {
  // Keep the last node data so panel can animate out with content
  const [displayNode, setDisplayNode] = useState(node);
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (node) {
      setDisplayNode(node);
    }
    // Don't clear displayNode when node becomes null - keep it for animation
  }, [node]);

  // Focus management: focus close button when panel opens
  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) returnFocusRef.current = document.activeElement;
      wasOpenRef.current = true;
      if (!displayNode) return undefined;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let frame = null;
      let timer = null;
      const focusClose = () => {
        if (contained) panelRef.current?.scrollIntoView({ block: 'start' });
        closeButtonRef.current?.focus({ preventScroll: contained });
      };
      if (reduceMotion) frame = requestAnimationFrame(focusClose);
      else timer = setTimeout(focusClose, 100);
      return () => {
        if (frame !== null) cancelAnimationFrame(frame);
        if (timer !== null) clearTimeout(timer);
      };
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const trigger = returnFocusRef.current;
      returnFocusRef.current = null;
      requestAnimationFrame(() => trigger?.focus?.({ preventScroll: true }));
    }

    return undefined;
  }, [isOpen, displayNode, contained]);

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

  const positionClass = contained ? 'absolute' : 'fixed';

  return html`
    ${isOpen && html`
      <div
        className=${`${positionClass} inset-0 bg-black/20 z-40 sm:hidden`}
        style=${{ zIndex: 70 }}
        onClick=${onClose}
      />
    `}

    <div
      ref=${panelRef}
      role="dialog"
      aria-hidden=${isOpen ? undefined : 'true'}
      inert=${isOpen ? undefined : ''}
      aria-labelledby="detail-panel-title"
      className=${`
        archive-detail-panel archive-reading-panel ${contained ? 'is-contained' : ''} ${positionClass} top-0 h-full w-full sm:w-[420px]
        shadow-xl z-50 transform transition-transform duration-300 ease-out
        ${isOpen ? 'right-0' : '-right-full sm:-right-[420px]'}
      `}
      style=${{
        maxWidth: contained ? 'calc(100% - 16px)' : 'calc(100vw - 16px)',
        zIndex: 80,
      }}
    >
      <header className="archive-reading-panel__header">
        <span>
          ${TYPE_LABELS[displayNode.type] || 'Section'}
        </span>
        <button
          type="button"
          ref=${closeButtonRef}
          onClick=${onClose}
          className="archive-reading-panel__close"
          title="Close panel (ESC)"
          aria-label="Close detail panel"
        >
          <${X} className="w-5 h-5 text-stone-500" />
        </button>
      </header>

      <div
        className="archive-detail-content archive-reading-panel__document"
        tabIndex="0"
        aria-label="Detail panel content"
      >
        <h2 id="detail-panel-title">
          ${displayNode.label}
        </h2>

        ${displayNode.subtitle && html`
          <p className="archive-reading-panel__subtitle">${displayNode.subtitle}</p>
        `}

        ${(displayNode.pageStart || displayNode.pageRef) && html`
          <div className="archive-reading-panel__page-reference">
            <${FileText} className="w-3.5 h-3.5" />
            <span>
              ${displayNode.pageRef || `Pages ${displayNode.pageStart}${displayNode.pageEnd ? `–${displayNode.pageEnd}` : '+'}`}
            </span>
          </div>
        `}

        ${displayNode.pullQuote && html`
          <section className="archive-reading-panel__section">
            <h3>
              <${Quote} className="w-3.5 h-3.5" />
              <span>From the text</span>
            </h3>
            <blockquote>
              “${displayNode.pullQuote}”
            </blockquote>
          </section>
        `}

        ${displayNode.summary && html`
          <section className="archive-reading-panel__section">
            <h3>
              <${BookOpen} className="w-3.5 h-3.5" />
              <span>Summary</span>
            </h3>
            <p>
              ${displayNode.summary}
            </p>
          </section>
        `}

        ${displayNode.keyConcepts && displayNode.keyConcepts.length > 0 && html`
          <section className="archive-reading-panel__section">
            <h3>
              <${Lightbulb} className="w-3.5 h-3.5" />
              <span>Key concepts</span>
            </h3>
            <div className="archive-reading-panel__tags">
              ${displayNode.keyConcepts.map((concept, i) => html`
                <span
                  key=${i}
                  className="archive-reading-panel__tag"
                >
                  ${concept}
                </span>
              `)}
            </div>
          </section>
        `}

        ${displayNode.keyFigures && displayNode.keyFigures.length > 0 && html`
          <section className="archive-reading-panel__section">
            <h3>
              <${User} className="w-3.5 h-3.5" />
              <span>Key figures</span>
            </h3>
            <div className="archive-reading-panel__tags">
              ${displayNode.keyFigures.map((figure, i) => html`
                <span
                  key=${i}
                  className="archive-reading-panel__tag"
                >
                  ${figure}
                </span>
              `)}
            </div>
          </section>
        `}

        ${!displayNode.summary && !displayNode.pullQuote && !displayNode.keyConcepts?.length && !displayNode.keyFigures?.length && html`
          <div className="archive-reading-panel__empty">
            <${FileText} className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No additional detail for this item</p>
          </div>
        `}
      </div>
    </div>
  `;
};

export default DetailPanel;
