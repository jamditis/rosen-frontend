import React, { useEffect, useState } from 'react';
import { Archive, ArrowRight } from 'lucide-react';

const WelcomeModal: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hasVisited = localStorage.getItem('jrda_visited');
    if (!hasVisited) {
      setIsVisible(true);
    }
  }, []);

  const handleEnter = () => {
    localStorage.setItem('jrda_visited', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/90 backdrop-blur-sm transition-opacity duration-500 px-4">
      <div className="bg-[#fdfbf7] p-8 max-w-lg w-full border-2 border-stone-800 shadow-[8px_8px_0px_0px_rgba(28,25,23,1)] text-center relative animate-fade-in">
        <div className="mb-6">
          <Archive className="w-12 h-12 mx-auto text-stone-800" />
        </div>
        <h2 className="text-3xl font-display text-stone-900 mb-4">The Jay Rosen digital archive</h2>
        <p className="text-stone-600 mb-8 leading-relaxed font-body">
          A curated public collection of the works, critiques, and teachings of Jay Rosen, professor of journalism at New York University.
        </p>
        <button
          onClick={handleEnter}
          className="group relative inline-flex items-center justify-center px-8 py-3 text-base font-bold text-white transition-all duration-200 bg-stone-900 font-display focus:outline-none hover:bg-stone-700"
        >
          <span>Enter archive</span>
          <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </div>
  );
};

export default WelcomeModal;