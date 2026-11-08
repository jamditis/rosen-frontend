/**
 * fix-2026-11-shared-opening-raw-text.js
 *
 * Restores raw_text on the two records the shared-opening audit (issue #864)
 * found carrying another work's text, where the right text was already in the
 * repository. The audit is docs/research/2026-11-shared-opening-raw-text-audit.md.
 *
 * 1. RECORD-00029, "Asymmetry between the major parties fries the circuits of
 *    the mainstream press" (PressThink, 2016), stored the auto-caption
 *    transcript of RECORD-00030, a two-minute IRE video on crowdsourcing. Its
 *    own text comes from the PressThink source journal,
 *    preservation/pressthink/versions.jsonl, whose version for WordPress post
 *    9172 is linked to RECORD-00029. The record's 15 extracted relationships
 *    already quote the essay, so the graph needs no change.
 * 2. RECORD-00161, "Tough Guy Journalism More in Vogue in LA" (PressThink,
 *    2003-12-11), stored only the blog's sidebar of older posts. Its body was
 *    stored on RECORD-00162 (the Rodney Benson interview), and the print twin
 *    RECORD-00459 (rutten_ombud_p.html, dropped as a duplicate in d9a8f6f2)
 *    carried the same body. This copies RECORD-00162's text onto RECORD-00161.
 *    RECORD-00162 keeps its wrong text: the Benson interview is not in the
 *    repository, and the relationships extracted from the Rutten text are filed
 *    under RECORD-00162, so moving them is a separate graph decision.
 *
 * Each edit runs only when the record still holds the text the audit found and
 * its source still holds the text the audit cited. A re-run is a no-op, and a
 * record someone has since corrected by other means is left alone.
 *
 * Rows the fix does not change keep their bytes; see
 * data/lib/csv-record-surgery.js. This does not regenerate the derived JSON.
 *
 * Usage: node data/fixes/fix-2026-11-shared-opening-raw-text.js [--dry-run]
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { assertNoPendingCapture } from '../lib/pending-capture.js';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadCsv, renderCsv, serializeRecord, verifyEdit } from '../lib/csv-record-surgery.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECORDS_PATH = path.join(ROOT, 'data', 'archive_records-public.csv');
const JOURNAL_PATH = path.join(ROOT, 'preservation', 'pressthink', 'versions.jsonl');

const CROWDSOURCING_OPENING = 'all right why is crowdsourcing important for journalists';
const SIDEBAR_OPENING = 'The People Formerly Known as the Audience:';
const RUTTEN_OPENING =
  'Tim Rutten of the LA Times has big problems with the new ombudsman at the New York Times.';

/** The text of the newest source version the PressThink journal links to a record. */
function linkedSourceText(recordId, expectedUrlPart) {
  const versions = readFileSync(JOURNAL_PATH, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.record_id === recordId);
  if (versions.length === 0) throw new Error(`no source version is linked to ${recordId}`);
  const latest = versions[versions.length - 1];
  if (!latest.source.url.includes(expectedUrlPart)) {
    throw new Error(`${recordId} is linked to ${latest.source.url}, not the expected post`);
  }
  if (!latest.source.text?.trim()) throw new Error(`${recordId} source version has no text`);
  return { text: latest.source.text, sha256: latest.sha256 };
}

function main() {
  const file = loadCsv(readFileSync(RECORDS_PATH, 'utf-8'));
  const byId = new Map(file.entries.map((entry) => [entry.record.id, entry.record]));
  const replacements = new Map();

  const essay = linkedSourceText(
    'RECORD-00029',
    'asymmetry-between-the-major-parties-fries-the-circuits-of-the-mainstream-press',
  );
  const asymmetry = byId.get('RECORD-00029');
  if (asymmetry.raw_text.startsWith(CROWDSOURCING_OPENING)) {
    replacements.set('RECORD-00029', {
      text: essay.text,
      source: `preservation/pressthink/versions.jsonl, version sha256 ${essay.sha256}`,
    });
  }

  const rutten = byId.get('RECORD-00161');
  const ruttenBody = byId.get('RECORD-00162').raw_text;
  if (rutten.raw_text.startsWith(SIDEBAR_OPENING)) {
    if (!ruttenBody.startsWith(RUTTEN_OPENING)) {
      throw new Error('RECORD-00162 no longer holds the Rutten post body; check the audit');
    }
    replacements.set('RECORD-00161', { text: ruttenBody, source: 'RECORD-00162 raw_text' });
  }

  if (replacements.size === 0) {
    console.log('Nothing to change: both records already hold their own text.');
    return;
  }

  const raws = [];
  const expected = [];
  for (const entry of file.entries) {
    const change = replacements.get(entry.record.id);
    if (!change) {
      raws.push(entry.raw);
      expected.push(entry.record);
      continue;
    }
    const next = { ...entry.record, raw_text: change.text };
    raws.push(serializeRecord(next, file.columns));
    expected.push(next);
    console.log(
      `${entry.record.id}: raw_text ${entry.record.raw_text.length} -> ${change.text.length} chars, from ${change.source}`,
    );
  }

  const text = renderCsv(file, raws);
  const problems = verifyEdit(text, expected, file.columns);
  if (problems.length) {
    throw new Error(`edit did not verify, nothing written:\n${problems.join('\n')}`);
  }
  if (DRY_RUN) {
    console.log('Dry run: nothing written.');
    return;
  }
  assertNoPendingCapture(RECORDS_PATH);
  const tmp = `${RECORDS_PATH}.tmp`;
  writeFileSync(tmp, text, 'utf-8');
  renameSync(tmp, RECORDS_PATH);
  console.log(`Wrote ${RECORDS_PATH}`);
}

main();
