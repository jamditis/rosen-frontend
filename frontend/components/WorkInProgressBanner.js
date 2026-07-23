import { useState, useEffect } from 'react';
import { html } from '../html.js?v=3.8.6';
import { Sparkles, X } from 'lucide-react';
import {
  readTourState,
  shouldShowTourEntry,
} from '../services/tourState.js?v=3.8.6';

const BANNER_DISMISSED_KEY = 'jrda_announce_banner_dismissed';

const getStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const wasBannerDismissed = (storage) => {
  try {
    return storage?.getItem(BANNER_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
};

const WorkInProgressBanner = () => {
  const [dismissed, setDismissed] = useState(true); // Start hidden to prevent flash

  useEffect(() => {
    const storage = getStorage();

    // Give a first-time visitor one invitation at a time. Once they have made
    // a choice about Start Here, this announcement can appear on a later visit.
    if (shouldShowTourEntry(readTourState(storage))) return;

    if (!wasBannerDismissed(storage)) {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      getStorage()?.setItem(BANNER_DISMISSED_KEY, 'true');
    } catch {
      // Dismiss for this session even when Web Storage is blocked.
    }
  };

  if (dismissed) return null;

  return html`
    <div className="archive-notice archive-announcement">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          <${Sparkles} className="w-5 h-5 text-sky-600 flex-shrink-0" />
          <div className="flex-grow">
            <p className="text-sm text-sky-700 font-medium">
              Jay Rosen's Internet Archive is now publicly available.
            </p>
            <p className="text-xs text-sky-700 mt-0.5">
              25,000+ records spanning four decades of journalism criticism, media theory, and public life.
            </p>
          </div>
          <!-- p-3 (12px) around the 20px w-5/h-5 icon = a 44x44 tap target
               (WCAG 2.5.5). Arbitrary values like min-w-[44px] are NOT in the
               pre-built zero-build stylesheet, so padding is used instead. No
               sky hover-bg exists in that CSS either; the icon darkens on hover
               and the focus ring covers keyboard users. -->
          <button
            onClick=${handleDismiss}
            className="archive-action archive-action--quiet archive-announcement__close flex-shrink-0 flex items-center justify-center p-3"
            aria-label="Dismiss banner"
          >
            <${X} className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  `;
};

export default WorkInProgressBanner;
