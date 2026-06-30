// Pure data layer for composing QueryBuilder results with the main archive filters.
//
// Today the QueryBuilder (frontend/components/QueryBuilder.js) is a dead-end: a
// user can build a SQL query and see its rows in a results table, but those rows
// never feed back into the main filter state, so the Explorer, EntityBrowser, and
// archive view never see them (issue #135). Joe's decision (2026-05-21) is Path A:
// a record-returning query becomes a derived filter that narrows the main view. (A
// later 2026-06-05 comment on #135 argues for Path B, since the #133 dependency Path A
// was to ship with is parked; that re-recommendation is unacknowledged. This module is
// pure and additive, so it stands either way -- only intersectByRecordIds leans Path A,
// and unused it is a clean deletion.)
//
// Path A's load-bearing transform is turning query result rows into a record-id set
// and intersecting the archive against it. This module is that transform, and only
// that: no React, no DOM, no SQLite. Every function takes plain values and returns
// plain values, so the whole thing is unit-testable under `node --test`.
//
// This is the Phase-1 foundation, consumers deferred -- the same shape viewState.js
// took for issue #133. The follow-up that wires this in has prerequisites this module
// deliberately does not reach into, because each has a visible effect that belongs
// with the UX decision, not here:
//   - The record-returning templates in QueryBuilder.js currently SELECT only
//     presentation fields (title, date, pub), so their rows carry no id. extractRecordIds
//     finds ids only once those SELECTs add the record id column (and ResultsTable,
//     which renders every result column, is told how to present or hide it).
//   - Each QUERY_TEMPLATES entry needs a `composable` flag for templateIsComposable
//     to gate the button on; until then it reports false for every template (safe).
//   - The App.js filter shape needs a nullable recordIds slot, filteredRecords needs to
//     call intersectByRecordIds, and the URL round-trip rides on #133 Phase 2.
// Keeping the transform pure and separately tested means that wiring is mechanical.
//
// The three concerns are deliberately separate:
//   - templateIsComposable(template) -- static: can this query feed the filter at
//     all? A record-returning template can; an aggregate (COUNT/GROUP BY) can't.
//     This is the gate for the "use as filter" button, decided before the query runs.
//   - extractRecordIds(rows)         -- runtime: which records did it return? Empty
//     is a real answer (the query matched nothing), not a sign of non-composability.
//   - intersectByRecordIds(...)      -- runtime: apply the resulting id set.
// Composability is a property of the query shape, not of the row count, so it is
// read from the template, never inferred from how many rows came back.

/**
 * Normalise a record id to a string for membership comparison.
 *
 * Archive records store string ids ("dissertation-1986", and numeric-looking ids
 * as strings), while a SQLite query can return a numeric-looking id column as a
 * JS number. Comparing 5 to "5" with Set membership would silently match nothing,
 * so both sides are coerced to strings here. A null/undefined/empty id is not a
 * usable handle and returns null so callers can drop it.
 *
 * @param {unknown} id
 * @returns {string | null}
 */
function normalizeId(id) {
  if (id === null || id === undefined) return null;
  const str = String(id);
  return str === '' ? null : str;
}

/**
 * Pull the record-id column out of query result rows into a deduplicated,
 * order-preserving array of string ids.
 *
 * Aggregate queries (COUNT/GROUP BY templates) select no id column, so their rows
 * yield an empty array; so does a record query that matched nothing. The two are
 * told apart by templateIsComposable (a template property), not by this return --
 * here an empty array just means "no ids in these rows". A row with a null/empty id
 * is skipped, and first-occurrence order is preserved so a caller can report
 * "N records" consistently.
 *
 * @param {Array<Record<string, unknown>> | null | undefined} rows
 * @param {string} [idColumn='id'] - the result column holding the record id.
 * @returns {string[]}
 */
export function extractRecordIds(rows, idColumn = 'id') {
  if (!Array.isArray(rows)) return [];
  const seen = new Set();
  const ids = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const id = normalizeId(row[idColumn]);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * True when a query template can compose with the main archive filters: it returns
 * record rows rather than an aggregate. This gates the "use these records as filter"
 * affordance, and is a static property of the template, decided before the query
 * runs -- a record-returning template that happens to match zero rows is still
 * composable (applying it narrows the archive to nothing), so the row count must not
 * enter this decision.
 *
 * The default is conservative: a template is composable only when it explicitly
 * declares `composable: true`. An unmarked or aggregate template returns false, so
 * the affordance never appears on a query whose result cannot be a record filter.
 * The follow-up that adds the button also adds the `composable` flag to each
 * QUERY_TEMPLATES entry; until then this reports false for every template, which is
 * the safe non-action.
 *
 * @param {{ composable?: boolean } | null | undefined} template
 * @returns {boolean}
 */
export function templateIsComposable(template) {
  return template != null && template.composable === true;
}

/**
 * Narrow an archive record array to the records named by recordIds, preserving
 * the input array's existing order and sort.
 *
 * The recordIds argument is deliberately nullable, and null and [] mean different
 * things:
 *   - null      -> no record filter is active; every record passes through.
 *   - []        -> a query ran and matched zero records; nothing passes.
 *   - [a, b...] -> only records whose id is in the set pass.
 * That distinction is why a recordIds filter slot has to be null-by-default rather
 * than [] -by-default: an empty array is a real, restrictive result, not "unset".
 *
 * Ids are string-normalised on both sides so a numeric query id matches a string
 * record id. Records with a null/empty id never match a non-null filter.
 *
 * @param {Array<{ id?: unknown }>} records
 * @param {Array<string | number> | null | undefined} recordIds
 * @returns {Array<{ id?: unknown }>}
 */
export function intersectByRecordIds(records, recordIds) {
  if (!Array.isArray(records)) return [];
  if (recordIds === null || recordIds === undefined) return records;

  const wanted = new Set();
  for (const id of recordIds) {
    const norm = normalizeId(id);
    if (norm !== null) wanted.add(norm);
  }
  if (wanted.size === 0) return [];

  return records.filter((r) => {
    const id = normalizeId(r && r.id);
    return id !== null && wanted.has(id);
  });
}
