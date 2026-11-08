/**
 * View-state and small lifecycle fixes from the 2026-11-08 state machine map
 * (docs/research/2026-11-08-state-machine-map.md, follow-up items 8, 19, 20,
 * and 26).
 *
 * App.js, RecordModal.js, and DesktopShell.js resolve esm.sh import-map
 * specifiers that the node runner does not have, so they cannot be imported
 * here. Pure decisions live in frontend/services/viewState.js and are tested
 * for real; the wiring that calls them is checked against the source text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
const app = read('frontend', 'App.js');

describe('one default filter object (item 26)', () => {
  it('App.js builds its defaults from viewState.defaultFilters', () => {
    assert.match(
      app,
      /import \{[^}]*\bdefaultFilters\b[^}]*\} from '\.\/services\/viewState\.js\?v=/,
      'App.js must import the shared defaultFilters factory',
    );
    assert.match(app, /\.\.\.defaultFilters\(\),\s*recordIds: null/);
  });

  it('App.js does not restate the URL filter fields in a second literal', () => {
    assert.doesNotMatch(app, /const DEFAULT_FILTERS = \{/);
    assert.doesNotMatch(app, /^\s+search: '',\n\s+categories: \[\],/m);
  });
});

describe('record modal close timer (item 19)', () => {
  const modal = read('frontend', 'components', 'RecordModal.js');
  const beginClose = modal.slice(
    modal.indexOf('const beginClose'),
    modal.indexOf('const handleClose'),
  );

  it('keeps the 180 ms close timer in a ref so it can be cancelled', () => {
    assert.match(beginClose, /closeTimerRef\.current = setTimeout\(/);
    assert.doesNotMatch(beginClose, /^\s+setTimeout\(\(\) => completeClose/m);
  });

  it('cancels the pending close when the record changes or the modal unmounts', () => {
    // Scenario: the reader closes the modal and opens another card within
    // 180 ms. The old timer must not call onClose on the new record.
    assert.match(
      modal,
      /useEffect\(\(\) => cancelCloseTimer, \[isOpen, record\?\.id\]\)/,
    );
    assert.match(modal, /const cancelCloseTimer = \(\) => \{[\s\S]*?clearTimeout\(closeTimerRef\.current\)/);
  });
});

describe('desktop close and minimize use the latest layout (item 20)', () => {
  const shell = read('frontend', 'desktop', 'DesktopShell.js');
  const body = (name) => shell.slice(
    shell.indexOf(`const ${name} = (app) => {`),
    shell.indexOf('\n  };\n', shell.indexOf(`const ${name} = (app) => {`)),
  );

  // Scenario: a drag-end position update is queued, then the reader closes a
  // window in the same tick. Writing a layout computed from the render-time
  // value drops the queued position; a functional updater applies on top.
  it('closeWindow writes the layout with a functional updater', () => {
    const close = body('closeWindow');
    assert.match(close, /setLayout\(\(current\) => closeDesktopWindow\(current, app\.id, shellAppIds\)\)/);
    assert.doesNotMatch(close, /setLayout\(nextLayout\)/);
  });

  it('minimizeWindow writes the layout with a functional updater', () => {
    const minimize = body('minimizeWindow');
    assert.match(minimize, /setLayout\(\(current\) => minimizeDesktopWindow\(current, app\.id, shellAppIds\)\)/);
    assert.doesNotMatch(minimize, /setLayout\(nextLayout\)/);
  });
});

describe('Back keeps the standard archive filters (item 8)', async () => {
  const { filtersForHistoryEntry } = await import('../frontend/services/viewState.js');
  const BASE = 'https://pressthink.org/j/rosen-archive/';
  const RECORD_APPS = new Set(['archive', 'folders', 'entities', 'start', 'findings']);

  it('keeps the live filters when Back lands on a standard route', () => {
    // The standard archive never writes its filters to the URL, so its history
    // entries carry none. Restoring from them would clear the reader's search.
    assert.equal(filtersForHistoryEntry(BASE, RECORD_APPS), null);
    assert.equal(filtersForHistoryEntry(`${BASE}#folders`, RECORD_APPS), null);
    assert.equal(filtersForHistoryEntry(`${BASE}#about`, RECORD_APPS), null);
    assert.equal(filtersForHistoryEntry(`${BASE}?record=RECORD-00001`, RECORD_APPS), null);
  });

  it('keeps the live filters on desktop windows that do not write them', () => {
    assert.equal(filtersForHistoryEntry(`${BASE}#desktop`, RECORD_APPS), null);
    assert.equal(filtersForHistoryEntry(`${BASE}#desktop/tools`, RECORD_APPS), null);
  });

  it('restores the query-backed filters of a desktop record window', () => {
    const restored = filtersForHistoryEntry(
      `${BASE}?q=view+from+nowhere&cat=Press+%26+Media+Criticism#desktop/archive`,
      RECORD_APPS,
    );
    assert.equal(restored.search, 'view from nowhere');
    assert.deepEqual(restored.categories, ['Press & Media Criticism']);
    // An empty desktop query is still a recorded state: clear what is live.
    assert.equal(filtersForHistoryEntry(`${BASE}#desktop/folders`, RECORD_APPS).search, '');
  });

  it('App.js restores filters on popstate only when the entry carries them', () => {
    const popstate = app.slice(app.indexOf("event?.type === 'popstate'"));
    const branch = popstate.slice(0, popstate.indexOf('const recordId = getRecordIdFromUrl()'));
    assert.match(branch, /filtersForHistoryEntry\(window\.location\.href, DESKTOP_RECORD_APPS\)/);
    assert.match(branch, /if \(historicalFilters\) \{\s*setFilters\(\{/);
  });
});
