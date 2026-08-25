import { html } from '../html.js?v=3.8.30';
import AnalyticsDashboard from '../components/AnalyticsDashboard.js?v=3.8.30';

const DesktopAnalyticsPanel = ({ onRecordResults, onOpenStandard }) => html`
  <div className="desktop-analytics-panel archive-density--compact">
    <header className="desktop-archive-heading">
      <div>
        <p className="desktop-eyebrow">Collection patterns</p>
        <h3>Archive analytics</h3>
        <p>
          Inspect the maintained aggregate data now. The larger query database still loads only when you choose to run a query.
        </p>
      </div>
      <button type="button" className="desktop-standard-link archive-action archive-action--secondary" onClick=${onOpenStandard}>
        Open standard view
      </button>
    </header>
    <div className="desktop-canonical-surface">
      <${AnalyticsDashboard}
        embedded=${true}
        onRecordResults=${onRecordResults}
      />
    </div>
  </div>
`;

export default DesktopAnalyticsPanel;
