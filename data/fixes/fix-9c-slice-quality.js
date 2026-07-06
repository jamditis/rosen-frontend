// Clean up the 9c social-post entity slice merged in PR #579.
//
// The 9c slice extracted entities from all social posts, but the archive only
// serves a filtered subset of those posts (Rosen's own; reposts, non-Rosen
// quotes, and short replies are dropped by export-archive-data.js). Entities
// mined from dropped posts therefore had no served record behind them, and the
// slice also introduced alias duplicates (Trump vs Donald Trump).
//
// This script fixes only the unambiguous data-quality classes: it drops true
// orphans (9c entities with no served record behind them), folds the Trump/Biden
// aliases and any 9c row that exact-name-matches a pre-9c canonical of the same
// type into that canonical, and repoints first mentions at the earliest served
// record that actually contains the entity.
// It only touches rows the slice added -- 9c entities carry
// notes = "proposed (9c slice)", and no pre-9c relationship can reference a 9c
// entity id, so relationships are classified by their endpoints, not a tag.
//
// Deferred to the curated fix-* tools, by design (not dropped here):
//   - Generic-group Persons ("journalists", "officials"). Deleting the entity
//     would also drop its relationships, which strips the co-mention from the
//     OTHER (often real, surviving) endpoint and can empty a served record --
//     measured collateral of 23 emptied posts and 28 lost mentions across 21
//     kept entities on this slice. Whether a given label is junk or a usable
//     group node is a curation call, so it stays. A generic that only appears
//     on filtered-out posts is still dropped here as an ordinary orphan; one on
//     a served record survives until a curated pass removes it properly.
//   - Cross-type name duplicates (a 9c "Twitter" Work vs the canonical
//     Organization). Some names are legitimately multi-type, so merging belongs
//     in fix-cross-type-duplicates.js, not an automatic "first match wins" pass.
//
// Companion code fix (data/export-archive-data.js buildRelationshipsMap): a
// relationship's source record now also links to its SOURCE entity, so a
// source-only entity on a served record is reachable rather than orphaned.
//
// Survival rule: a 9c entity survives iff it is an endpoint of a surviving
// relationship (both endpoints kept, after alias/dup remap) whose source record
// is served -- exactly the reachability the exporter's recordEntityMap gives the
// UI. An entity with no such relationship opens to nothing, so it is dropped.
//
// Dry run by default; pass --apply to write.

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const url = p => decodeURIComponent(new URL(p, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const ENTITIES_PATH = url('../extracted_entities.csv');
const RELATIONSHIPS_PATH = url('../extracted_relationships.csv');
const ARCHIVE_DATA_PATH = url('../archive-data.json');

const APPLY = process.argv.includes('--apply');
const NINEC_MARK = 'proposed (9c slice)';

const ENTITY_COLUMNS = [
  'entity_id', 'entity_type', 'entity_name', 'normalized_name',
  'role_or_description', 'affiliation', 'prominence_score',
  'first_mention_record_id', 'total_mentions', 'related_entities', 'notes',
];
const RELATIONSHIP_COLUMNS = [
  'relationship_id', 'source_record_id', 'source_entity_id', 'source_entity_name',
  'relationship_type', 'target_entity_id', 'target_entity_name',
  'context_snippet', 'confidence_score', 'extracted_date',
];

// Aliases the connector named that are not exact-name matches to canonical.
const CURATED_ALIASES = {
  'trump': 'Donald Trump',
  'president trump': 'Donald Trump',
  'donald j. trump': 'Donald Trump',
  'biden': 'Joe Biden',
  'president biden': 'Joe Biden',
  'joe biden jr.': 'Joe Biden',
};

const entities = parse(readFileSync(ENTITIES_PATH, 'utf-8'), { columns: true, skip_empty_lines: true });
const relationships = parse(readFileSync(RELATIONSHIPS_PATH, 'utf-8'), { columns: true, skip_empty_lines: true });
const archiveRecords = JSON.parse(readFileSync(ARCHIVE_DATA_PATH, 'utf-8')).records || [];
const servedIds = new Set(archiveRecords.map(r => r.id));
const recordDate = new Map(archiveRecords.map(r => [r.id, r.date || '']));

// A relationship with a blank endpoint can't be reasoned about: survivingEndpoints
// would treat the empty id as a valid endpoint (remap('') is '', which no guard
// flags) and could keep a real entity reachable through a broken row. Refuse the
// run rather than pass malformed input through as silently-wrong output.
const malformedRels = relationships.filter(r =>
  !(r.source_entity_id || '').trim() || !(r.target_entity_id || '').trim());
if (malformedRels.length) {
  console.error(`REFUSING: ${malformedRels.length} relationship(s) have a blank endpoint, e.g. ${malformedRels.slice(0, 5).map(r => r.relationship_id).join(', ')}`);
  process.exit(1);
}

const is9c = e => (e.notes || '').includes(NINEC_MARK);
const nameKey = s => (s || '').trim().toLowerCase();

// Canonical (pre-9c) lookup. Only same-type exact-name matches are treated as
// duplicates here; cross-type name collisions are left for the curated tool.
const preByNameType = new Map();  // "name|type" -> id
const preByName = new Map();       // "name" -> id (first seen), used only to resolve curated alias targets
for (const e of entities) {
  if (is9c(e)) continue;
  const nk = nameKey(e.entity_name);
  preByNameType.set(`${nk}|${e.entity_type}`, e.entity_id);
  if (!preByName.has(nk)) preByName.set(nk, e.entity_id);
}
const aliasTargetId = new Map(); // curated alias name -> canonical id
for (const [alias, canonName] of Object.entries(CURATED_ALIASES)) {
  const id = preByName.get(nameKey(canonName));
  if (id) aliasTargetId.set(alias, id);
}

// The exact-name fold below only maps a 9c entity into a PRE-9c canonical of the
// same type. If the slice itself holds two same-type entities with the same name
// and no pre-9c canonical, neither folds and both would survive as duplicates.
// The merge that produced the slice already dedupes by (type, normalized name),
// so refuse rather than silently ship a duplicate if that guarantee ever
// regresses -- picking a canonical among equal 9c rows is a curation call, not
// something to guess here.
const nineByNameType = new Map();  // "name|type" (9c, no pre-9c canonical) -> [ids]
for (const e of entities) {
  if (!is9c(e)) continue;
  const key = `${nameKey(e.entity_name)}|${e.entity_type}`;
  if (preByNameType.has(key)) continue;  // folds into the pre-9c canonical
  if (!nineByNameType.has(key)) nineByNameType.set(key, []);
  nineByNameType.get(key).push(e.entity_id);
}
const intraDupes = [...nineByNameType.entries()].filter(([, ids]) => ids.length > 1);
if (intraDupes.length) {
  console.error(`REFUSING: ${intraDupes.length} intra-slice same-type exact-name duplicate group(s) with no pre-9c canonical, e.g. ${intraDupes.slice(0, 5).map(([k, ids]) => `${k} [${ids.join(',')}]`).join('; ')}`);
  process.exit(1);
}

// Phase 1: relationship-independent classification of 9c entities.
const idsToDelete = new Set();  // removed entirely (relationships referencing them are dropped)
const idRemap = new Map();       // 9c id -> canonical id (relationships remapped, then removed)
const candidates = new Set();    // 9c entities that survive only if they stay served-reachable
const reason = { alias: 0, exactDup: 0, orphan: 0, survive: 0 };

for (const e of entities) {
  if (!is9c(e)) continue;
  const id = e.entity_id;
  const nk = nameKey(e.entity_name);

  const alias = aliasTargetId.get(nk);
  if (alias && alias !== id) { idRemap.set(id, alias); idsToDelete.add(id); reason.alias++; continue; }

  const dup = preByNameType.get(`${nk}|${e.entity_type}`);
  if (dup && dup !== id) { idRemap.set(id, dup); idsToDelete.add(id); reason.exactDup++; continue; }

  // Everything else (including generic-group Persons) is a candidate: it
  // survives if a served relationship keeps it reachable, and drops as an
  // ordinary orphan otherwise. Generics are deferred to curation, not deleted
  // here -- see the header note.
  candidates.add(id);
}

// Resolve an entity id through the alias/dup remap (canonical id, or itself).
const remap = id => idRemap.get(id) || id;

// A relationship survives iff, after remap, neither endpoint is deleted and the
// remap has not collapsed it to a self-loop. Returns the post-remap endpoints.
// Endpoints are guaranteed non-blank here (the malformed-relationship guard above
// refused the run otherwise), and remap never turns a non-blank id blank.
function survivingEndpoints(r) {
  const s = remap(r.source_entity_id), t = remap(r.target_entity_id);
  if (idsToDelete.has(s) || idsToDelete.has(t)) return null;
  const remapped = s !== r.source_entity_id || t !== r.target_entity_id;
  if (remapped && s && s === t) return null;  // remap-created self-loop
  return { s, t, remapped };
}

// Phase 2: fixpoint orphan removal. A candidate survives only if it is an endpoint
// of a surviving relationship whose source record is served. Dropping an orphan
// removes its relationships, which can strand another candidate, so iterate until
// no new orphans appear. This makes "surviving but unreachable" impossible rather
// than something to detect afterward. Only 9c candidates can be dropped here --
// pre-9c entities keep their pre-9c relationships, which this cleanup never drops.
for (;;) {
  const assoc = new Set();
  for (const r of relationships) {
    if (!servedIds.has((r.source_record_id || '').trim())) continue;
    const ep = survivingEndpoints(r);
    if (!ep) continue;
    assoc.add(ep.s); assoc.add(ep.t);
  }
  const newOrphans = [...candidates].filter(id => !assoc.has(id));
  if (!newOrphans.length) break;
  for (const id of newOrphans) { idsToDelete.add(id); candidates.delete(id); reason.orphan++; }
}
reason.survive = candidates.size;

// Delete-only ids (dropped, not remapped): relationships referencing them are removed.
const deleteOnly = new Set([...idsToDelete].filter(id => !idRemap.has(id)));

// Rebuild entities: drop deleted/remapped rows; merge remapped mention counts into canonical.
const mentionAdd = new Map();
for (const [from] of idRemap) {
  const src = entities.find(e => e.entity_id === from);
  if (!src) continue;
  const to = idRemap.get(from);
  mentionAdd.set(to, (mentionAdd.get(to) || 0) + (parseInt(src.total_mentions, 10) || 0));
}
const keptEntities = entities.filter(e => !idsToDelete.has(e.entity_id));
const keptById = new Map(keptEntities.map(e => [e.entity_id, e]));
for (const [id, add] of mentionAdd) {
  const e = keptById.get(id);
  if (e && add > 0) e.total_mentions = String((parseInt(e.total_mentions, 10) || 0) + add);
}

// Rebuild relationships with the same surviving-relationship rule used above, so
// the kept edges exactly match the reachability the fixpoint converged on.
let relRemapped = 0, relDropped = 0;
const keptRelationships = [];
for (const r of relationships) {
  const ep = survivingEndpoints(r);
  if (!ep) { relDropped++; continue; }
  const out = { ...r };
  if (ep.s !== r.source_entity_id) {
    out.source_entity_id = ep.s;
    out.source_entity_name = keptById.get(ep.s)?.entity_name ?? out.source_entity_name;
    relRemapped++;
  }
  if (ep.t !== r.target_entity_id) {
    out.target_entity_id = ep.t;
    out.target_entity_name = keptById.get(ep.t)?.entity_name ?? out.target_entity_name;
    relRemapped++;
  }
  keptRelationships.push(out);
}

// Recompute first_mention_record_id for surviving 9c entities whose current first
// mention is not a served record that actually CONTAINS the entity. "Served" is
// not enough: a relationship dropped or remapped by this cleanup can leave the
// entity's old first-mention record served but no longer linking it, so the UI
// would open that record and not find the entity. servedRecordsFor is built the
// same way the exporter builds recordEntityMap (source record served, both
// endpoints linked), so a first mention chosen from it is one the UI can open.
const servedRecordsFor = new Map();  // entityId -> Set of served records that contain it
for (const r of keptRelationships) {
  const rec = (r.source_record_id || '').trim();
  if (!servedIds.has(rec)) continue;
  for (const eid of [r.source_entity_id, r.target_entity_id]) {
    if (!eid) continue;
    if (!servedRecordsFor.has(eid)) servedRecordsFor.set(eid, new Set());
    servedRecordsFor.get(eid).add(rec);
  }
}
// The earliest containing served record, keyed by (date, id) so a repointed
// first_mention keeps its "earliest mention" meaning and the pick is
// deterministic regardless of relationship-file order. An undated record sorts
// last (9999-...) so a dated record is preferred when both contain the entity.
const dateKey = rec => `${recordDate.get(rec) || '9999-99-99'}|${rec}`;
const earliestServedFor = new Map();
for (const [eid, recs] of servedRecordsFor) {
  let best = null;
  for (const rec of recs) if (best === null || dateKey(rec) < dateKey(best)) best = rec;
  earliestServedFor.set(eid, best);
}
const firstMentionContains = e => {
  const cur = (e.first_mention_record_id || '').trim();
  return !!cur && !!servedRecordsFor.get(e.entity_id)?.has(cur);
};
let fmFixed = 0;
for (const e of keptEntities) {
  if (!is9c(e)) continue;
  if (firstMentionContains(e)) continue;
  const repl = earliestServedFor.get(e.entity_id);
  if (repl) { e.first_mention_record_id = repl; fmFixed++; }
}

// Guards: the rebuilt graph must have no dangling relationship endpoints, no
// surviving 9c entity whose first mention is not a served record that contains
// it, and no surviving 9c entity that is unreachable from any served record (the
// orphan condition the fixpoint exists to eliminate -- computed the same way
// export builds recordEntityMap: source record served, links to both endpoints).
const keptIds = new Set(keptEntities.map(e => e.entity_id));
const dangling = keptRelationships.filter(r =>
  (r.source_entity_id && !keptIds.has(r.source_entity_id)) ||
  (r.target_entity_id && !keptIds.has(r.target_entity_id)));
const badFirstMention = keptEntities.filter(e => is9c(e) && !firstMentionContains(e));
const reachable = new Set();
for (const r of keptRelationships) {
  if (!servedIds.has((r.source_record_id || '').trim())) continue;
  if (r.source_entity_id) reachable.add(r.source_entity_id);
  if (r.target_entity_id) reachable.add(r.target_entity_id);
}
const strandedOrphans = keptEntities.filter(e => is9c(e) && !reachable.has(e.entity_id));

console.log('=== 9c slice quality cleanup ===');
console.log(`entities: ${entities.length} -> ${keptEntities.length}`);
console.log(`  remap(alias=${reason.alias}, exact-dup=${reason.exactDup}) delete(orphan=${reason.orphan}) survive=${reason.survive}`);
console.log(`relationships: ${relationships.length} -> ${keptRelationships.length} (remapped ${relRemapped}, dropped ${relDropped})`);
console.log(`first_mention repointed to the earliest containing served record: ${fmFixed}`);
console.log(`guards: dangling endpoints=${dangling.length}, first mentions not in a containing served record=${badFirstMention.length}, stranded 9c orphans=${strandedOrphans.length}`);

if (dangling.length || badFirstMention.length || strandedOrphans.length) {
  console.error('REFUSING: guard violation.');
  if (dangling.length) console.error('  sample dangling:', dangling.slice(0, 5).map(r => r.relationship_id).join(', '));
  if (badFirstMention.length) console.error('  sample bad first mention:', badFirstMention.slice(0, 5).map(e => `${e.entity_id}:${e.first_mention_record_id || '(blank)'}`).join(', '));
  if (strandedOrphans.length) console.error('  sample stranded:', strandedOrphans.slice(0, 5).map(e => `${e.entity_id}:${e.entity_name}`).join(', '));
  process.exit(1);
}

if (!APPLY) {
  console.log('\ndry run: nothing written. Re-run with --apply to write the CSVs.');
  process.exit(0);
}

// Match the source CSVs' serialization so untouched rows stay byte-identical and
// the diff shows only the rows this script changes: CRLF between records, but
// fields hold bare-LF newlines internally (multi-line context snippets), so
// quoted_match forces those fields to be quoted -- csv-stringify keys quoting off
// record_delimiter alone and would otherwise emit an unquoted embedded newline
// (invalid CSV). Verified byte-identical against a pure round-trip of HEAD.
const stringifyOpts = { header: true, record_delimiter: '\r\n', quoted_match: /[\r\n]/ };
writeFileSync(ENTITIES_PATH, stringify(keptEntities, { ...stringifyOpts, columns: ENTITY_COLUMNS }));
writeFileSync(RELATIONSHIPS_PATH, stringify(keptRelationships, { ...stringifyOpts, columns: RELATIONSHIP_COLUMNS }));
console.log('\napplied. Regenerate JSON: node data/export-archive-data.js');
