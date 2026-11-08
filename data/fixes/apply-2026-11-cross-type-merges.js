/**
 * apply-2026-11-cross-type-merges.js
 *
 * Applies the existing cross-type duplicate rules (issue #875) and records each
 * merge in data/entity-merges.csv (issue #874).
 *
 * fix-cross-type-duplicates.js was run once, long ago. Later extraction slices
 * brought back a second row, under another type, for seventeen names that it
 * already has a rule for: "Meet the Press" as a Work beside the Organization,
 * "Personal Democracy Forum" as an Organization beside the Event, and so on.
 * This script applies those same rules (data/fixes/cross-type-duplicate-rules.js)
 * to the current tables:
 *
 *   1. The retired row leaves extracted_entities.csv. Its mention count folds
 *      into the row that stays, the first kept row in file order, which is the
 *      row the original script would have kept.
 *   2. Every relationship naming the retired id, as source or target, is
 *      re-pointed at the canonical id and name. Any related_entities list that
 *      names it is re-pointed too.
 *   3. One row per merge is appended to data/entity-merges.csv, so a link that
 *      still carries the retired id can be sent on to the canonical entity.
 *   4. The relationship-type census is recounted, because moving an endpoint
 *      from a Work row to an Organization row changes which rows diverge from
 *      a type's declared endpoints.
 *
 * Names listed in HELD_FOR_CURATOR are skipped, with the reason printed.
 *
 * Rows the script does not change are never re-serialized (see
 * data/lib/csv-record-surgery.js), and nothing is written until every edited
 * file re-parses to exactly the records intended.
 *
 * This does not regenerate the derived JSON. Afterwards run, in order:
 *
 *     node data/fixes/apply-2026-11-cross-type-merges.js
 *     node scripts/validate-graph-data.mjs
 *     node data/export-archive-data.js
 *
 * Usage: node data/fixes/apply-2026-11-cross-type-merges.js [--dry-run]
 * Re-runs are a no-op: with the retired rows gone there is nothing to merge.
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { stringify } from 'csv-stringify/sync';
import {
  loadCsv,
  renderCsv,
  serializeRecord,
  verifyEdit,
} from '../lib/csv-record-surgery.js';
import { unescapeRow } from '../lib/csv-unescape.js';
import { refreshRelationshipTypeCensus } from '../lib/graph-policy-refresh.js';
import { ENTITY_MERGE_COLUMNS, parseEntityMerges, buildEntityRedirects } from '../lib/entity-merges.js';
import { CROSS_TYPE_RULES, HELD_FOR_CURATOR } from './cross-type-duplicate-rules.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENTITIES_PATH = path.join(DATA_DIR, 'extracted_entities.csv');
const RELATIONSHIPS_PATH = path.join(DATA_DIR, 'extracted_relationships.csv');
const MERGES_PATH = path.join(DATA_DIR, 'entity-merges.csv');
const REGISTRY_PATH = path.join(DATA_DIR, 'relationship-type-registry.json');
const MERGED_ON = '2026-11-08';
const ISSUE = '#875';

/** Pick the merges the rules call for in the current entity table. */
function planMerges(entityRecords) {
  const byName = new Map();
  for (const record of entityRecords) {
    if (!byName.has(record.entity_name)) byName.set(record.entity_name, []);
    byName.get(record.entity_name).push(record);
  }

  const merges = [];
  const held = [];
  for (const [name, group] of byName) {
    if (new Set(group.map((record) => record.entity_type)).size < 2) continue;
    const rule = CROSS_TYPE_RULES[name];
    if (!Array.isArray(rule)) continue;
    const keepTypes = new Set(rule);
    const kept = group.filter((record) => keepTypes.has(record.entity_type));
    const retired = group.filter((record) => !keepTypes.has(record.entity_type));
    if (!kept.length || !retired.length) continue;
    if (HELD_FOR_CURATOR[name]) {
      held.push({ name, reason: HELD_FOR_CURATOR[name] });
      continue;
    }
    const canonical = kept[0];
    for (const record of retired) {
      merges.push({
        name,
        retired: record,
        canonical,
        reason: `Same ${name} as ${canonical.entity_type} ${canonical.entity_id}; `
          + `the cross-type rule keeps ${rule.join(' and ')}.`,
      });
    }
  }
  return { merges, held };
}

function writeAtomically(filePath, text) {
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, text, 'utf-8');
  renameSync(tmp, filePath);
}

/** Rebuild a CSV, re-serializing only the records `edit` changes or drops. */
function applyPlan(file, edit) {
  const raws = [];
  const expected = [];
  let edited = 0;
  let removed = 0;
  for (const entry of file.entries) {
    const next = edit(entry.record);
    if (next === null) {
      removed++;
      continue;
    }
    if (next === entry.record) {
      raws.push(entry.raw);
      expected.push(entry.record);
      continue;
    }
    raws.push(serializeRecord(next, file.columns));
    expected.push(next);
    edited++;
  }
  return { text: renderCsv(file, raws), expected, edited, removed };
}

