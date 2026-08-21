import { html } from '../html.js?v=3.8.24';
import DissertationPage from '../components/DissertationPage.js?v=3.8.24';
import { resolveSitePath } from '../utils/pathResolver.js?v=3.8.24';

const DesktopDissertationPanel = ({ onOpenStandard }) => html`
  <div className="desktop-dissertation-panel archive-density--compact">
    <header className="desktop-archive-heading">
      <div>
        <p className="desktop-eyebrow">Dissertation map</p>
        <h3>The Impossible Press</h3>
        <p>
          Follow the dissertation's real section map, open its source notes, and move through the same argument as the standard view.
        </p>
      </div>
      <div className="desktop-heading-actions">
        <a className="desktop-secondary-link archive-action archive-action--secondary" href=${resolveSitePath('dissertation/reader/')}>
          Read full text
        </a>
        <button type="button" className="desktop-standard-link archive-action archive-action--secondary" onClick=${onOpenStandard}>
          Open standard view
        </button>
      </div>
    </header>
    <div className="desktop-canonical-surface">
      <${DissertationPage} embedded=${true} />
    </div>
  </div>
`;

export default DesktopDissertationPanel;
