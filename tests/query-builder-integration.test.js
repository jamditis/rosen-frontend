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
const archiveResultsSrc = readSrc('frontend', 'components', 'ArchiveResults.js');
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
    assert.match(
      appSrc,
      /<\$\{ArchiveResults\}[\s\S]*?paginatedRecords=\$\{paginatedRecords\}[\s\S]*?onSelectRecord=\$\{selectRecord\}/
    );
    assert.match(archiveResultsSrc, /paginatedRecords\.map\(/);
    assert.match(archiveResultsSrc, /onSelectRecord\(recordId\)/);
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

describe('QueryBuilder field-value resolution (#525)', () => {
  // Regression guard for the blank-page crash. Selecting a text template
  // (Search Titles, Records in Category, Records Mentioning Person) blanked the
  // whole archive. The template switch set selectedTemplate synchronously, but
  // the effect that repopulates fieldValues runs after render, so the render in
  // between called buildSql with the previous template's values -- missing the
  // new text field. buildSql does values.SEARCH_TERM.replace(...), and .replace
  // on undefined throws during render, unmounting the app. Resolving field values
  // against the template defaults before every buildSql call closes the gap.

  it('fills a missing declared field from its default', () => {
    assert.equal(
      typeof queryComposition.resolveFieldValues,
      'function',
      'queryComposition must export resolveFieldValues'
    );
    const searchTitles = {
      fields: { SEARCH_TERM: { default: '' }, LIMIT: { default: 20 } },
    };
    // fieldValues still holds the previous (Count Records) template's keys.
    const resolved = queryComposition.resolveFieldValues(searchTitles, { FIELD: 'year', LIMIT: 10 });
    assert.equal(resolved.SEARCH_TERM, '', 'text field falls back to its default, not undefined');
    assert.equal(resolved.LIMIT, 10, 'a value present in fieldValues is kept');
    assert.ok(!('FIELD' in resolved), 'keys not declared by the template are dropped');
  });

  it('keeps a user-entered value, including empty string and zero, over the default', () => {
    const t = { fields: { SEARCH_TERM: { default: 'fallback' }, LIMIT: { default: 20 } } };
    assert.equal(queryComposition.resolveFieldValues(t, { SEARCH_TERM: 'nixon' }).SEARCH_TERM, 'nixon');
    assert.equal(queryComposition.resolveFieldValues(t, { SEARCH_TERM: '' }).SEARCH_TERM, '');
    assert.equal(queryComposition.resolveFieldValues(t, { LIMIT: 0 }).LIMIT, 0);
  });

  it('never leaves a text field undefined, so buildSql .replace cannot throw', () => {
    // Mirrors the real Search Titles template (QueryBuilder.js): the crash was
    // values.SEARCH_TERM.replace on an undefined value.
    const buildSql = (values) =>
      `WHERE title LIKE '%${values.SEARCH_TERM.replace(/'/g, "''")}%' LIMIT ${values.LIMIT}`;
    const t = { fields: { SEARCH_TERM: { default: '' }, LIMIT: { default: 20 } } };
    assert.doesNotThrow(() => buildSql(queryComposition.resolveFieldValues(t, {})));
  });

  it('tolerates a missing fields map and non-object values', () => {
    assert.deepStrictEqual(queryComposition.resolveFieldValues({}, {}), {});
    assert.deepStrictEqual(queryComposition.resolveFieldValues(null, null), {});
    assert.deepStrictEqual(
      queryComposition.resolveFieldValues({ fields: { X: { default: 1 } } }, null),
      { X: 1 }
    );
  });

  it('resolves field values against template defaults before every buildSql call', () => {
    assert.match(
      queryBuilderSrc,
      /import\s*\{[\s\S]*?resolveFieldValues[\s\S]*?\}\s*from\s*['"]\.\.\/services\/queryComposition\.js\?v=\d+\.\d+\.\d+['"]/,
      'QueryBuilder must import resolveFieldValues from queryComposition'
    );
    assert.doesNotMatch(
      queryBuilderSrc,
      /buildSql\(fieldValues\)/,
      'buildSql must never be handed raw fieldValues'
    );
    // The runQuery site and the live SQL preview both resolve first.
    assert.match(
      queryBuilderSrc,
      /buildSql\(resolveFieldValues\(selectedTemplate,\s*fieldValues\)\)/,
      'the runQuery buildSql call must resolve field values against the template first'
    );
    assert.match(
      queryBuilderSrc,
      /const\s+currentSql\s*=\s*selectedTemplate\s*\?\s*selectedTemplate\.buildSql\(resolveFieldValues\(selectedTemplate,\s*fieldValues\)\)\s*:\s*''/,
      'the render-time SQL preview must resolve field values against the template first'
    );
  });
});

describe('query composition deployment', () => {
  it('pre-caches the shared query module through the environment-aware frontend path', () => {
    assert.match(serviceWorkerSrc, /['"]services\/queryComposition\.js['"]/);
    assert.match(
      serviceWorkerSrc,
      /APP_SHELL_FRONTEND_FILES\.map\(file\s*=>\s*`\$\{FRONTEND_PATH\}\/\$\{file\}`\)/
    );
  });
});
