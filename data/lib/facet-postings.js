/**
 * Build-time facet posting lists + entity->records inversion (issue #277).
 *
 * Two deterministic projections over the archive that #277 proposes moving out
 * of the per-render path:
 *
 *   buildFacetPostingLists(records) - value -> [record ids] for each facet
 *       dimension (categories, eras, content_types, publications). The frontend
 *       would intersect a search result Set with these instead of re-scanning
 *       the records array on every filter change.
 *
 *   invertRecordEntityMap(recordEntityMap) - entity id -> [record ids], the
 *       transpose of the record->entity map already shipped in
 *       archive-entities.json. Both archiveService.buildEntityMaps and
 *       entityIndex.createEntityIndex compute this inline at load; this is that
 *       same inversion as one pure, tested function.
 *
 * Pure and side-effect-free: no fs, no fetch, no globals. These are the
 * decomposed cores #277 would consume; nothing here writes an artifact or
 * touches the frontend, so it is inert until a wiring step lands. Whether the
 * artifacts are worth emitting eagerly is a measured trade - see
 * scripts/measure-facet-entity-cost.js, which uses these builders to size the
 * artifacts and time the scan they would replace.
 */

// Platform values the "content type" facet exposes for social records, each
// matched against the record's publication string. Mirrors App.js:197-198.
//
// `pub` is a free-text publication label (lowercased by the caller), not a URL
// or hostname. This is content-facet bucketing, not URL sanitization, so the
// 'x.com' substring test carries no security boundary - it reproduces App.js's
// r.pub.toLowerCase().includes('x.com') filter verbatim. The codeql suppression
// records that the incomplete-url-substring-sanitization heuristic does not
// apply here (no host is being validated); it does not weaken a real check.
const PLATFORM_MATCHERS = [
  // codeql[js/incomplete-url-substring-sanitization]
  { value: 'twitter', matches: (pub) => pub.includes('twitter') || pub.includes('x.com') },
  { value: 'bluesky', matches: (pub) => pub.includes('bluesky') },
];

/**
 * The content-type filter values a record matches, mirroring the App.js
 * predicate exactly. This facet is DERIVED, not a stored column, and is NOT a
 * partition: the UI (Sidebar.js) offers only `article`, `twitter`, `bluesky`,
 * where `article` means any non-social record (articles plus the dissertation)
 * and the platform values match a social record's publication string. A social
 * record on another platform (Mastodon, RTN) matches none of the three, so it
 * lands in no content-type bucket - the same way it is unreachable by the live
 * content-type filter today.
 * @param {{type?: string, pub?: string}} record
 * @returns {string[]} zero or more of 'article' | 'twitter' | 'bluesky'
 */
export const contentTypeKeys = (record) => {
  if (record.type !== 'social') return ['article'];
  const pub = (record.pub || '').toLowerCase();
  return PLATFORM_MATCHERS.filter((m) => m.matches(pub)).map((m) => m.value);
};

// Add an id to bucket[key], creating the list on first sight. Guards two edge
// cases: a missing/empty facet value is dropped (no '' or 'undefined' bucket),
// and the own-key check avoids the inherited-property footgun where a data
// value like "toString" would otherwise resolve to Object.prototype.toString.
const pushPosting = (bucket, key, id) => {
  if (key == null || key === '') return;
  if (!Object.hasOwn(bucket, key)) bucket[key] = [];
  bucket[key].push(id);
};

/**
 * Build value -> [record id] posting lists for each facet dimension.
 * Records are visited in order, so each posting list preserves input order.
 * @param {Array<{id:string, categories?:string[], era?:string, type?:string, pub?:string}>} records
 * @returns {{categories:Object, eras:Object, content_types:Object, publications:Object}}
 */
export const buildFacetPostingLists = (records) => {
  const postings = { categories: {}, eras: {}, content_types: {}, publications: {} };
  for (const r of records) {
    for (const category of r.categories || []) pushPosting(postings.categories, category, r.id);
    pushPosting(postings.eras, r.era, r.id);
    for (const ctype of contentTypeKeys(r)) pushPosting(postings.content_types, ctype, r.id);
    pushPosting(postings.publications, r.pub, r.id);
  }
  return postings;
};

/**
 * Invert a record->[entity id] map into entity->[record id]. The result is the
 * exact transpose of the input: every (record, entity) edge becomes an
 * (entity, record) edge, nothing added or dropped.
 * @param {Object<string, string[]>} recordEntityMap
 * @returns {Object<string, string[]>}
 */
export const invertRecordEntityMap = (recordEntityMap) => {
  const entityToRecords = {};
  for (const recordId of Object.keys(recordEntityMap)) {
    for (const entityId of recordEntityMap[recordId]) {
      if (!Object.hasOwn(entityToRecords, entityId)) entityToRecords[entityId] = [];
      entityToRecords[entityId].push(recordId);
    }
  }
  return entityToRecords;
};
