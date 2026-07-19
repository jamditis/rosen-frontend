import { html } from '../html.js?v=3.7.7';
import EntityBrowser from '../components/EntityBrowser.js?v=3.7.7';

const DesktopEntityPanel = ({
  records,
  queryActive,
  dataStatus = null,
  onSelectRecord,
  selectedEntityId,
  onSelectEntity,
  autoFocusSelection,
  onOpenStandard,
}) => html`
  <div className="desktop-entity-panel">
    <header className="desktop-archive-heading">
      <div>
        <p className="desktop-eyebrow">People and ideas</p>
        <h3>Trace the archive's relationships</h3>
        <p>
          Explore the canonical entity index, then open any connected record without leaving the desktop.
        </p>
      </div>
      <button type="button" className="desktop-standard-link" onClick=${onOpenStandard}>
        Open standard view
      </button>
    </header>
    ${dataStatus}
    <div className="desktop-entity-browser">
      <${EntityBrowser}
        records=${records}
        queryActive=${queryActive}
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
