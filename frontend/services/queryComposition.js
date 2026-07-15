// Pure data layer for composing QueryBuilder results with the main archive filters.
//
// QueryBuilder record queries feed this module's record-id subset into App.js.
// App then renders that subset through the archive cards, RecordView, facets,
// timeline, and entity browser. The facet and entity derivations below keep
// those secondary views on the same record subset. Aggregate queries have no
// record ids, so they remain tabular inside the analytics route (issue #135,
// Path A, reaffirmed by Joe on 2026-07-09).
//
// Path A's load-bearing transform turns query result rows into a record-id set
// and intersects the archive against it. This module owns those pure composition
// transforms: no React, no DOM, no SQLite. Every function takes plain values and
// returns plain values, so the whole thing is unit-testable under `node --test`.
//
// The three concerns are deliberately separate:
//   - templateIsComposable(template) -- static: can this query feed the filter at
//     all? A record-returning template can; an aggregate (COUNT/GROUP BY) can't.
//     This gates dispatch into the archive view, decided before the query runs.
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
 * record rows rather than an aggregate. This gates dispatch into the archive and is
 * a static property of the template, decided before the query runs. A record-returning
 * template that happens to match zero rows is still composable because applying it
 * narrows the archive to nothing, so the row count must not enter this decision.
 *
 * The default is conservative: a template is composable only when it explicitly
 * declares `composable: true`. An unmarked or aggregate template returns false, so
 * a query whose result cannot be a record filter stays in the tabular results view.
 *
 * @param {{ composable?: boolean } | null | undefined} template
 * @returns {boolean}
 */
export function templateIsComposable(template) {
  return template != null && template.composable === true;
}

/**
 * Resolve a template's field values against its declared defaults so a caller can
 * build SQL without tripping over an unset field.
 *
 * QueryBuilder keeps fieldValues in React state that an effect repopulates only
 * after a template switch has rendered. On the render between the switch and that
 * effect, fieldValues still carries the previous template's keys, so the newly
 * selected template's fields are missing. A template whose buildSql dereferences a
 * text field (values.SEARCH_TERM.replace(...)) then throws during render and blanks
 * the whole app (issue #525). Resolving here fills every field the template
 * declares -- the caller's value when present, the field default otherwise -- and
 * returns only those fields, dropping stale keys left over from a prior template.
 * It mirrors the `values[part] ?? field.default` fallback the query sentence UI
 * already uses, so the built SQL matches the sentence the user sees.
 *
 * Nullish coalescing is deliberate: an empty string or a 0 the user entered is a
 * real value and is kept; only null/undefined falls back to the default.
 *
 * @param {{fields?: Record<string, {default?: unknown}>} | null | undefined} template
 * @param {Record<string, unknown> | null | undefined} values
 * @returns {Record<string, unknown>}
 */