function main() {
  const failures = [];
  const entities = loadCsv(readFileSync(ENTITIES_PATH, 'utf-8'));
  const relationships = loadCsv(readFileSync(RELATIONSHIPS_PATH, 'utf-8'));
  const mergesText = readFileSync(MERGES_PATH, 'utf-8');
  const existingMerges = parseEntityMerges(mergesText);

  const { merges, held } = planMerges(entities.entries.map((entry) => entry.record));
  for (const { name, reason } of held) console.log(`  HELD: "${name}" -- ${reason}`);
  if (!merges.length) {
    console.log('No rule-backed cross-type duplicates left to merge.');
    return;
  }

  const remap = new Map(merges.map((merge) => [merge.retired.entity_id, merge.canonical]));
  const addedMentions = new Map();
  for (const { retired, canonical } of merges) {
    const add = parseInt(retired.total_mentions, 10) || 0;
    addedMentions.set(canonical.entity_id, (addedMentions.get(canonical.entity_id) || 0) + add);
    console.log(
      `  MERGE: "${retired.entity_name}" ${retired.entity_type} ${retired.entity_id} -> `
      + `${canonical.entity_type} ${canonical.entity_id} (+${add} mentions)`,
    );
  }

  const repointList = (value) => {
    if (!value) return value;
    const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
    if (!ids.some((id) => remap.has(id))) return value;
    const next = [];
    for (const id of ids) {
      const resolved = remap.has(id) ? remap.get(id).entity_id : id;
      if (!next.includes(resolved)) next.push(resolved);
    }
    return next.join(', ');
  };

  const entityPlan = applyPlan(entities, (record) => {
    if (remap.has(record.entity_id)) return null;
    const add = addedMentions.get(record.entity_id) || 0;
    const related = repointList(record.related_entities);
    if (!add && related === record.related_entities) return record;
    return {
      ...record,
      total_mentions: add ? String((parseInt(record.total_mentions, 10) || 0) + add) : record.total_mentions,
      related_entities: related,
    };
  });

  let selfLinks = 0;
  const relationshipPlan = applyPlan(relationships, (record) => {
    const source = remap.get(record.source_entity_id);
    const target = remap.get(record.target_entity_id);
    if (!source && !target) return record;
    const next = { ...record };
    if (source) {
      next.source_entity_id = source.entity_id;
      next.source_entity_name = source.entity_name;
    }
    if (target) {
      next.target_entity_id = target.entity_id;
      next.target_entity_name = target.entity_name;
    }
    if (next.source_entity_id === next.target_entity_id) selfLinks++;
    return next;
  });
  if (selfLinks) failures.push(`${selfLinks} relationships would become self-links`);

  const newMergeRows = merges.map(({ retired, canonical, reason }) => ({
    retired_id: retired.entity_id,
    retired_type: retired.entity_type,
    retired_name: retired.entity_name,
    canonical_id: canonical.entity_id,
    merged_on: MERGED_ON,
    issue: ISSUE,
    reason,
  }));
  const mergesOut = (mergesText.endsWith('\n') ? mergesText : `${mergesText}\n`)
    + stringify(newMergeRows, { header: false, columns: ENTITY_MERGE_COLUMNS });

  const ENTITY_COLUMNS = entities.columns;
  const RELATIONSHIP_COLUMNS = relationships.columns;
  for (const [label, text, plan, columns] of [
    ['extracted_entities.csv', entityPlan.text, entityPlan, ENTITY_COLUMNS],
    ['extracted_relationships.csv', relationshipPlan.text, relationshipPlan, RELATIONSHIP_COLUMNS],
  ]) {
    const problems = verifyEdit(text, plan.expected, columns);
    if (problems.length) failures.push(`${label}: ${problems.slice(0, 5).join('; ')}`);
  }

  // The merge table must still describe live entities once the rows are gone.
  const liveIds = new Set(entityPlan.expected.map((record) => record.entity_id));
  try {
    buildEntityRedirects([...existingMerges, ...parseEntityMerges(mergesOut).slice(existingMerges.length)], liveIds);
  } catch (error) {
    failures.push(`entity-merges.csv: ${error.message}`);
  }

  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  const census = refreshRelationshipTypeCensus(registry, {
    relationshipRows: relationshipPlan.expected.map(unescapeRow),
    entityRows: entityPlan.expected.map(unescapeRow),
    asOfDate: MERGED_ON,
  });
  for (const problem of census.problems) failures.push(`relationship-type-registry.json: ${problem}`);

  console.log(`\nEntities: ${entityPlan.removed} removed, ${entityPlan.edited} edited`);
  console.log(`Relationships: ${relationshipPlan.edited} re-pointed`);
  console.log(`Merge table: ${newMergeRows.length} rows appended`);
  for (const change of census.changes) console.log(`Census: ${change}`);

  if (failures.length) {
    console.error('\nRefusing to write:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  if (DRY_RUN) {
    console.log('\nDry run: nothing written.');
    return;
  }

  writeAtomically(ENTITIES_PATH, entityPlan.text);
  writeAtomically(RELATIONSHIPS_PATH, relationshipPlan.text);
  writeAtomically(MERGES_PATH, mergesOut);
  if (census.changes.length) {
    writeAtomically(REGISTRY_PATH, `${JSON.stringify(census.registry, null, 2)}\n`);
  }
  console.log('\nWritten.');
}

main();
