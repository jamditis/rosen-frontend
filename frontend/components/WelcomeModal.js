import { useEffect, useState } from 'react';
import { html } from '../html.js?v=3.8.0';
import { Archive, ArrowRight, X } from 'lucide-react';
import {
  readTourState,
  recordTourOutcome,
  shouldShowTourEntry,
  TOUR_OUTCOMES,
} from '../services/tourState.js?v=3.8.0';

const getStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

// Kept under its established component name, but rendered as a non-blocking
// invitation so a first visit can always use the archive immediately.
const WelcomeModal = ({ onStart }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(shouldShowTourEntry(readTourState(getStorage())));
  }, []);

  const finishEntry = (outcome) => {
    recordTourOutcome(getStorage(), outcome);
    // Always hide for the current session, even when storage is unavailable.
    setIsVisible(false);
  };

  const handleDismiss = () => {
    finishEntry(TOUR_OUTCOMES.dismissed);
  };

  const handleStart = () => {
    finishEntry(TOUR_OUTCOMES.completed);
    onStart?.();
  };

  if (!isVisible || !onStart) return null;

  return html`
    <aside
      className="fixed z-40 bottom-4 right-4 w-full max-w-[calc(100vw-2rem)] sm:max-w-md bg-[#fdfbf7] border-2 border-stone-800 shadow-xl p-4 animate-fade-in"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
    >
      <button
        onClick=${handleDismiss}
        className="absolute top-2 right-2 p-3 text-stone-500 hover:text-stone-900 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500"
        aria-label="Dismiss Start here invitation"
      >
        <${X} className="w-5 h-5" aria-hidden="true" />
      </button>

      <div className="flex items-center gap-3 pr-8">
        <div className="bg-stone-900 text-white p-2 flex-shrink-0" aria-hidden="true">
          <${Archive} className="w-5 h-5" />
        </div>
        <h2 id="welcome-title" className="text-xl font-display font-bold text-stone-900">
          Find your way in
        </h2>
      </div>
      <p id="welcome-description" className="text-sm text-stone-600 leading-relaxed font-body mt-3">
        Begin with a landmark work, search the collection, or follow an idea across four decades.
      </p>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick=${handleStart}
          className="group inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-stone-900 font-display transition-colors hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          <span>Start here</span>
          <${ArrowRight} className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
        <button
          onClick=${handleDismiss}
          className="inline-flex items-center justify-center px-4 py-3 text-sm font-bold text-stone-600 font-display transition-colors hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          Maybe later
        </button>
      </div>
    </aside>
  `;
};

export default WelcomeModal;
