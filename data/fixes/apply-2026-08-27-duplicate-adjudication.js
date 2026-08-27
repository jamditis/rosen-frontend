/**
 * apply-2026-08-27-duplicate-adjudication.js
 *
 * Applies the curator adjudication of 2026-08-27 (issues #469, #867). The
 * curator ruled on 22 duplicate groups; two rulings change the data.
 *
 * 1. Seven records are truncated twin captures of a post the archive already
 *    holds in a fuller form. Drop them. Each survives in its fuller capture, so
 *    no content leaves the archive.
 * 2. RECORD-00781 stays. It is the same post as RECORD-00658, published on
 *    Posterous, a platform that shut down in 2013. Mark it as a dead-platform
 *    publication and point at a Wayback capture of the live page.
 *
 * The other twenty rulings keep both records, so they need no data change.
 *
 * Dropping a record touches three source CSVs, and this does all three in one
 * pass: it removes the rows, drops the dropped ids out of every surviving
 * related_to list, removes the relationships extracted from those records, and
 * then repairs the entity table. An entity that loses all its evidence is
 * removed rather than kept: an entity with no reachable record still shows in
 * the Explorer and opens with zero results (tests/data-integrity.test.js, "does
 * not orphan entities outside the known pre-existing baseline"). An entity that
 * still has evidence keeps its row and has its first mention moved to the
 * earliest record it genuinely appears in.
 *
 * Editing strategy: rows the migration does not change are never re-serialized.
 * See data/lib/csv-record-surgery.js for why that matters -- these CSVs hold
 * bare-LF newlines inside CRLF records, and a full rewrite changes every row's
 * quoting, or worse, bakes in a wrong record structure. Nothing is written until
 * the edited text has been re-parsed and every field of every surviving record
 * matches what this script intended, so a bad edit aborts instead of landing.
 *
 * This does not regenerate the derived JSON or the embeddings. Run, in order:
 *
 *     node data/fixes/apply-2026-08-27-duplicate-adjudication.js
 *     node data/lib/embeddings-splice.js RECORD-00077 RECORD-00830 ...
 *     node data/export-archive-data.js
 *
 * Usage: node data/fixes/apply-2026-08-27-duplicate-adjudication.js [--dry-run]
 * Re-runs are a no-op: with the records already gone there is nothing to edit.
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  loadCsv,
  renderCsv,
  serializeRecord,
  verifyEdit,
} from '../lib/csv-record-surgery.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RECORDS_PATH = path.join(DATA_DIR, 'archive_records-public.csv');
const RELATIONSHIPS_PATH = path.join(DATA_DIR, 'extracted_relationships.csv');
const ENTITIES_PATH = path.join(DATA_DIR, 'extracted_entities.csv');
// Entities can be first mentioned in a tweet or a Bluesky post, so a first
// mention only counts as dangling when it is in neither source file. Reading
// the records alone would read every social first mention as dangling and move
// it onto an article it was never extracted from.
const SOCIAL_PATH = path.join(DATA_DIR, 'social_posts.csv');

// The seven truncated twin captures, each with the record that supersedes it.
export const DROP_IDS = new Map([
  ['RECORD-00077', 'RECORD-00747'],
  ['RECORD-00830', 'RECORD-00681'],
  ['RECORD-00846', 'RECORD-00685'],
  ['RECORD-00855', 'RECORD-00695'],
  ['RECORD-00857', 'RECORD-00696'],
  ['RECORD-00873', 'RECORD-00692'],
  ['RECORD-00877', 'RECORD-00701'],
]);

// The dead-platform annotation. The record already says Posterous shut down, so
// this entry adds what was missing: that the record is kept on purpose, which
// record carries the same post on a live host, and the capture to read. That
// capture is dated 2010-04-20, two days after the post, and holds the full text;
// the 2012 and 2013 captures are a third of the size because Posterous was
// winding down by then.
const ANNOTATE_ID = 'RECORD-00781';
const ANNOTATION_MARK = '[2026-08-27] Issue #867:';
const ANNOTATION =
  `${ANNOTATION_MARK} kept as a historical dead-platform publication. ` +
  'RECORD-00658 carries the same post on its surviving host. Wayback capture of ' +
  'the live page: https://web.archive.org/web/20100420125457/' +
  'http://jayrosen.posterous.com/david-gregory-no-i-wont-fact-check-my-guests';

/** Split a comma-separated record id list, dropping the empty entries. */
function splitIds(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * The earliest of a set of records, with the id breaking ties. An undated
 * record sorts last, so a dated one always wins. Same rule as
 * data/prune_orphan_references.py, so the two agree on a replacement.
 */
function earliestRecord(recordIds, dateById) {
  return [...recordIds].sort((a, b) => {
    const dateA = dateById.get(a) || '~';
    const dateB = dateById.get(b) || '~';
    return dateA === dateB ? a.localeCompare(b) : dateA.localeCompare(dateB);
  })[0];
}

/**
 * Apply an edit plan to a loaded CSV.
 *
 * @param {object} file the loadCsv result
 * @param {(record: object) => object|null} plan returns the record's new value,
 *   or null to remove the row. Returning the record unchanged keeps its bytes.
 * @returns {{text: string, expected: object[], removed: number, edited: number}}
 */
function applyPlan(file, plan) {
  const raws = [];
  const expected = [];
  let removed = 0;
  let edited = 0;

  for (const entry of file.entries) {
    const next = plan(entry.record);
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

  return { text: renderCsv(file, raws), expected, removed, edited };
}

/** Write an edited CSV, but only after it re-parses to exactly the intended records. */
function commit(filePath, file, result, failures) {
  const problems = verifyEdit(result.text, result.expected, file.columns);
  if (problems.length) {
    failures.push(`${path.basename(filePath)}: ${problems.slice(0, 5).join('; ')}`);
    return;
  }
  if (DRY_RUN) return;
  // Same-directory temp file plus a rename, so an interrupted run never leaves
  // a half-written CSV where the archive's only copy of the data used to be.
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, result.text, 'utf-8');
  renameSync(tmp, filePath);
}

function main() {
  const failures = [];

  const records = loadCsv(readFileSync(RECORDS_PATH, 'utf-8'));
  const social = loadCsv(readFileSync(SOCIAL_PATH, 'utf-8'));

  const missing = [...DROP_IDS.keys()].filter(
    (id) => !records.entries.some((entry) => entry.record.id === id),
  );
  const alreadyDone = missing.length === DROP_IDS.size;

  const recordPlan = applyPlan(records, (record) => {
    if (DROP_IDS.has(record.id)) return null;
    const related = splitIds(record.related_to);
    const kept = related.filter((id) => !DROP_IDS.has(id));
    const notes = record.notes || '';
    const needsNote = record.id === ANNOTATE_ID && !notes.includes(ANNOTATION_MARK);
    if (kept.length === related.length && !needsNote) return record;
    return {
      ...record,
      related_to: kept.length === related.length ? record.related_to : kept.join(', '),
      notes: needsNote ? (notes.trim() ? `${notes} | ${ANNOTATION}` : ANNOTATION) : notes,
    };
  });

  // The ids a first mention or a relationship may still point at, once the seven
  // records are gone.
  const validIds = new Set(recordPlan.expected.map((record) => record.id));
  for (const entry of social.entries) validIds.add(entry.record.id);
  const dateById = new Map(
    [...recordPlan.expected, ...social.entries.map((entry) => entry.record)].map((record) => [
      record.id,
      record.publication_date || '',
    ]),
  );

  const relationships = loadCsv(readFileSync(RELATIONSHIPS_PATH, 'utf-8'));
  const droppedEndpoints = new Set();
  const evidenceByEntity = new Map();
  for (const { record } of relationships.entries) {
    const endpoints = [record.source_entity_id, record.target_entity_id].filter(Boolean);
    if (DROP_IDS.has(record.source_record_id)) {
      for (const id of endpoints) droppedEndpoints.add(id);
      continue;
    }
    if (!validIds.has(record.source_record_id)) continue;
    for (const id of endpoints) {
      if (!evidenceByEntity.has(id)) evidenceByEntity.set(id, new Set());
      evidenceByEntity.get(id).add(record.source_record_id);
    }
  }

  const relationshipPlan = applyPlan(relationships, (record) =>
    DROP_IDS.has(record.source_record_id) ? null : record,
  );

  const entities = loadCsv(readFileSync(ENTITIES_PATH, 'utf-8'));
  const entityPlan = applyPlan(entities, (record) => {
    const entityId = record.entity_id;
    const firstMention = record.first_mention_record_id;
    const dangling = Boolean(firstMention) && !validIds.has(firstMention);
    const hasEvidence = evidenceByEntity.has(entityId);
    if (!hasEvidence && (droppedEndpoints.has(entityId) || dangling)) return null;
    if (!dangling) return record;
    return {
      ...record,
      first_mention_record_id: earliestRecord(evidenceByEntity.get(entityId), dateById),
    };
  });

  commit(RECORDS_PATH, records, recordPlan, failures);
  commit(RELATIONSHIPS_PATH, relationships, relationshipPlan, failures);
  commit(ENTITIES_PATH, entities, entityPlan, failures);

  console.log(`\nDuplicate adjudication migration${DRY_RUN ? ' (dry run)' : ''}`);
  if (alreadyDone) console.log('  the seven records are already gone; nothing to do');
  else if (missing.length) console.log(`  not in the CSV, skipped: ${missing.join(', ')}`);
  console.log(`  records removed        : ${recordPlan.removed}`);
  console.log(`  record rows edited     : ${recordPlan.edited}`);
  console.log(`  relationships removed  : ${relationshipPlan.removed}`);
  console.log(`  entities removed       : ${entityPlan.removed}`);
  console.log(`  entity rows edited     : ${entityPlan.edited}`);

  if (failures.length) {
    console.error('\nAborted without writing: the edit did not verify.');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
}

main();
