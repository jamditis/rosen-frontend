/**
 * fix-dangling-related-to.js
 *
 * Clears the related_to entries that name records the archive no longer holds
 * (issue #871). Earlier removals -- the PressThink _p.html dedup
 * (data/dedup_records.py), the duplicate-URL fix (fix-duplicate-urls.js), the
 * duplicate report's removals, and the 2025 cleanups of the RECORD-006xx
 * placeholders -- deleted rows without cleaning the lists that pointed at them.
 *
 * Each dangling id is adjudicated in docs/research/2026-11-related-to-dangling-ids.md.
 * REPOINT holds the ids whose removal the repository documents as a merge into
 * a named surviving record; every other dangling id is dropped. A re-pointed
 * id that would duplicate an entry already in the list, or point a record at
 * itself, is dropped instead.
 *
 * Five rows joined their ids with semicolons, so a comma split read each pair
 * as one unknown id. Those ids all exist, and the lists are rewritten with the
 * ", " separator every other row uses.
 *
 * The run fails closed: a dangling id that is in neither REPOINT nor DROP
 * stops it, so a later removal is adjudicated rather than silently dropped.
 *
 * Editing strategy: only the related_to cell of a changed row is rewritten,
 * inside that row's own source text. Every other byte of the file, including
 * the other cells of the edited rows, is left as it was. The edited text is
 * re-parsed and every field of every record compared with what this script
 * intended before anything is written (data/lib/csv-record-surgery.js).
 *
 * Usage: node data/fixes/fix-dangling-related-to.js [--dry-run]
 * Re-runs are a no-op.
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { stringify } from 'csv-stringify/sync';
import { loadCsv, renderCsv, verifyEdit } from '../lib/csv-record-surgery.js';

const DRY_RUN = process.argv.includes('--dry-run');
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS_PATH = path.join(DATA_DIR, 'archive_records-public.csv');
const SOCIAL_PATH = path.join(DATA_DIR, 'social_posts.csv');

// Removed record -> the surviving record the repository says replaced it.
export const REPOINT = new Map([
  ['RECORD-00055', 'RECORD-00777'], // data/fixes/fix-duplicate-urls.js
  ['RECORD-00583', 'RECORD-00772'], // data/fixes/fix-duplicate-urls.js
  ['RECORD-00108', 'RECORD-00056'], // data/quality-reports/duplicate-report.txt, pair 3-1
  ['RECORD-00521', 'RECORD-00200'], // data/quality-reports/duplicate-report.txt, pair 3-4
  ['RECORD-00570', 'RECORD-00918'], // duplicate-report.txt pair 3-2, then the #863 split
  ['TUMBLR-00062', 'RECORD-00662'], // data/quality-reports/duplicate-report.txt, group 2B
]);

// Removed records with no documented successor.
export const DROP = new Set([
  'RECORD-00006', 'RECORD-00007', 'RECORD-00008',
  'RECORD-00015', 'RECORD-00016', 'RECORD-00017', 'RECORD-00018', 'RECORD-00019',
  'RECORD-00611', 'RECORD-00615', 'RECORD-00616',
  'RECORD-00620', 'RECORD-00621', 'RECORD-00622', 'RECORD-00623',
  'RECORD-00625', 'RECORD-00627', 'RECORD-00628', 'RECORD-00631',
]);

const SEPARATOR = ', ';

/** Split a related_to list on commas and semicolons, dropping empty entries. */
function splitIds(value) {
  return String(value || '')
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Serialize one cell the way csv-stringify writes it into the file. */
function serializeCell(value) {
  if (value === '') return '';
  return stringify([[value]], { header: false, record_delimiter: '\r\n' }).replace(/\r\n$/, '');
}

/** The related_to list a record should carry, given the ids that still exist. */
export function repairRelatedTo(record, knownIds) {
  const ids = splitIds(record.related_to);
  const kept = [];
  for (const id of ids) {
    let target = id;
    if (!knownIds.has(id)) {
      if (REPOINT.has(id)) target = REPOINT.get(id);
      else if (DROP.has(id)) continue;
      else throw new Error(`${record.id}.related_to names ${id}, which is not adjudicated`);
      if (!knownIds.has(target)) throw new Error(`${id} re-points to missing ${target}`);
    }
    if (target === record.id || kept.includes(target)) continue;
    kept.push(target);
  }
  return kept.join(SEPARATOR);
}

/** Rewrite the related_to cell inside one record's source text. */
function replaceCell(raw, oldValue, newValue, recordId) {
  const needle = `,${serializeCell(oldValue)},`;
  const first = raw.indexOf(needle);
  if (first === -1 || raw.indexOf(needle, first + 1) !== -1) {
    throw new Error(`${recordId}: related_to cell is not uniquely locatable in its row`);
  }
  return raw.slice(0, first) + `,${serializeCell(newValue)},` + raw.slice(first + needle.length);
}

export function planEdit(recordsText, socialText) {
  const records = loadCsv(recordsText);
  const social = loadCsv(socialText);
  const knownIds = new Set([
    ...records.entries.map((entry) => entry.record.id),
    ...social.entries.map((entry) => entry.record.id),
  ]);

  const raws = [];
  const expected = [];
  const changed = [];
  for (const { record, raw } of records.entries) {
    const next = repairRelatedTo(record, knownIds);
    if (next === record.related_to) {
      raws.push(raw);
      expected.push(record);
      continue;
    }
    raws.push(replaceCell(raw, record.related_to, next, record.id));
    expected.push({ ...record, related_to: next });
    changed.push({ id: record.id, before: record.related_to, after: next });
  }

  const text = renderCsv(records, raws);
  const problems = verifyEdit(text, expected, records.columns);
  if (problems.length) throw new Error(`edit failed verification:\n${problems.join('\n')}`);
  return { text, changed };
}

function main() {
  const recordsText = readFileSync(RECORDS_PATH, 'utf-8');
  const { text, changed } = planEdit(recordsText, readFileSync(SOCIAL_PATH, 'utf-8'));
  for (const change of changed) console.log(`${change.id}: "${change.before}" -> "${change.after}"`);
  console.log(`${changed.length} related_to cells ${DRY_RUN ? 'would change' : 'changed'}`);
  if (DRY_RUN || changed.length === 0) return;
  const tmp = `${RECORDS_PATH}.tmp`;
  writeFileSync(tmp, text, 'utf-8');
  renameSync(tmp, RECORDS_PATH);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
