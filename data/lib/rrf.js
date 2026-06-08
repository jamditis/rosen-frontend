/**
 * Reciprocal Rank Fusion for hybrid recall (issue #279, the fusion core).
 *
 * #279 merges two ranked result lists -- the lexical leg (#276 MiniSearch BM25,
 * or today's substring filter) and the semantic leg (#278/#396 BGE cosine) --
 * into one ranking. RRF is the right merge because BM25 scores and cosine
 * similarities are on different, uncalibrated scales and there is no labeled-query
 * set to tune a weighted blend against, so the raw scores are not comparable. RRF
 * throws the scores away and fuses on RANK alone, which makes it indifferent to
 * the int8 quantization of the stored article vectors as well: the dequantized
 * cosine is approximate, but the ordering it induces is the only thing RRF reads.
 *
 * The fused score of a candidate is the sum, over the lists it appears in, of
 * 1 / (k + rank), where rank is its 1-indexed position in that list and k is a
 * smoothing constant (60, from Cormack et al. 2009 and the value #279 specifies).
 * A candidate absent from a list contributes NOTHING from that list -- the term
 * is omitted, not added as 1 / (k + infinity). The fused candidate set is the
 * UNION of the input lists, not their intersection.
 *
 * Provenance falls out for free: label the lexical leg 'kw' and the semantic leg
 * 'sem' and a hit's `sources` is exactly ['kw'], ['sem'], or ['kw', 'sem'], so
 * `chipFor(sources)` ('kw', 'sem', 'kw·sem') is the result-chip badge #279
 * wants with no separate tagging pass.
 *
 * Pure and side-effect free: rank lists in -> fused ranking out. Not wired into
 * the frontend; it is the one piece of #279 that is independent of the still-open
 * runtime dependencies (#276 runtime FTS, #278/#397 cosine worker), so it is
 * buildable and testable now. See the issue thread for why the rest of #279 is
 * gated on those landing first.
 */

// Smoothing constant. Larger k flattens the contribution of top ranks (so deep
// agreement between lists matters more); smaller k sharpens the head. 60 is the
// literature default and #279's choice.
export const DEFAULT_RRF_K = 60;

// Recommended leg labels. Using these makes chipFor() emit #279's result badges
// directly. The fuser itself is label-agnostic, so other callers can use any
// labels they like.
export const LABEL_LEXICAL = 'kw';
export const LABEL_SEMANTIC = 'sem';

// Canonical provenance order so a hit's chip is stable no matter what order the
// caller passed the lists in: the known legs lead (lexical, then semantic) and
// any other labels follow alphabetically. Without this, sources would inherit
// the caller's object-key order and a { sem, kw } call would render 'sem·kw'.
const CHIP_PRECEDENCE = { [LABEL_LEXICAL]: 0, [LABEL_SEMANTIC]: 1 };
function compareLabels(a, b) {
  const pa = CHIP_PRECEDENCE[a] ?? 2;
  const pb = CHIP_PRECEDENCE[b] ?? 2;
  return pa - pb || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Render a hit's `sources` array as a result-chip badge. With the recommended
 * leg labels this yields 'kw', 'sem', or 'kw·sem'. The middle dot is U+00B7,
 * not an ASCII period, so it does not collide with a label that contains '.'.
 *
 * The input is canonicalized (lexical, then semantic, then alphabetical) before
 * joining, so the badge is stable even for a caller that hand-builds `sources`
 * in some other order -- reciprocalRankFusion already returns it sorted, but
 * chipFor must not assume its one caller.
 */
export function chipFor(sources) {
  return [...sources].sort(compareLabels).join('·');
}

/**
 * Fuse one or more ranked id lists with Reciprocal Rank Fusion.
 *
 * @param {Object<string, string[]>} lists - label -> ordered array of ids, best
 *   first. Example: { kw: ['a', 'b'], sem: ['b', 'c'] }. A label whose list is
 *   empty is allowed and simply contributes nothing.
 * @param {{ k?: number }} [opts] - k is the RRF smoothing constant (>= 0).
 * @returns {Array<{ id: string, score: number, sources: string[], ranks: Object<string, number> }>}
 *   Fused hits sorted by score descending. Ties break by id ascending so the
 *   order is fully deterministic. `sources` lists the contributing labels in
 *   canonical leg order (lexical, semantic, then any others alphabetically), so
 *   the chip is stable regardless of the order the lists were passed in; `ranks`
 *   carries the 1-indexed rank per contributing label.
 *
 * Within a single list the FIRST occurrence of an id wins its (best) rank;
 * later duplicates are ignored rather than counted twice, so a malformed list
 * cannot inflate a candidate's score. Ranks are dense over the unique ids, so a
 * duplicate does not waste a rank slot and penalize the items after it. A
 * non-array list value throws -- a shape bug should fail loudly at the seam,
 * not silently rank nothing.
 */
export function reciprocalRankFusion(lists, { k = DEFAULT_RRF_K } = {}) {
  if (!Number.isFinite(k) || k < 0) {
    throw new Error(`reciprocalRankFusion: k must be a finite number >= 0, got ${k}`);
  }

  // id -> { id, score, sources, ranks }. A Map preserves first-seen order, but
  // the final sort is what callers depend on, so insertion order is incidental.
  const fused = new Map();

  for (const label of Object.keys(lists)) {
    const list = lists[label];
    if (!Array.isArray(list)) {
      throw new Error(`reciprocalRankFusion: list "${label}" must be an array`);
    }
    const seen = new Set();
    let rank = 0; // dense 1-indexed rank over UNIQUE ids in this list
    for (const id of list) {
      if (seen.has(id)) continue; // first (best) rank wins; ignore later dupes
      seen.add(id);

      rank += 1;
      const contribution = 1 / (k + rank);

      let entry = fused.get(id);
      if (!entry) {
        entry = { id, score: 0, sources: [], ranks: {} };
        fused.set(id, entry);
      }
      entry.score += contribution;
      entry.sources.push(label);
      entry.ranks[label] = rank;
    }
  }

  const hits = [...fused.values()];
  for (const hit of hits) hit.sources.sort(compareLabels);
  return hits.sort(
    (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export default {
  DEFAULT_RRF_K,
  LABEL_LEXICAL,
  LABEL_SEMANTIC,
  chipFor,
  reciprocalRankFusion,
};
