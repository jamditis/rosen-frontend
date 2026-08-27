/**
 * Opt-in semantic search toggle and the hybrid ranking it feeds (#279).
 *
 * App.js cannot be imported here (it resolves esm.sh import-map specifiers the
 * node runner does not have), so its wiring is asserted from source, the same
 * way the similar-in-theme strand is checked in similar-in-theme-wiring.test.js.
 *
 * What these pin, in order of what would hurt most if it broke:
 *  - off by default, and off loads nothing;
 *  - a failed load falls back to keyword search instead of breaking search;
 *  - the two legs are fused with RRF, not concatenated;
 *  - the toggle is a real labelled control, not a bare clickable span.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');

const version = JSON.parse(read('version.json')).version;
const versionPattern = version.replaceAll('.', '\\.');
const app = read('frontend', 'App.js');
const toggle = read('frontend', 'components', 'SemanticSearchToggle.js');
const sidebar = read('frontend', 'components', 'Sidebar.js');
const results = read('frontend', 'components', 'ArchiveResults.js');
const serviceWorker = read('frontend', 'sw.js');
const css = read('frontend', 'index.css');

describe('semantic search toggle', () => {
  it('starts off, so no visit pays for the model unless it is asked for', () => {
    assert.match(app, /const \[semanticEnabled, setSemanticEnabled\] = useState\(false\)/);
    // No stored preference: the download cost must be chosen each visit.
    assert.doesNotMatch(app, /semanticEnabled[\s\S]{0,200}localStorage/);
  });

  it('loads the vectors and the model only when the reader turns it on', () => {
    assert.match(app, /warmupSemanticSearch\(\)/);
    const handler = app.slice(app.indexOf('const handleSemanticToggle'));
    assert.ok(
      handler.indexOf('if (!next)') < handler.indexOf('warmupSemanticSearch()'),
      'turning the toggle off must return before any loading starts',
    );
  });

  it('falls back to keyword search when the worker or the artifact fails', () => {
    assert.match(app, /setSemanticStatus\('error'\)/);
    assert.match(app, /setSemanticEnabled\(false\)/);
    assert.match(
      toggle,
      /Semantic search is not available right now\. Keyword search still works\./,
    );
  });

  it('fuses the lexical and semantic legs with reciprocal rank fusion', () => {
    assert.match(
      app,
      new RegExp(`from './utils/rrf\\.js\\?v=${versionPattern}'`),
    );
    assert.match(app, /reciprocalRankFusion\(\{\s*\[LABEL_LEXICAL\]: lexicalOrder,\s*\[LABEL_SEMANTIC\]: semantic,\s*\}\)/);
    assert.match(app, /chipFor\(hit\.sources\)/);
  });

  it('lets a semantic-only match into the results', () => {
    assert.match(app, /\|\| semanticIds\.has\(r\.id\)/);
  });

  it('orders results by fused rank under a relevance sort', () => {
    assert.match(app, /const RELEVANCE_SORT = 'relevance'/);
    assert.match(app, /if \(sortBy === RELEVANCE_SORT\)/);
    assert.match(app, /fusedRanks\.get\(a\.record\.id\) \?\? Infinity/);
    // Relevance stays out of RECORD_SORTS: every key there needs a comparator
    // in recordSort.js, and the site-tools schema reads that list.
    const recordSort = read('frontend', 'utils', 'recordSort.js');
    assert.doesNotMatch(recordSort, /relevance/);
  });

  it('debounces the encode so one query is encoded per settled phrase', () => {
    assert.match(app, /SEMANTIC_QUERY_DEBOUNCE_MS/);
    assert.match(app, /clearTimeout\(timer\);\s*controller\.abort\(\);/);
  });

  it('badges each result with its provenance chip', () => {
    assert.match(results, /searchSignals\?\.get\(item\.id\)/);
    assert.match(results, /archive-record-card__label--signal/);
    assert.match(css, /\.archive-record-card__label--signal/);
    // Chips appear only when both legs can contribute.
    assert.match(app, /semantic\.length > 0/);
  });

  it('offers the control beside both archive search boxes', () => {
    assert.match(app, /<\$\{SemanticSearchToggle\}/);
    assert.match(sidebar, /<\$\{SemanticSearchToggle\}/);
    assert.match(app, /inputId="archive-mobile-semantic-search"/);
    assert.match(sidebar, /inputId=\$\{`\$\{searchInputId\}-semantic`\}/);
  });

  it('is a labelled, keyboard-operable checkbox with a described state', () => {
    assert.match(toggle, /<label className="archive-semantic-toggle__control" htmlFor=\$\{inputId\}>/);
    assert.match(toggle, /type="checkbox"/);
    assert.match(toggle, /aria-describedby=\$\{hintId\}/);
    assert.match(toggle, /role="status"/);
    assert.match(css, /\.archive-semantic-toggle__control/);
  });

  it('says what turning it on costs, and what it covers', () => {
    assert.match(toggle, /Downloads a language model \(about 30 MB\) the first time\./);
    assert.match(toggle, /Ranking \$\{covered\} articles by meaning/);
  });

  it('ships the toggle, the client, and the worker on one release', () => {
    for (const file of [
      'components/SemanticSearchToggle.js',
      'services/semanticSearch.js',
      'services/semantic-search-worker.js',
      'services/embeddings-worker.js',
      'utils/rrf.js',
    ]) {
      assert.ok(
        serviceWorker.includes(`'${file}'`),
        `frontend/sw.js must cache ${file} with the app shell`,
      );
    }
    const client = read('frontend', 'services', 'semanticSearch.js');
    assert.match(
      client,
      new RegExp(`'\\./semantic-search-worker\\.js\\?v=${versionPattern}'`),
    );
    const worker = read('frontend', 'services', 'semantic-search-worker.js');
    assert.match(
      worker,
      new RegExp(`'\\./embeddings-worker\\.js\\?v=${versionPattern}'`),
    );
  });
});
