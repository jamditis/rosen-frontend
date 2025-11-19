import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRight, PauseCircle, PlayCircle } from 'lucide-react';
import { FEATURED_WORKS } from '../constants';

const FeaturedSection: React.FC = () => {
  const [startIndex, setStartIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Configuration
  const ITEMS_TO_SHOW = 3;
  const ROTATION_INTERVAL = 6000; // 6 seconds

  const nextSlide = useCallback(() => {
    setIsTransitioning(true);
    setTimeout(() => {
      setStartIndex((prev) => (prev + 1) % FEATURED_WORKS.length);
      setIsTransitioning(false);
    }, 300); // Match CSS transition
  }, []);

  // Auto-rotation effect
  useEffect(() => {
    if (isPaused || FEATURED_WORKS.length <= ITEMS_TO_SHOW) return;

    const interval = setInterval(nextSlide, ROTATION_INTERVAL);
    return () => clearInterval(interval);
  }, [isPaused, nextSlide]);

  // Derived state for visible items (handling wrapping)
  const visibleWorks = [
    FEATURED_WORKS[startIndex % FEATURED_WORKS.length],
    FEATURED_WORKS[(startIndex + 1) % FEATURED_WORKS.length],
    FEATURED_WORKS[(startIndex + 2) % FEATURED_WORKS.length]
  ];

  return (
    <section 
      className="mb-12"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-end justify-between gap-4 mb-6 border-b border-stone-200 pb-2">
        <div className="flex items-end gap-4">
          <h2 className="text-2xl font-display font-bold text-stone-900">Featured Works</h2>
          <span className="text-sm text-stone-500 pb-1 mb-0.5 font-body hidden sm:inline">Curated highlights</span>
        </div>
        
        {/* Navigation Controls */}
        <div className="flex items-center gap-2 pb-1">
           {FEATURED_WORKS.map((_, idx) => (
             <button
                key={idx}
                onClick={() => setStartIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${idx === startIndex ? 'w-8 bg-stone-800' : 'w-2 bg-stone-300 hover:bg-stone-400'}`}
                aria-label={`Go to slide ${idx + 1}`}
             />
           ))}
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {visibleWorks.map((work, index) => (
          <a 
            key={`${work.id}-${startIndex}`} // Key change triggers re-mount animation
            href={work.link} 
            target="_blank" 
            rel="noreferrer"
            className={`
                group relative flex flex-col bg-white border border-stone-200 hover:border-stone-800 transition-all duration-500 shadow-sm hover:shadow-xl overflow-hidden
                animate-fade-in
            `}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Image */}
            <div className="relative h-48 overflow-hidden bg-stone-100">
              <div className="absolute inset-0 bg-stone-900/10 group-hover:bg-transparent transition-colors z-10" />
              <img 
                src={work.image} 
                alt={work.title} 
                className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 grayscale group-hover:grayscale-0"
              />
              <span className="absolute top-3 left-3 z-20 bg-stone-900 text-white text-[10px] font-bold uppercase px-2 py-1 tracking-wider">
                {work.type}
              </span>
            </div>

            {/* Content */}
            <div className="p-6 flex-grow flex flex-col">
              <h3 className="text-xl font-display font-bold text-stone-900 mb-3 group-hover:text-stone-600 transition-colors">
                {work.title}
              </h3>
              <p className="text-stone-600 text-sm leading-relaxed mb-4 flex-grow font-body">
                {work.description}
              </p>
              
              <div className="mt-auto pt-4 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-stone-400 group-hover:text-stone-900 transition-colors">
                <span>Explore</span>
                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default FeaturedSection;