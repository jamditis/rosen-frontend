import { html } from '../html.js?v=3.7.9';
import { Compass, ExternalLink, Sparkles } from 'lucide-react';
import StartHerePage, { SelectedFindings } from '../components/StartHerePage.js?v=3.7.9';

const DesktopStartPanel = ({
  mode = 'start',
  records = [],
  dataStatus = null,
  onNavigate,
  onSelectRecord,
  onOpenBugReport,
  onOpenStandard,
}) => {
  const findingsOnly = mode === 'findings';
  const PanelIcon = findingsOnly ? Sparkles : Compass;

  return html`
    <div className="desktop-guided-panel">
      <div className="desktop-adapter-toolbar">
        <span>
          <${PanelIcon} aria-hidden="true" />
          ${findingsOnly ? 'Curated entry points' : 'Visitor guide'}
        </span>
        <button type="button" onClick=${onOpenStandard}>
          <${ExternalLink} aria-hidden="true" />
          ${findingsOnly ? 'Open standard Start here' : 'Open standard view'}
        </button>
      </div>

      ${dataStatus}

      ${findingsOnly ? html`
        <div className="desktop-findings-content">
          <${SelectedFindings}
            records=${records}
            onSelectRecord=${onSelectRecord}
            onBrowseArchive=${() => onNavigate?.('archive')}
          />
        </div>
      ` : html`
        <${StartHerePage}
          embedded=${true}
          records=${records}
          onNavigate=${onNavigate}
          onOpenBugReport=${onOpenBugReport}
          onSelectRecord=${onSelectRecord}
        />
      `}
    </div>
  `;
};

export default DesktopStartPanel;
