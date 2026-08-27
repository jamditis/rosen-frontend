import { html } from '../html.js?v=3.8.36';
import { X } from 'lucide-react';

/**
 * One quiet, dismissible line above the results (#754).
 *
 * Both hidden notes use it: the dissertation-year note and the broken-record
 * note. It is a note, not a dialog or a landmark: it never steals focus, never
 * traps it, and two of them on one page cannot collide as duplicate landmarks.
 * The close button is a full-size tap target like the announcement banner.
 * The optional link points at the payoff.
 */
const EasterEggNote = ({ text, linkHref, linkLabel, onLink, onDismiss }) => {
  if (!text) return null;

  return html`
    <div className="archive-notice archive-egg-note" role="note">
      <p className="archive-egg-note__line">${text}</p>
      ${linkHref && linkLabel && html`
        <a
          href=${linkHref}
          className="archive-egg-note__link"
          onClick=${(event) => {
            if (!onLink) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onLink();
          }}
        >${linkLabel}</a>
      `}
      <button
        type="button"
        onClick=${onDismiss}
        className="archive-action archive-action--quiet archive-egg-note__close flex items-center justify-center p-3"
        aria-label="Dismiss note"
      >
        <${X} className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  `;
};

export default EasterEggNote;
