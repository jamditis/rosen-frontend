/**
 * Hybrid search ranking and the sort key that presents it (#279).
 *
 * App.js owns the state; the decisions live here, as pure functions, so they
 * can be tested without a browser. Everything below takes plain values and
 * returns plain values: no React, no DOM, no fetch.
 *
 * Three jobs:
 *  1. fuse the lexical and semantic hit orders into one ranking (RRF);
 *  2. order a filtered record list by that ranking;
 *  3. decide which sort key may be selected right now.
 *
 * Job 3 exists because the sort control only lists "Relevance" while a query is
 * active. Selecting relevance with an empty search box leaves the select with a
 * value no option carries, and the browser then renders it blank.
 */
import {
  chipFor,
  reciprocalRankFusion,
  LABEL_LEXICAL,
  LABEL_SEMANTIC,
} from './rrf.js?v=3.8.33';

/** Sort key for the fused hybrid order. Offered only while a query is active. */
export const RELEVANCE_SORT = 'relevance';

/** The sort the archive falls back to whenever relevance cannot be offered. */
export const DEFAULT_SORT = 'date-desc';

/**
 * Chip for a record the ranked legs never reached.
 *
 * The archive also matches records by plain substring, which no ranked leg
 * covers, so a card can be a real keyword match with no fused rank. It gets the
 * keyword chip: an unlabelled card beside labelled ones reads as a bug.
 */
export const LEXICAL_SIGNAL = chipFor([LABEL_LEXICAL]);

/**
 * Fuse the two hit orders into one ranking plus its provenance chips.
 *
 * @param {{ lexicalOrder?: string[], semanticOrder?: string[] }} legs - ranked
 *   record ids, best first. Either may be empty.
 * @returns {{
 *   fusedRanks: Map<string, number>,
 *   searchSignals: Map<string, string>|null,
 *   semanticIds: Set<string>,
 *   lexicalIds: Set<string>|null,
 * }} `fusedRanks` maps a record id to its 0-indexed fused position.
 *   `searchSignals` maps a record id to its chip, and is null while the
 *   semantic leg is empty, because a chip on every card says nothing when only
 *   one leg can contribute. `semanticIds` and `lexicalIds` are membership sets
 *   for the filter step; `lexicalIds` is null when the lexical leg is empty so
 *   a caller can skip the lookup.
 */
export function buildSearchRanking({ lexicalOrder = [], semanticOrder = [] } = {}) {
  const fused = reciprocalRankFusion({
    [LABEL_LEXICAL]: lexicalOrder,
    [LABEL_SEMANTIC]: semanticOrder,
  });
  return {
    fusedRanks: new Map(fused.map((hit, index) => [hit.id, index])),
    searchSignals: semanticOrder.length > 0
      ? new Map(fused.map(hit => [hit.id, chipFor(hit.sources)]))
      : null,
    semanticIds: new Set(semanticOrder),
    lexicalIds: lexicalOrder.length > 0 ? new Set(lexicalOrder) : null,
  };
}

/**
 * Order records by fused rank, keeping the input order for everything the
 * ranked legs did not reach.
 *
 * Pass a list already sorted the way unranked records should fall (newest
 * first, in the archive). A record with no fused rank sorts after every ranked
 * one and keeps its incoming position, so the tail stays stable.
 */
export function orderByFusedRank(records, fusedRanks) {
  if (!fusedRanks || fusedRanks.size === 0) return records;
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => (
      (fusedRanks.get(a.record.id) ?? Infinity) - (fusedRanks.get(b.record.id) ?? Infinity)
      || a.index - b.index
    ))
    .map(entry => entry.record);
}

/**
 * Sort key after the semantic toggle is switched.
 *
 * On, with a query: fused relevance is the point of the toggle, so ranking
 * follows it. On, with an empty box: relevance is not on offer, so it is
 * dropped. Off: give back the default sort, since the reader never picked
 * relevance themselves.
 */
export function sortForSemanticToggle(current, { enabled, hasQuery } = {}) {
  if (!enabled || !hasQuery) return current === RELEVANCE_SORT ? DEFAULT_SORT : current;
  return RELEVANCE_SORT;
}

/**
 * Sort key after the search box changes.
 *
 * Clearing the box drops relevance, which no longer has a query to rank
 * against. Starting a new query while semantic search is on picks relevance up
 * again. Editing an active query changes nothing, so a reader who chose a date
 * order keeps it while they type.
 */
export function sortForQueryChange(current, { hasQuery, hadQuery = false, semanticEnabled = false } = {}) {
  if (!hasQuery) return current === RELEVANCE_SORT ? DEFAULT_SORT : current;
  if (semanticEnabled && !hadQuery) return RELEVANCE_SORT;
  return current;
}

export default {
  RELEVANCE_SORT,
  DEFAULT_SORT,
  LEXICAL_SIGNAL,
  buildSearchRanking,
  orderByFusedRank,
  sortForSemanticToggle,
  sortForQueryChange,
};
