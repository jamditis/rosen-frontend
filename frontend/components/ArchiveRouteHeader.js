import { html } from '../html.js?v=3.8.18';
import { ArrowLeft, Newspaper } from 'lucide-react';

const ArchiveRouteHeader = ({ onBack, sectionTitle }) => html`
  <header className="archive-route-header sticky top-0 z-50">
    <nav className="archive-route-header__nav container mx-auto flex items-center gap-3 px-4" aria-label="Archive context">
      <button
        type="button"
        onClick=${onBack}
        className="archive-route-header__brand"
        aria-label="Jay Rosen's Internet Archive, back to archive"
      >
        <span className="archive-route-header__mark" aria-hidden="true">
          <${Newspaper} className="h-5 w-5" />
        </span>
        <span className="archive-route-header__name">Jay Rosen's Internet Archive</span>
        <span className="archive-route-header__initials" aria-hidden="true">JRIA</span>
      </button>

      <span className="archive-route-header__rule" aria-hidden="true"></span>
      <span className="archive-route-header__section" aria-current="page">${sectionTitle}</span>

      <button
        type="button"
        onClick=${onBack}
        className="archive-action archive-action--quiet archive-route-header__back"
      >
        <${ArrowLeft} className="h-4 w-4" aria-hidden="true" />
        <span>Back to archive</span>
      </button>
    </nav>
  </header>
`;

export default ArchiveRouteHeader;
