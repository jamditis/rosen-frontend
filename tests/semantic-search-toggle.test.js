/**
 * How the semantic toggle is wired into the app shell (#279).
 *
 * App.js cannot be imported here (it resolves esm.sh import-map specifiers the
 * node runner does not have), so this file is limited to what source text can
 * honestly show: which module owns a decision, which files ship together, and
 * the markup of the control.
 *
 * The behavior itself is tested for real elsewhere, and that is where a change
 * in behavior should fail:
 *  - tests/search-ranking.test.js: fusion, chips, fused ordering, and the sort
 *    key the toggle selects;
 *  - tests/semantic-search-worker.test.js: encoding, ranking, worker protocol;
 *  - tests/semantic-search-score-floor.test.js: the score floor on real vectors;
 *  - tests/semantic-search-client.test.js: aborts, timeouts, worker lifecycle;
 *  - tests/semantic-search-csp.test.js: the deployed policy allows the model.
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
const help = read('frontend', 'components', 'SemanticSearchHelpDialog.js');
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

  it('drops the worker and its model when the reader turns it off', () => {
    assert.match(app, /terminateSemanticSearch\(\)/);
    const handler = app.slice(app.indexOf('const handleSemanticToggle'));
    assert.ok(
      handler.indexOf('terminateSemanticSearch()') < handler.indexOf('warmupSemanticSearch()'),
      'the off branch must release the worker',
    );
  });

  it('falls back to keyword search when the worker or the artifact fails', () => {
    assert.match(app, /setSemanticStatus\('error'\)/);
    assert.match(app, /setSemanticEnabled\(false\)/);
    assert.match(
      toggle,
      /Search by meaning is not available right now\. Search by words still works\./,
    );
  });

  it('keeps the ranking and the sort key in one tested module', () => {
    assert.match(
      app,
      new RegExp(`from './utils/searchRanking\\.js\\?v=${versionPattern}'`),
    );
    // The decisions are imported, not reimplemented inline, so the behavioral
    // tests cover what the app actually runs.
    for (const call of [
      'buildSearchRanking({ lexicalOrder, semanticOrder })',
      'orderByFusedRank(sortRecords(res, DEFAULT_SORT), fusedRanks)',
      'sortForSemanticToggle(prev,',
      'sortForQueryChange(prev,',
    ]) {
      assert.ok(app.includes(call), `App.js must call ${call}`);
    }
    // Relevance stays out of RECORD_SORTS: every key there needs a comparator
    // in recordSort.js, and the site-tools schema reads that list.
    assert.doesNotMatch(read('frontend', 'utils', 'recordSort.js'), /relevance/);
  });

  it('lets a semantic-only match into the results', () => {
    assert.match(app, /\|\| semanticIds\.has\(r\.id\)/);
  });

  it('badges every result while chips are on', () => {
    assert.match(results, /searchSignals\.get\(item\.id\) \|\| LEXICAL_SIGNAL/);
    assert.match(results, /presentSearchSignal\(signal\)/);
    assert.match(results, /archive-record-card__label--signal/);
    assert.match(css, /\.archive-record-card__label--signal/);
  });

  it('uses plain-language result labels', () => {
    for (const label of ['Matching words', 'Related meaning', 'Words and meaning']) {
      assert.match(read('frontend', 'utils', 'searchRanking.js'), new RegExp(label));
    }
    assert.doesNotMatch(results, />\s*\$\{signal\}\s*</);
    assert.doesNotMatch(toggle, /Results are marked kw, sem, or kw·sem/);
  });

  it('debounces the encode so one query is encoded per settled phrase', () => {
    assert.match(app, /SEMANTIC_QUERY_DEBOUNCE_MS/);
    assert.match(app, /clearTimeout\(timer\);\s*controller\.abort\(\);/);
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
    assert.match(css, /\.archive-semantic-toggle__control/);
    assert.match(toggle, /<span>Search by meaning<\/span>/);
  });

  it('announces a state change once, not once per copy of the toggle', () => {
    // Both copies can be in the accessibility tree at the same time (the filter
    // drawer over the mobile search box), so the live region belongs to neither.
    assert.doesNotMatch(toggle, /role="status"/);
    assert.match(app, /data-semantic-status/);
    assert.equal(app.match(/data-semantic-status/g).length, 1);
    assert.match(app, /semanticStatusMessage\(semanticSearchProps\)/);
  });

  it('says what turning it on costs, and what it covers', () => {
    assert.match(toggle, /Downloads about 50 MB the first time\./);
    assert.match(toggle, /Searching \$\{covered\} records by meaning/);
  });

  it('opens a plain-language explanation without enabling search', () => {
    assert.match(toggle, /How does this work\?/);
    assert.match(toggle, /SemanticSearchHelpDialog/);
    assert.match(help, /<dialog/);
    assert.match(help, /createPortal\(dialog, document\.body\)/);
    assert.match(css, /\.archive-semantic-help__close\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;/s);
    assert.match(help, /The model does not write or answer anything/);
    assert.match(help, /for \$\{covered\} archive records\./);
    assert.match(help, /Your search stays in this browser/);
    assert.match(help, /Matching words/);
    assert.match(help, /Related meaning/);
    assert.match(help, /Words and meaning/);
    assert.doesNotMatch(help, /\bkw\b|\bsem\b|kw·sem/);
  });

  it('ships the toggle, the client, and the worker on one release', () => {
    for (const file of [
      'components/SemanticSearchToggle.js',
      'components/SemanticSearchHelpDialog.js',
      'services/semanticSearch.js',
      'services/semantic-search-worker.js',
      'services/embeddings-worker.js',
      'utils/rrf.js',
      'utils/searchRanking.js',
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
    assert.match(
      worker,
      new RegExp(`archive-social-embeddings\\.bin\\?v=${versionPattern}`),
    );
    assert.match(
      worker,
      new RegExp(`archive-social-embeddings\\.json\\?v=${versionPattern}`),
    );
    assert.match(
      read('frontend', 'utils', 'searchRanking.js'),
      new RegExp(`'\\./rrf\\.js\\?v=${versionPattern}'`),
    );
  });
});
