/**
 * View Transition record-modal tests (#281)
 *
 * Covers the cross-fade added on record-modal open/close via
 * document.startViewTransition:
 *   - the withViewTransition helper feature-detects the API, flushes the React
 *     update synchronously so the "after" snapshot is the post-update DOM, and
 *     falls back to a plain update when the API is absent or throws;
 *   - App.js routes the open paths (grid card, entity browser) and the close
 *     through a single selectRecord wrapper.
 *
 * viewTransition.js imports flushSync from the bare `react-dom` specifier, which
 * the node test runner cannot resolve (it is an esm.sh import map entry), so the
 * helper is asserted structurally from source -- the same approach the perf-debug
 * suite uses for index.js. App.js is likewise read as text, not imported.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

describe('withViewTransition helper', () => {
  const src = fs.readFileSync(path.join(frontendDir, 'utils', 'viewTransition.js'), 'utf-8');

  it('feature-detects document.startViewTransition', () => {
    assert.match(src, /typeof document\.startViewTransition !== 'function'/);
  });

  it('runs the state update without a transition when reduced motion is requested', () => {
    assert.match(src, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
    assert.match(src, /if \(\s*reduceMotion\s*\|\|\s*typeof document/);
  });

  it('flushes the React update synchronously inside the transition (React 18)', () => {
    // Without flushSync the API snapshots the "after" DOM before React commits,
    // so nothing animates. flushSync forces the commit inside the callback.
    assert.match(src, /import \{ flushSync \} from 'react-dom'/);
    assert.match(src, /startViewTransition\(\(\) => flushSync\(update\)\)/);
  });

  it('falls back to a plain update when the API is absent or throws', () => {
    // Both the feature-detect guard and the catch must call update(), so an
    // unsupported browser (or a transition that throws) still changes state and
    // the modal can never get stuck behind a failed transition.
    const updateCalls = src.match(/update\(\);/g) || [];
    assert.ok(updateCalls.length >= 2, `expected >=2 fallback update() calls, found ${updateCalls.length}`);
    assert.match(src, /catch \{/);
  });
});

describe('index.html import map', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

  it('maps bare react-dom to the same 18.2.0 build as react-dom/client', () => {
    // flushSync and createRoot must come from one react-dom instance or flushSync
    // drives a different root than the one mounted. esm.sh dedupes by version, so
    // the pins must match exactly.
    assert.match(html, /"react-dom\/client":\s*"https:\/\/esm\.sh\/react-dom@18\.2\.0\/client"/);
    assert.match(html, /"react-dom":\s*"https:\/\/esm\.sh\/react-dom@18\.2\.0"/);
  });
});

describe('App.js record-modal view transition (#281)', () => {
  const src = fs.readFileSync(path.join(frontendDir, 'App.js'), 'utf-8');
  const resultsSrc = fs.readFileSync(path.join(frontendDir, 'components', 'ArchiveResults.js'), 'utf-8');
  const modalSrc = fs.readFileSync(path.join(frontendDir, 'components', 'RecordModal.js'), 'utf-8');
  const detailPanelSrc = fs.readFileSync(path.join(frontendDir, 'components', 'DetailPanel.js'), 'utf-8');
  const indexCss = fs.readFileSync(path.join(frontendDir, 'index.css'), 'utf-8');

  it('imports the versioned helper', () => {
    assert.match(src, /from '\.\/utils\/viewTransition\.js\?v=\d+\.\d+\.\d+'/);
  });

  it('defines selectRecord routing the record id through withViewTransition', () => {
    assert.match(src, /const selectRecord = useCallback\(\(id\) => \{/);
    assert.match(src, /withViewTransition\(\(\) => setSelectedRecordId\(id\)\)/);
  });

  it('opens the modal via selectRecord on a grid card click', () => {
    assert.match(src, /<\$\{ArchiveResults\}[\s\S]*?onSelectRecord=\$\{selectRecord\}/);
    assert.match(resultsSrc, /onSelectRecord\(recordId\)/);
  });

  it('routes every record-select path (entity browser, in-modal links) through selectRecord', () => {
    // Both onSelectRecord props -- the entity browser and the in-modal related
    // links -- animate; none falls back to the raw setter, so the open/select
    // paths are consistent.
    const wrapped = src.match(/onSelectRecord=\$\{selectRecord\}/g) || [];
    assert.ok(wrapped.length >= 2, `expected >=2 wrapped onSelectRecord, found ${wrapped.length}`);
    assert.doesNotMatch(src, /onSelectRecord=\$\{setSelectedRecordId\}/);
  });

  it('closes the modal via selectRecord', () => {
    assert.match(src, /onClose=\$\{\(\) => selectRecord\(null\)\}/);
  });

  it('does not retain the animated close delay under reduced motion', () => {
    assert.match(modalSrc, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
    assert.match(modalSrc, /if \(reduceMotion\) \{\s*completeClose\(afterClose\);\s*return;/);
  });

  it('finishes filter navigation after close without reactivating a background opener', () => {
    assert.match(modalSrc, /const leaveRecordFor = \(action, value\) => \{[\s\S]*?openerRef\.current = null;[\s\S]*?beginClose\(\(\) => action\(value\)\)/);
    assert.match(modalSrc, /onFilterCategory \? \(cat\) => leaveRecordFor\(onFilterCategory, cat\)/);
    assert.match(modalSrc, /onFilterSearch \? \(tag\) => leaveRecordFor\(onFilterSearch, tag\)/);
    assert.match(modalSrc, /onSelectEntity && recordEntities\.length > 0/);
    assert.match(modalSrc, /leaveRecordFor\(onSelectEntity, entity\.id\)/);
    assert.match(src, /handleRecordEntitySelect[\s\S]*navigateToDesktop\('entities', entityId\)[\s\S]*navigateTo\(ROUTES\.entities, null, entityId\)/);
  });

  it('does not let history-driven focus return undo a desktop window change', () => {
    assert.match(modalSrc, /const openerWindow = opener\?\.closest\('\.desktop-window'\)/);
    assert.match(modalSrc, /!openerWindow \|\| openerWindow\.classList\.contains\('is-active'\)/);
    assert.match(modalSrc, /opener\?\.isConnected[\s\S]*opener\.focus\(\)/);
  });

  it('disables shared record and detail-panel CSS motion at the source', () => {
    assert.match(modalSrc, /className="archive-record-dialog /);
    assert.match(detailPanelSrc, /archive-detail-panel fixed/);
    assert.match(indexCss, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(indexCss, /\.archive-record-dialog \*/);
    assert.match(indexCss, /\.archive-detail-panel/);
    assert.match(indexCss, /transition-duration:\s*0\.01ms !important/);
    assert.match(indexCss, /animation-iteration-count:\s*1 !important/);
  });
});
