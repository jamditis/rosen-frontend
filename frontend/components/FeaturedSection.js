
import { useState, useEffect, useCallback } from 'react';
import { html } from '../html.js?v=3.8.23';
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Book, GraduationCap, MessageCircle, PenTool, FileText, Sparkles } from 'lucide-react';
import { FEATURED_WORKS } from '../constants.js?v=3.8.23';

const FeaturedSection = () => {
  const [startIndex, setStartIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const ITEMS_TO_SHOW = 3;
  const ROTATION_INTERVAL = 6000;

  const nextSlide = useCallback(() => {
    setStartIndex((prev) => (prev + 1) % FEATURED_WORKS.length);
  }, []);

  const previousSlide = useCallback(() => {
    setStartIndex((prev) => (prev - 1 + FEATURED_WORKS.length) % FEATURED_WORKS.length);
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || isPaused || !isExpanded || FEATURED_WORKS.length <= ITEMS_TO_SHOW) return;

    const interval = setInterval(nextSlide, ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide, isExpanded]);

  const visibleWorks = [
    FEATURED_WORKS[startIndex % FEATURED_WORKS.length],
    FEATURED_WORKS[(startIndex + 1) % FEATURED_WORKS.length],
    FEATURED_WORKS[(startIndex + 2) % FEATURED_WORKS.length]
  ];

  const getIconForType = (type) => {
      switch(type) {
          case 'PhD Dissertation': return html`<${GraduationCap} className="w-3 h-3 mr-1" />`;
          case 'Book': return html`<${Book} className="w-3 h-3 mr-1" />`;
          case 'Key Concept': return html`<${MessageCircle} className="w-3 h-3 mr-1" />`;
          case 'Blog': return html`<${PenTool} className="w-3 h-3 mr-1" />`;
          case 'Critique': return html`<${FileText} className="w-3 h-3 mr-1" />`;
          default: return html`<${Sparkles} className="w-3 h-3 mr-1" />`;
      }
  }

  return html`
    <section
      className="archive-featured"
      onMouseEnter=${() => setIsPaused(true)}
      onMouseLeave=${event => {
        if (!event.currentTarget.contains(document.activeElement)) setIsPaused(false);
      }}
      onFocusCapture=${() => setIsPaused(true)}
      onBlurCapture=${event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false);
      }}
      aria-labelledby="archive-featured-title"
    >
      <div className="archive-featured__header">
        <button
            type="button"
            onClick=${() => setIsExpanded(!isExpanded)}
            className="archive-featured__toggle"
            aria-expanded=${isExpanded}
            aria-controls="archive-featured-grid"
        >
          <h2 id="archive-featured-title">Read</h2>
          <span className="archive-featured__description">Curated highlights</span>
          <span className="archive-featured__chevron">
            ${isExpanded ? html`<${ChevronUp} className="w-5 h-5" />` : html`<${ChevronDown} className="w-5 h-5" />`}
          </span>
        </button>
        
        ${isExpanded && html`
            <div className="archive-featured__controls" aria-label="Choose featured set">
              <button
                type="button"
                onClick=${previousSlide}
                className="archive-featured__control"
                aria-label="Previous featured work"
              >
                <${ChevronLeft} aria-hidden="true" />
              </button>
              <span className="archive-featured__position">
                ${startIndex + 1} of ${FEATURED_WORKS.length}
              </span>
              <button
                type="button"
                onClick=${nextSlide}
                className="archive-featured__control"
                aria-label="Next featured work"
              >
                <${ChevronRight} aria-hidden="true" />
              </button>
            </div>
        `}
      </div>
      
      ${isExpanded && html`
        <div id="archive-featured-grid" className="archive-featured__grid">
            ${visibleWorks.map((work) => html`
            <a
                key=${`${work.id}-${startIndex}`}
                href=${work.link}
                target="_blank"
                rel="noreferrer"
                className="archive-featured-card"
                aria-label=${`Read ${work.title}`}
            >
                <div className="archive-featured-card__media">
                  <img src=${work.image} alt="" />
                  <span className="archive-featured-card__label">
                    ${getIconForType(work.type)} ${work.type}
                  </span>
                </div>

                <div className="archive-featured-card__body">
                <h3>
                    ${work.title}
                </h3>
                <p>${work.description}</p>

                <div className="archive-featured-card__read">
                    <span>Read</span>
                    <${ArrowRight} className="w-4 h-4" aria-hidden="true" />
                </div>
                </div>
            </a>
            `)}
        </div>
      `}
    </section>
  `;
};

export default FeaturedSection;
