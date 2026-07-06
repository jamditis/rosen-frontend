/**
 * Search index builder (build-time, curator-publish step).
 *
 * Turns archive CSV rows into a serialized MiniSearch index so the frontend can
 * run real full-text search (BM25 ranking + prefix matching) over title,
 * summary, key_concepts, tags, thematic_categories, and a raw_text excerpt.
 *
 * Why build from the CSV and not archive-data.json: the export step drops
 * raw_text (it keeps only a ~200-char quote) to keep the served payload small,
 * so the body text is never reachable from the current substring search. The
 * index is the only artifact that carries body tokens to the browser, which is
 * the entire point of issue #276.
 *
 * Pure and side-effect free: rows in -> serializable index out. This module is
 * not yet wired into data/export-archive-data.js or the frontend; it is step 1
 * of #276 (the tested core), so the wiring PRs that follow are mechanical.
 */
import MiniSearch from 'minisearch';
// The index schema (fields/storeFields/idField) is the shared build+runtime
// contract, so it lives in one module that both the builder and the browser
// loader import. It sits under frontend/ because that is what gets deployed;
// see frontend/utils/searchConfig.js for why. Re-exported below so existing
// importers of this builder keep resolving the same names.
import { SEARCH_FIELDS, STORE_FIELDS, searchIndexOptions } from '../../frontend/utils/searchConfig.js';

// raw_text is the long field. Cap the indexed slice so the artifact stays small
// and the build stays fast. 8000 chars covers roughly the first few screens of
// an article -- enough for recall without indexing the full body of every record.
export const RAW_TEXT_INDEX_CHARS = 8000;

export { SEARCH_FIELDS, STORE_FIELDS, searchIndexOptions };

const str = (v) => (v == null ? '' : String(v));

/**
 * Map one archive CSV row (snake_case keys from csv-parse columns:true) to the
 * document shape MiniSearch indexes. Tolerant of missing columns -- an absent
 * field becomes an empty string rather than undefined, which MiniSearch rejects.
 */
export function recordToSearchDoc(row, { rawTextChars = RAW_TEXT_INDEX_CHARS } = {}) {
  return {
    id: str(row.id),
    title: str(row.title),
    author: str(row.author),
    summary: str(row.summary),
    concepts: str(row.key_concepts),
    tags: str(row.tags),
    categories: str(row.thematic_categories),
    body: str(row.raw_text).slice(0, rawTextChars),
  };
}

/**
 * Build a MiniSearch index from archive CSV rows.
 *
 * Returns { json, count } where json is the serializable index object
 * (MiniSearch.toJSON output -- pass it through JSON.stringify to write the
 * artifact) and count is the number of indexed documents. Rows with no id are
 * skipped; a duplicate id surfaces MiniSearch's own error rather than being
 * silently dropped, so a CSV that violates id uniqueness fails loudly at build.
 */
export function buildSearchIndex(rows, { rawTextChars = RAW_TEXT_INDEX_CHARS } = {}) {
  const mini = new MiniSearch(searchIndexOptions());
  const docs = [];
  for (const row of rows) {
    const doc = recordToSearchDoc(row, { rawTextChars });
    if (!doc.id) continue;
    docs.push(doc);
  }
  mini.addAll(docs);
  return { json: mini.toJSON(), count: docs.length };
}

export default {
  RAW_TEXT_INDEX_CHARS,
  SEARCH_FIELDS,
  STORE_FIELDS,
  searchIndexOptions,
  recordToSearchDoc,
  buildSearchIndex,
};
