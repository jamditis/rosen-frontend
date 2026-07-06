/**
 * Shared MiniSearch schema for the full-text index (#276).
 *
 * The build step (data/lib/search-index-builder.js) and the runtime loader
 * (frontend/App.js) must agree on idField/fields/storeFields. MiniSearch.loadJSON
 * throws when the query-time options differ from the ones the index was built
 * with -- the serialized index does not carry its own config -- so any drift
 * would silently drop full-text search back to substring-only. Keeping the
 * schema in one module makes that drift impossible instead of caught after the
 * fact.
 *
 * It lives under frontend/ (not data/lib/) on purpose: frontend/ is deployed to
 * the server, data/lib/ is build-only tooling that never ships, and the runtime
 * side has to import this in the browser. So it stays dependency-free -- the
 * builder and the loader each bring their own MiniSearch; this module only
 * describes the shared shape.
 */

// Fields MiniSearch tokenizes and ranks. author is indexed so a person named in
// a byline (or a credited curator) is findable -- the card-only substring search
// never reads author, which is why "Joe Amditis" returned nothing (#276).
export const SEARCH_FIELDS = ['title', 'author', 'summary', 'concepts', 'tags', 'categories', 'body'];

// Fields stored on each hit so a result row renders without a second lookup.
// Minimal on purpose: the full record is fetched from archive-data.json by id,
// so storing more than the title would just bloat the index artifact.
export const STORE_FIELDS = ['title'];

export function searchIndexOptions() {
  return {
    idField: 'id',
    fields: SEARCH_FIELDS,
    storeFields: STORE_FIELDS,
  };
}
