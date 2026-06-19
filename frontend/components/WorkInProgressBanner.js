import { useState, useEffect } from 'react';
import { html } from '../html.js?v=3.4.3';
import { Sparkles, X } from 'lucide-react';

const BANNER_DISMISSED_KEY = 'jrda_announce_banner_dismissed';

const WorkInProgressBanner = () => {
  const [dismissed, setDismissed] = useState(true); // Start hidden to prevent flash

  useEffect(() => {
    const wasDismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (!wasDismissed) {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
  };

  if (dismissed) return null;

  return html`
    <div className="bg-sky-50 border-b border-sky-200">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          <${Sparkles} className="w-5 h-5 text-sky-600 flex-shrink-0" />
          <div className="flex-grow">
            <p className="text-sm text-sky-800 font-medium">
              Jay Rosen's Internet Archive is now publicly available.
            </p>
            <p className="text-xs text-sky-700 mt-0.5">
              25,000+ records spanning four decades of journalism criticism, media theory, and public life.
            </p>
          </div>
          <button
            onClick=${handleDismiss}
            className="p-1 text-sky-600 hover:text-sky-800 hover:bg-sky-100 rounded transition-colors flex-shrink-0"
            aria-label="Dismiss banner"
          >
            <${X} className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  `;
};

export default WorkInProgressBanner;
