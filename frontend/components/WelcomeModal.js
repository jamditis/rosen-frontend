import { useEffect, useState } from 'react';
import { html } from '../html.js?v=3.8.5';
import { Archive, ArrowRight, X } from 'lucide-react';
import {
  readTourState,
  recordTourOutcome,
  shouldShowTourEntry,
  TOUR_OUTCOMES,
} from '../services/tourState.js?v=3.8.5';

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
      className="archive-panel archive-panel--accent archive-welcome-panel fixed z-40 bottom-4 right-4 w-full max-w-[calc(100vw-2rem)] sm:max-w-md p-4"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
    >
      <button
        onClick=${handleDismiss}
        className="archive-action archive-action--quiet archive-welcome-panel__close absolute top-2 right-2 p-3"
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
          className="archive-action archive-action--primary group py-3"
        >
          <span>Start here</span>
          <${ArrowRight} className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </button>
        <button
          onClick=${handleDismiss}
          className="archive-action archive-action--quiet py-3"
        >
          Maybe later
        </button>
      </div>
    </aside>
  `;
};

export default WelcomeModal;
