/**
 * Read data/entity-merges.csv, the structured record of retired entity ids.
 *
 * When two rows in extracted_entities.csv turn out to name the same thing, the
 * duplicate row is removed, its mentions fold into the row that stays, and its
 * relationships are re-pointed there. The merge table keeps one row per retired
 * id so that anything still holding the old id -- a shared ?entity= link, a
 * cached payload, an outside citation -- can be sent on to the entity that
 * replaced it. Before #874 that history lived only in free-text notes.
 *
 * The exporter turns the table into the `entityRedirects` map it publishes in
 * archive-entities.json. Both functions here fail loudly: a merge table that
 * points at a missing entity, or names a retired id that is still a live row,
 * would publish a redirect that leads nowhere.
 */
import { parse } from 'csv-parse/sync';

export const ENTITY_MERGE_COLUMNS = Object.freeze([
  'retired_id',
  'retired_type',
  'retired_name',
  'canonical_id',
  'merged_on',
  'issue',
  'reason',
]);

const ENTITY_ID = /^[A-Z][0-9]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse the merge table text into structured rows.
 *
 * @param {string} text contents of data/entity-merges.csv
 * @returns {Array<{retiredId: string, retiredType: string, retiredName: string,
 *   canonicalId: string, mergedOn: string, issue: string, reason: string}>}
 */
export function parseEntityMerges(text) {
  const firstLine = String(text).replace(/^﻿/, '').split(/\r?\n/, 1)[0].trim();
  if (firstLine !== ENTITY_MERGE_COLUMNS.join(',')) {
    throw new Error(
      `entity-merges.csv header must be "${ENTITY_MERGE_COLUMNS.join(',')}", got "${firstLine}"`,
    );
  }

  const rows = parse(text, { columns: true, skip_empty_lines: true, bom: true });
  const seen = new Set();
  return rows.map((row, index) => {
    const line = index + 2;
    const merge = {
      retiredId: (row.retired_id || '').trim(),
      retiredType: (row.retired_type || '').trim(),
      retiredName: (row.retired_name || '').trim(),
      canonicalId: (row.canonical_id || '').trim(),
      mergedOn: (row.merged_on || '').trim(),
      issue: (row.issue || '').trim(),
      reason: (row.reason || '').trim(),
    };
    if (!ENTITY_ID.test(merge.retiredId)) {
      throw new Error(`entity-merges.csv line ${line}: retired_id "${merge.retiredId}" is not an entity id`);
    }
    if (!ENTITY_ID.test(merge.canonicalId)) {
      throw new Error(`entity-merges.csv line ${line}: canonical_id "${merge.canonicalId}" is not an entity id`);
    }
    if (merge.retiredId === merge.canonicalId) {
      throw new Error(`entity-merges.csv line ${line}: ${merge.retiredId} cannot be merged into itself`);
    }
    if (!ISO_DATE.test(merge.mergedOn)) {
      throw new Error(`entity-merges.csv line ${line}: merged_on "${merge.mergedOn}" must be YYYY-MM-DD`);
    }
    if (seen.has(merge.retiredId)) {
      throw new Error(`entity-merges.csv line ${line}: ${merge.retiredId} is retired more than once`);
    }
    seen.add(merge.retiredId);
    return merge;
  });
}

/**
 * Build the retired id -> canonical id map, following chains of merges.
 *
 * A later merge can retire an id that was itself the target of an earlier one
 * (A -> B, then B -> C). Every retired id resolves to the entity that is still
 * live, so a consumer needs one lookup, never a loop.
 *
 * @param {Array<{retiredId: string, canonicalId: string}>} merges
 * @param {Set<string>} liveIds entity ids present in the current entity table
 * @returns {Record<string, string>}
 */
export function buildEntityRedirects(merges, liveIds) {
  const next = new Map(merges.map((merge) => [merge.retiredId, merge.canonicalId]));
  const redirects = {};

  for (const retiredId of [...next.keys()].sort()) {
    if (liveIds.has(retiredId)) {
      throw new Error(`entity-merges.csv retires ${retiredId}, but it is still an entity row`);
    }
    const visited = new Set([retiredId]);
    let target = next.get(retiredId);
    while (next.has(target)) {
      if (visited.has(target)) {
        throw new Error(`entity-merges.csv has a cycle through ${retiredId}`);
      }
      visited.add(target);
      target = next.get(target);
    }
    if (!liveIds.has(target)) {
      throw new Error(`entity-merges.csv redirects ${retiredId} to ${target}, which is not an entity row`);
    }
    redirects[retiredId] = target;
  }

  return redirects;
}

export default { ENTITY_MERGE_COLUMNS, parseEntityMerges, buildEntityRedirects };
