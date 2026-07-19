/**
 * Analytics aggregates parity + lazy-load wiring tests (#338)
 *
 * The Analytics dashboard renders its six charts from a prebuilt
 * data/archive-analytics.json instead of loading the ~28MB source into
 * in-browser SQLite. The parity test runs computeAnalytics for real (sql.js,
 * Node) and locks the committed artifact to its source data. The wiring tests
 * are source-text checks — the runtime behaviour lives in browser-only React
 * components, so a static check guards the regression without a jsdom harness
 * (same approach as fetch-error-handling.test.js).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAnalytics } from '../data/compute-analytics.js';
import { ERAS } from '../data/eras.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const readSrc = (...p) => fs.readFileSync(path.join(rootDir, ...p), 'utf-8');

describe('analytics aggregates artifact (#338)', () => {
  it('archive-analytics.json matches computeAnalytics(archive-data.json)', async () => {
    const data = JSON.parse(readSrc('data', 'archive-data.json'));
    const committed = JSON.parse(readSrc('data', 'archive-analytics.json'));
    const computed = await computeAnalytics(data);
    assert.deepEqual(
      committed,
      computed,
      'data/archive-analytics.json is stale — regenerate with `node data/export-archive-data.js`'
    );
  });

  it('has the four stat counts the dashboard reads', () => {
    const a = JSON.parse(readSrc('data', 'archive-analytics.json'));
    for (const key of ['records', 'categories', 'concepts', 'entities']) {
      assert.equal(typeof a.stats[key], 'number', `stats.${key} must be a number`);
      assert.ok(a.stats[key] > 0, `stats.${key} should be > 0`);
    }
  });

  it('orders byEra by the canonical taxonomy with nothing in the ELSE bucket (#385)', () => {
    const a = JSON.parse(readSrc('data', 'archive-analytics.json'));
    const eras = a.byEra.map((r) => r.era);
    // Every shipped era must be a known canonical era. An era missing from
    // data/eras.js sorts into the catch-all ELSE bucket and renders unordered.
    // That is the #385 regression, where a stale 4-value list dropped 6 of 8
    // eras into the bucket.
    for (const era of eras) {
      assert.ok(
        ERAS.includes(era),
        `byEra has "${era}", absent from the canonical data/eras.js taxonomy; it falls into the unordered ELSE bucket`
      );
    }
    // byEra must follow the canonical data/eras.js sequence (limited to eras
    // actually present), so the chart order can never drift from the taxonomy.
    assert.deepEqual(
      eras,
      ERAS.filter((era) => eras.includes(era)),
      'byEra is not in canonical data/eras.js order'
    );
  });

  it('caps the top-N charts at 10 rows (matches dashboard limits)', () => {
    const a = JSON.parse(readSrc('data', 'archive-analytics.json'));
    assert.ok(a.topPeople.length <= 10, 'topPeople must be <= 10');
    assert.ok(a.topConcepts.length <= 10, 'topConcepts must be <= 10');
    assert.ok(a.coOccurrence.length <= 10, 'coOccurrence must be <= 10');
  });

  it('chart rows carry the keys the dashboard renders', () => {
    const a = JSON.parse(readSrc('data', 'archive-analytics.json'));
    assert.deepEqual(Object.keys(a.byYear[0]).sort(), ['count', 'year']);
    assert.deepEqual(Object.keys(a.byCategory[0]).sort(), ['category', 'count']);
    assert.deepEqual(Object.keys(a.byEra[0]).sort(), ['count', 'era']);
    assert.deepEqual(Object.keys(a.topPeople[0]).sort(), ['mentions', 'name', 'type']);
    assert.deepEqual(Object.keys(a.topConcepts[0]).sort(), ['concept', 'count']);
    assert.deepEqual(Object.keys(a.coOccurrence[0]).sort(), ['category1', 'category2', 'co_occurrences']);
  });

  it('payload stays tiny (well under the multi-MB source data)', () => {
    const bytes = fs.statSync(path.join(rootDir, 'data', 'archive-analytics.json')).size;
    assert.ok(bytes < 50 * 1024, `archive-analytics.json should be < 50KB, was ${bytes} bytes`);
  });
});

describe('analytics lazy-load wiring (#338)', () => {
  it('AnalyticsDashboard renders from fetchAnalytics, not live SQLite, on mount', () => {
    const src = readSrc('frontend', 'components', 'AnalyticsDashboard.js');
    assert.match(src, /fetchAnalytics\s*\(/, 'dashboard must call fetchAnalytics()');
    assert.doesNotMatch(src, /getSqliteStats\s*\(/, 'dashboard must not call getSqliteStats on mount');
    assert.doesNotMatch(src, /getRecordCountByYear\s*\(/, 'dashboard must not run the live year query on mount');
  });

  it('raw SQL box lazy-inits SQLite on first run', () => {
    const src = readSrc('frontend', 'components', 'AnalyticsDashboard.js');
    const fnIdx = src.indexOf('const runCustomQuery');
    assert.ok(fnIdx >= 0, 'expected runCustomQuery');
    const body = src.slice(fnIdx, fnIdx + 900);
    assert.match(body, /isSqliteReady\s*\(/, 'runCustomQuery must check isSqliteReady');
    assert.match(body, /await\s+initSqlite\s*\(/, 'runCustomQuery must await initSqlite when not ready');
  });

  it('QueryBuilder lazy-inits SQLite instead of erroring when not ready', () => {
    const src = readSrc('frontend', 'components', 'QueryBuilder.js');
    const fnIdx = src.indexOf('const runQuery');
    assert.ok(fnIdx >= 0, 'expected runQuery');
    const body = src.slice(fnIdx, fnIdx + 900);
    assert.match(body, /await\s+initSqlite\s*\(/, 'runQuery must await initSqlite');
    assert.doesNotMatch(body, /Database is not ready\. Please wait/, 'the old not-ready bail-out must be gone');
  });

  it('initSqlite is memoised against concurrent first loads', () => {
    const src = readSrc('frontend', 'services', 'archiveService.js');
    assert.match(src, /let\s+sqliteInitPromise\s*=\s*null/, 'expected the sqliteInitPromise memo');
    const fnIdx = src.indexOf('export const initSqlite');
    const body = src.slice(fnIdx, fnIdx + 300);
    assert.match(
      body,
      /if\s*\(\s*sqliteInitPromise\s*\)\s*return\s+sqliteInitPromise/,
      'initSqlite must return the in-flight promise when one exists'
    );
  });

  it('fetchAnalytics throws on a failed response (no silent fallback)', () => {
    const src = readSrc('frontend', 'services', 'archiveService.js');
    const fnIdx = src.indexOf('export const fetchAnalytics');
    assert.ok(fnIdx >= 0, 'expected fetchAnalytics export');
    const bodyEnd = src.indexOf('\nexport ', fnIdx + 1);
    const body = src.slice(fnIdx, bodyEnd >= 0 ? bodyEnd : fnIdx + 1500);
    assert.match(body, /if\s*\(\s*!response\.ok\s*\)/, 'fetchAnalytics must check response.ok');
    assert.match(body, /throw new Error/, 'fetchAnalytics must throw on a failed fetch');
  });

  it('App.js skips the core fetch on cold non-record deep links', () => {
    const src = readSrc('frontend', 'App.js');
    assert.match(src, /coreFetchStarted/, 'expected the coreFetchStarted ref guard');
    assert.match(src, /NON_RECORD_ROUTES\s*=\s*new Set\([\s\S]*ROUTES\.analytics/);
    assert.match(src, /NON_RECORD_ROUTES\s*=\s*new Set\([\s\S]*ROUTES\.wiki/);
    assert.match(src, /NON_RECORD_ROUTES\s*=\s*new Set\([\s\S]*ROUTES\.desktop/);
    assert.match(src, /NON_RECORD_ROUTES\.has\(currentRoute\)\s*&&\s*!desktopNeedsRecords\) return/,
      'the load effect must early-return for every non-record route');
  });

  it('constants.js defines a relative archive_analytics path', () => {
    const src = readSrc('frontend', 'constants.js');
    assert.match(
      src,
      /archive_analytics:\s*'\.\/data\/archive-analytics\.json'/,
      'archive_analytics must be a relative path — JSON fetches do not route through pathResolver'
    );
  });

  it('index.html no longer eagerly prefetches the full archive data', () => {
    const src = readSrc('index.html');
    assert.doesNotMatch(src, /prefetch[^>]*archive-data\.json/, 'the eager archive-data.json prefetch must be removed');
  });

  it('service worker caches archive-analytics.json', () => {
    assert.match(readSrc('frontend', 'sw.js'), /archive-analytics\.json/, 'sw.js DATA_URLS must include archive-analytics.json');
  });

  // archive-analytics.json is regenerated by export-archive-data.js, so EVERY
  // deploy surface that ships the other data JSON files must ship it too —
  // otherwise a record update through one path leaves the dashboard serving
  // stale analytics (the bug class Codex caught: deploy_full_site covered,
  // submission-server path was not). #590 consolidated the per-path file lists
  // into one canonical tuple, backend/submission_runtime/artifacts.py
  // DATA_DEPLOY_JSON_FILES. The two checks below guard both halves of that
  // invariant: the canonical list carries archive-analytics.json, and every
  // deploy path either imports that list or (shell / full-site) hardcodes it.
  it('the canonical deploy artifact list ships archive-analytics.json alongside the core data files', () => {
    const src = readSrc('backend', 'submission_runtime', 'artifacts.py');
    assert.match(src, /DATA_DEPLOY_JSON_FILES/, 'artifacts.py must define DATA_DEPLOY_JSON_FILES');
    assert.match(src, /archive-core\.json/, 'DATA_DEPLOY_JSON_FILES should list the core data file');
    assert.match(
      src,
      /archive-analytics\.json/,
      'DATA_DEPLOY_JSON_FILES is missing archive-analytics.json — every importing deploy path would serve stale analytics after a deploy'
    );
  });

  it('every deploy manifest ships the canonical data set (literal list or DATA_DEPLOY_JSON_FILES)', () => {
    // Paths that still hardcode the list must contain the literals directly.
    // deploy.sh is a shell script and deploy_full_site.py predates the
    // extraction, so neither can import the Python tuple.
    const literalManifests = [
      ['backend', 'scripts', 'deploy_full_site.py'],
      ['backend', 'submission_server', 'deploy.sh'],
    ];
    for (const m of literalManifests) {
      const src = readSrc(...m);
      // Sanity: confirm this really is a data-file manifest before asserting.
      assert.match(src, /archive-core\.json/, `${m.join('/')} should list the core data file`);
      assert.match(
        src,
        /archive-analytics\.json/,
        `${m.join('/')} ships data JSON but is missing archive-analytics.json — the dashboard will serve stale analytics after a deploy through this path`
      );
    }
    // Paths that import the canonical tuple ship the full set transitively;
    // asserting the reference is what keeps them in sync with artifacts.py.
    const constantManifests = [
      ['backend', 'scripts', 'sync_sheet_to_archive.py'],
      ['backend', 'submission_server', 'processor.py'],
    ];
    for (const m of constantManifests) {
      const src = readSrc(...m);
      assert.match(
        src,
        /DATA_DEPLOY_JSON_FILES/,
        `${m.join('/')} must ship the canonical DATA_DEPLOY_JSON_FILES set (import from submission_runtime.artifacts)`
      );
    }
    // The legacy Flask sftp wrapper delegates to the runtime push, which
    // pushes DATA_DEPLOY_JSON_FILES — so the analytics file rides along.
    const wrapper = readSrc('backend', 'submission_server', 'sftp_push.py');
    assert.match(
      wrapper,
      /submission_runtime\.sftp_push/,
      'submission_server/sftp_push.py must delegate to submission_runtime.sftp_push (which ships DATA_DEPLOY_JSON_FILES)'
    );
  });

  it('export pipeline regenerates the aggregates', () => {
    const src = readSrc('data', 'export-archive-data.js');
    assert.match(src, /computeAnalytics\s*\(/, 'export-archive-data.js must call computeAnalytics');
    assert.match(src, /archive-analytics\.json/, 'export-archive-data.js must write archive-analytics.json');
  });
});
