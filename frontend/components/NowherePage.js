import { html } from '../html.js?v=3.8.36';
import { NOWHERE_LINE } from '../utils/easterEggs.js?v=3.8.36';

/**
 * The hidden #nowhere route (#754): one line on an empty sheet of paper.
 *
 * Nothing links here from the site navigation. Anyone who finds it still gets
 * a full page: a focusable heading, a link to the essay behind the line, and a
 * way back to the archive. No motion, no sound, no trap.
 */
const NowherePage = ({ onBack, onOpenEssay, essayHref }) => html`
  <main id="main-content" className="archive-canvas archive-nowhere">
    <h1
      data-route-entry-focus
      tabIndex="-1"
      className="archive-nowhere__line"
    >${NOWHERE_LINE}</h1>

    <div className="archive-nowhere__actions">
      ${essayHref && html`
        <a
          href=${essayHref}
          className="archive-nowhere__link"
          onClick=${(event) => {
            if (!onOpenEssay) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onOpenEssay();
          }}
        >Read the essay</a>
      `}
      ${onBack && html`
        <button
          type="button"
          onClick=${onBack}
          className="archive-nowhere__link"
        >Return to the archive</button>
      `}
    </div>
  </main>
`;

export default NowherePage;
