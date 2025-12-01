import { useState, useEffect } from 'react';
import { html } from '../html.js';
import { Construction, X, BookOpen } from 'lucide-react';

const BANNER_DISMISSED_KEY = 'jrda_wip_banner_dismissed';

const WorkInProgressBanner = ({ onNavigateToDissertation }) => {
  const [dismissed, setDismissed] = useState(true); // Start hidden to prevent flash

  useEffect(() => {
    // Check if banner was previously dismissed
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
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-start gap-3">
          <${Construction} className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <p className="text-sm text-amber-800 font-medium">
              This archive is a work in progress
            </p>
            <p className="text-xs text-amber-700 mt-1">
              The full archive launches in 2026. In the meantime, explore
              <button
                onClick=${onNavigateToDissertation}
                className="inline-flex items-center gap-1 mx-1 text-amber-900 font-bold hover:underline"
              >
                <${BookOpen} className="w-3 h-3" />
                Jay Rosen's 1986 dissertation
              </button>
              and its companion tools, which are available now.
            </p>
          </div>
          <button
            onClick=${handleDismiss}
            className="p-1 text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded transition-colors flex-shrink-0"
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
