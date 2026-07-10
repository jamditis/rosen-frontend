/**
 * QueryBuilder archive integration tests (#135)
 *
 * Record-returning queries feed the archive's existing filtered record path.
 * Aggregate queries still render their tabular analytics because they do not
 * identify records. These checks cover the component wiring plus the pure
 * facet derivation used by the query-scoped archive.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as queryComposition from '../frontend/services/queryComposition.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const readSrc = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

const queryBuilderSrc = readSrc('frontend', 'components', 'QueryBuilder.js');
const analyticsSrc = readSrc('frontend', 'components', 'AnalyticsDashboard.js');
const appSrc = readSrc('frontend', 'App.js');
const entityBrowserSrc = readSrc('frontend', 'components', 'EntityBrowser.js');
const serviceWorkerSrc = readSrc('frontend', 'sw.js');

function templateBlock(id) {
  const start = queryBuilderSrc.indexOf(`id: '${id}'`);
  assert.notEqual(start, -1, `QueryBuilder template ${id} is missing`);
  const next = queryBuilderSrc.indexOf("\n  {\n    id: '", start + 1);
  return queryBuilderSrc.slice(start, next === -1 ? queryBuilderSrc.indexOf('\n];', start) : next);
}

describe('QueryBuilder record templates', () => {
  const recordTemplates = [
    ['search-titles', /SELECT\s+id,/],
    ['records-by-year', /SELECT\s+id,/],
    ['records-by-era', /SELECT\s+id,/],
    ['records-by-category', /SELECT\s+(?:DISTINCT\s+)?r\.id,/],
    ['records-mentioning-person', /SELECT\s+DISTINCT\s+r\.id,/],
  ];

  for (const [id, idSelect] of recordTemplates) {
    it(`${id} declares composability and returns record ids`, () => {
      const block = templateBlock(id);
      assert.match(block, /composable:\s*true/);
      assert.match(block, idSelect);
    });
  }

  it('marks aggregate templates as non-composable', () => {
    for (const id of [
      'count-by-field',
      'top-categories',
      'top-publications',
      'top-people',
      'top-concepts',
      'yearly-output',
      'compare-eras',
      'category-cooccurrence',
    ]) {
      assert.match(templateBlock(id), /composable:\s*false/, `${id} must stay tabular`);
    }
  });

  it('derives era options and SQL ordering from frontend constants', () => {
    assert.match(
      queryBuilderSrc,
      /import\s*\{\s*ERAS\s*\}\s*from\s*['"]\.\.\/constants\.js\?v=\d+\.\d+\.\d+['"]/
    );
    assert.match(queryBuilderSrc, /options:\s*ERAS\.map\(/);
    assert.match(queryBuilderSrc, /const\s+eraOrderCase\s*=\s*ERAS\s*\.map\(/);
  });
});

describe('QueryBuilder shared archive path', () => {
  it('sends record rows to App instead of the disconnected results table', () => {
    assert.match(
      queryBuilderSrc,
      /const\s+QueryBuilder\s*=\s*\(\{\s*onRecordResults\s*\}\)\s*=>/
    );
    assert.match(
      queryBuilderSrc,
      /if\s*\(templateIsComposable\(selectedTemplate\)\)\s*\{[\s\S]*?onRecordResults\(extractRecordIds\(queryResults\)\)[\s\S]*?return;/
    );
  });

  it('wires query results into the existing archive card and RecordView flow', () => {
    assert.match(
      analyticsSrc,
      /<\$\{QueryBuilder\}\s+onRecordResults=\$\{onRecordResults\}\s*\/>/
    );
    assert.match(
      appSrc,
      /const\s+handleQueryResults\s*=\s*useCallback\(\(recordIds\)\s*=>\s*\{[\s\S]*?setFilters\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*recordIds\s*\}\)\)[\s\S]*?navigateTo\(ROUTES\.archive\)/
    );
    assert.match(
      appSrc,
      /<\$\{AnalyticsDashboard\}[\s\S]*?onRecordResults=\$\{handleQueryResults\}/
    );
    assert.match(appSrc, /const\s+paginatedRecords\s*=\s*filteredRecords\.slice\(/);
    assert.match(appSrc, /paginatedRecords\.map\([\s\S]*?onClick=\$\{\(\)\s*=>\s*selectRecord\(item\.id\)\}/);
    assert.match(
      appSrc,
      /<\$\{RecordView\}[\s\S]*?filteredRecords=\$\{filteredRecords\}[\s\S]*?selectedRecordId=\$\{selectedRecordId\}/
    );
    assert.match(appSrc, /setRecordParam\(url\.searchParams,\s*selectedRecordId\)/);
  });

  it('mounts the timeline for active record-query results', () => {
    const timelineStart = appSrc.indexOf('<${Timeline}');
    assert.notEqual(timelineStart, -1, 'App.js must render Timeline');

    const guardStart = appSrc.lastIndexOf('${', timelineStart);
    const timelineGuard = appSrc.slice(guardStart, timelineStart);
    assert.doesNotMatch(
      timelineGuard,
      /filters\.recordIds\s*===\s*null/,
      'Timeline must not exclude an active record query'
    );
    assert.match(
      appSrc.slice(timelineStart, appSrc.indexOf('/>', timelineStart) + 2),
      /records=\$\{queryRecords\}/,
      'Timeline must receive the query-scoped records'
    );
  });
});

describe('query-scoped facets', () => {
  it('keeps only facet values present in the queried records', () => {
    assert.equal(
      typeof queryComposition.deriveFacetsForRecords,
      'function',
      'queryComposition must export deriveFacetsForRecords'
    );
    if (typeof queryComposition.deriveFacetsForRecords !== 'function') return;

    const facets = {
      categories: ['Accountability', 'Press criticism', 'Trust'],
      eras: ['Public Journalism (90s)', 'Democracy in Crisis (20s)'],
      publications: ['Columbia Journalism Review', 'PressThink'],
    };
    const queriedRecords = [
      {
        id: 'RECORD-1',
        categories: ['Trust', 'Accountability'],
        era: 'Democracy in Crisis (20s)',
        pub: 'PressThink',
      },
    ];

    assert.deepStrictEqual(
      queryComposition.deriveFacetsForRecords(facets, queriedRecords),
      {
        categories: ['Accountability', 'Trust'],
        eras: ['Democracy in Crisis (20s)'],
        publications: ['PressThink'],
      }
    );
  });

  it('retains active category and era values outside the query results', () => {
    const facets = {
      categories: ['Accountability', 'Press criticism', 'Trust'],
      eras: ['Public Journalism (90s)', 'Democracy in Crisis (20s)'],
      publications: ['Columbia Journalism Review', 'PressThink'],
    };
    const queriedRecords = [
      {
        id: 'RECORD-1',
        categories: ['Trust'],
        era: 'Democracy in Crisis (20s)',
        pub: 'PressThink',
      },
    ];

    assert.deepStrictEqual(
      queryComposition.deriveFacetsForRecords(facets, queriedRecords, {
        categories: ['Press criticism'],
        era: 'Public Journalism (90s)',
      }),
      {
        categories: ['Press criticism', 'Trust'],
        eras: ['Public Journalism (90s)', 'Democracy in Crisis (20s)'],
        publications: ['PressThink'],
      }
    );
    assert.match(
      appSrc,
      /deriveFacetsForRecords\(facets,\s*queryRecords,\s*filters\)/,
      'App must retain active filters when deriving query facets'
    );
  });
});

describe('query-scoped entities', () => {
  it('uses query-derived entities for the list, counts, records, and co-occurrence', () => {
    assert.match(
      entityBrowserSrc,
      /getEntityScope\(entities,\s*recordEntityMap,\s*records,\s*queryActive\)/,
      'EntityBrowser must derive its visible entities only for an active query'
    );
    assert.match(
      entityBrowserSrc,
      /scopedEntities\.forEach\(e\s*=>\s*\{[\s\S]*?counts\[e\.type\]/,
      'type counts must use the query-scoped entity list'
    );
    assert.match(
      entityBrowserSrc,
      /queryActive\s*\?\s*\(recordIdsByEntity\.get\(entity\.id\)\s*\|\|\s*\[\]\)\s*:\s*getRecordsByEntity\(entity\.id\)/,
      'record and co-occurrence lookups must use query-scoped record ids'
    );
    assert.match(
      appSrc,
      /<\$\{EntityBrowser\}[\s\S]*?queryActive=\$\{filters\.recordIds\s*!==\s*null\}/,
      'App must tell EntityBrowser whether a query scope is active'
    );
  });
});

describe('query composition deployment', () => {
  it('pre-caches the shared query module for local and deployed paths', () => {
    assert.match(serviceWorkerSrc, /['"]\/frontend\/services\/queryComposition\.js['"]/);
    assert.match(
      serviceWorkerSrc,
      /`\$\{BASE_PATH\}\/frontend\/services\/queryComposition\.js`/
    );
  });
});
