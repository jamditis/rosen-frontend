
import { useState, useEffect, useCallback } from 'react';
import { html } from '../html.js?v=3.6.5';
import { ArrowRight, ChevronDown, ChevronUp, Book, GraduationCap, MessageCircle, PenTool, FileText, Sparkles } from 'lucide-react';
import { FEATURED_WORKS } from '../constants.js?v=3.6.5';

const FeaturedSection = () => {
  const [startIndex, setStartIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const ITEMS_TO_SHOW = 3;
  const ROTATION_INTERVAL = 6000;

  const nextSlide = useCallback(() => {
    setStartIndex((prev) => (prev + 1) % FEATURED_WORKS.length);
  }, []);

  useEffect(() => {
    if (isPaused || !isExpanded || FEATURED_WORKS.length <= ITEMS_TO_SHOW) return;

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
      className="mb-12"
      onMouseEnter=${() => setIsPaused(true)}
      onMouseLeave=${() => setIsPaused(false)}
    >
      <div className="flex items-end justify-between gap-4 mb-6 border-b border-stone-200 pb-2">
        <button 
            onClick=${() => setIsExpanded(!isExpanded)}
            className="flex items-end gap-4 group text-left focus:outline-none"
        >
          <h2 className="text-2xl font-display font-bold text-stone-900">Read</h2>
          <span className="text-sm text-stone-500 pb-1 mb-0.5 font-body hidden sm:inline group-hover:text-stone-800 transition-colors">Curated highlights</span>
          <div className="pb-1.5 text-stone-400 group-hover:text-stone-800 transition-colors">
            ${isExpanded ? html`<${ChevronUp} className="w-5 h-5" />` : html`<${ChevronDown} className="w-5 h-5" />`}
          </div>
        </button>
        
        ${isExpanded && html`
            <div className="flex items-center gap-2 pb-1">
            ${FEATURED_WORKS.map((_, idx) => html`
                <button
                    key=${idx}
                    onClick=${() => setStartIndex(idx)}
                    className=${`h-1.5 rounded-full transition-all duration-300 ${idx === startIndex ? 'w-8 bg-stone-800' : 'w-2 bg-stone-300 hover:bg-stone-400'}`}
                    aria-label=${`Go to slide ${idx + 1}`}
                />
            `)}
            </div>
        `}
      </div>
      
      ${isExpanded && html`
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${visibleWorks.map((work, index) => html`
            <a 
                key=${`${work.id}-${startIndex}`}
                href=${work.link} 
                target="_blank" 
                rel="noreferrer"
                className="group relative flex flex-col bg-white border border-stone-200 hover:border-stone-800 transition-all duration-500 shadow-sm hover:shadow-xl overflow-hidden animate-fade-in"
                style=${{ animationDelay: `${index * 100}ms` }}
            >
                <div className="relative h-28 overflow-hidden bg-stone-100">
                <div className="absolute inset-0 bg-stone-900/10 group-hover:bg-transparent transition-colors z-10" />
                <img 
                    src=${work.image} 
                    alt=${work.title} 
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 grayscale group-hover:grayscale-0"
                />
                <span className="absolute top-3 left-3 z-20 bg-stone-900 text-white text-[10px] font-bold uppercase px-2 py-1 tracking-wider flex items-center">
                    ${getIconForType(work.type)} ${work.type}
                </span>
                </div>

                <div className="p-4 flex-grow flex flex-col">
                <h3 className="text-base font-display font-bold text-stone-900 mb-1 group-hover:text-stone-600 transition-colors leading-tight">
                    ${work.title}
                </h3>

                <div className="mt-auto pt-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-stone-400 group-hover:text-stone-900 transition-colors">
                    <span>Read</span>
                    <${ArrowRight} className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
                </div>

                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-stone-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none w-64 text-center z-50 shadow-lg hidden sm:block" style=${{ lineHeight: '1.5' }}>
                  ${work.description}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-stone-900"></div>
                </div>
            </a>
            `)}
        </div>
      `}
    </section>
  `;
};

export default FeaturedSection;
