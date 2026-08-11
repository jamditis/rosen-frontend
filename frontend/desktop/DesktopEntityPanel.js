import { html } from '../html.js?v=3.8.20';
import EntityBrowser from '../components/EntityBrowser.js?v=3.8.20';

const DesktopEntityPanel = ({
  records,
  queryActive,
  onClearQuery,
  dataStatus = null,
  onSelectRecord,
  selectedEntityId,
  onSelectEntity,
  autoFocusSelection,
  onOpenStandard,
}) => html`
  <div className="desktop-entity-panel archive-density--compact">
    <header className="desktop-archive-heading">
      <div>
        <p className="desktop-eyebrow">People and ideas</p>
        <h3>Trace the archive's relationships</h3>
        <p>
          Explore the canonical entity index, then open any connected record without leaving the desktop.
        </p>
      </div>
      <button type="button" className="desktop-standard-link archive-action archive-action--secondary" onClick=${onOpenStandard}>
        Open standard view
      </button>
    </header>
    ${dataStatus}
    <div className="desktop-entity-browser">
      <${EntityBrowser}
        records=${records}
        queryActive=${queryActive}
        onClearQuery=${onClearQuery}
        onSelectRecord=${onSelectRecord}
        selectedEntityId=${selectedEntityId}
        onSelectEntity=${onSelectEntity}
        embedded=${true}
        autoFocusSelection=${autoFocusSelection}
      />
    </div>
  </div>
`;

export default DesktopEntityPanel;