export function resolveFieldValues(template, values) {
  const fields = template && typeof template === 'object' && template.fields
    ? template.fields
    : {};
  const source = values && typeof values === 'object' ? values : {};
  const resolved = {};
  for (const [key, field] of Object.entries(fields)) {
    resolved[key] = source[key] ?? (field ? field.default : undefined);
  }
  return resolved;
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

/**
 * Restrict the archive's facet choices to values present in a record subset.
 *
 * The source facet arrays already carry the archive's published ordering,
 * including the canonical era order. Filtering those arrays preserves that
 * order without copying taxonomy values into this module.
 *
 * Active category and era selections remain available even when the query
 * subset does not contain them, so the sidebar can still remove those filters.
 *
 * @param {{categories?: string[], eras?: string[], publications?: string[]}} facets
 * @param {Array<{categories?: string[], era?: string, pub?: string}>} records
 * @param {{categories?: string[], era?: string | null}} [selected]
 * @returns {{categories: string[], eras: string[], publications: string[]}}
 */
export function deriveFacetsForRecords(facets, records, selected = {}) {
  const available = {
    categories: new Set(),
    eras: new Set(),
    publications: new Set(),
  };

  for (const record of Array.isArray(records) ? records : []) {
    for (const category of Array.isArray(record?.categories) ? record.categories : []) {
      available.categories.add(category);
    }
    if (record?.era) available.eras.add(record.era);
    if (record?.pub) available.publications.add(record.pub);
  }

  for (const category of Array.isArray(selected.categories) ? selected.categories : []) {
    available.categories.add(category);
  }
  if (selected.era) available.eras.add(selected.era);

  const source = facets && typeof facets === 'object' ? facets : {};
  return {
    categories: (source.categories || []).filter(value => available.categories.has(value)),
    eras: (source.eras || []).filter(value => available.eras.has(value)),
    publications: (source.publications || []).filter(value => available.publications.has(value)),
  };
}

/**
 * Restrict entity metadata and entity-to-record links to a record subset.
 *
 * Entity payloads carry archive-wide mention totals and relationships. Query
 * results need counts computed from their records so unrelated entities do not
 * remain visible with zero matching records. Each entity is counted once per
 * record, and the source entity order is preserved.
 *
 * @param {Array<{id?: unknown, totalMentions?: number}>} entities
 * @param {Record<string, Array<unknown>>} recordEntityMap
 * @param {Array<{id?: unknown}>} records
 * @returns {{entities: Array<object>, recordIdsByEntity: Map<string, string[]>}}
 */
export function deriveEntityScope(entities, recordEntityMap, records) {
  const sourceEntities = Array.isArray(entities) ? entities : [];
  const availableEntityIds = new Set(
    sourceEntities.map(entity => normalizeId(entity?.id)).filter(id => id !== null)
  );
  const relationships = recordEntityMap && typeof recordEntityMap === 'object'
    ? recordEntityMap
    : {};
  const recordIdsByEntity = new Map();
  const seenRecordIds = new Set();

  for (const record of Array.isArray(records) ? records : []) {
    const recordId = normalizeId(record?.id);
    if (recordId === null || seenRecordIds.has(recordId)) continue;
    seenRecordIds.add(recordId);

    const seenEntityIds = new Set();
    const relatedIds = Array.isArray(relationships[recordId]) ? relationships[recordId] : [];
    for (const relatedId of relatedIds) {
      const entityId = normalizeId(relatedId);
      if (
        entityId === null ||
        seenEntityIds.has(entityId) ||
        !availableEntityIds.has(entityId)
      ) continue;

      seenEntityIds.add(entityId);
      if (!recordIdsByEntity.has(entityId)) recordIdsByEntity.set(entityId, []);
      recordIdsByEntity.get(entityId).push(recordId);
    }
  }

  return {
    entities: sourceEntities
      .filter(entity => recordIdsByEntity.has(normalizeId(entity?.id)))
      .map(entity => ({
        ...entity,
        totalMentions: recordIdsByEntity.get(normalizeId(entity.id)).length,
      })),
    recordIdsByEntity,
  };
}

/**
 * Use the payload entity index until a query scope is active.
 *
 * The payload contains entities that are not represented in recordEntityMap and
 * archive-wide mention totals that cannot be reconstructed from that map. Query
 * results need the derived subset; ordinary entity browsing must keep the source
 * array and its metadata untouched.
 *
 * @param {Array<object>} entities
 * @param {Record<string, Array<unknown>>} recordEntityMap
 * @param {Array<{id?: unknown}>} records
 * @param {boolean} queryActive
 * @returns {{entities: Array<object>, recordIdsByEntity: Map<string, string[]> | null}}
 */
export function getEntityScope(entities, recordEntityMap, records, queryActive) {
  if (!queryActive) {
    return {
      entities: Array.isArray(entities) ? entities : [],
      recordIdsByEntity: null,
    };
  }

  return deriveEntityScope(entities, recordEntityMap, records);
}
