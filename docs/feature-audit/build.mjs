// Build the canonical feature-audit spreadsheet for rosen-frontend.
//
// Source of truth = feature-stories.json (master). This script:
//   1. Reads the 8 stories-0*.json catalog parts (one per feature area).
//   2. Assigns stable IDs (area prefix + padded index, by part order).
//   3. Preserves tracking fields (test/fix/retest) from an existing master,
//      matching on ID, so re-running after a phase never loses results.
//   4. Writes feature-stories.json (master) and feature-stories.csv (the
//      canonical spreadsheet a human opens).
//
// Run: node docs/feature-audit/build.mjs   (from repo root or this dir)

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// part filename -> short ID prefix
const PREFIX = {
  'stories-01-archive-main.json': 'MAIN',
  'stories-02-modals.json': 'MODAL',
  'stories-03-entities-dissertation.json': 'ENT',
  'stories-04-analytics.json': 'ANL',
  'stories-05-services.json': 'SVC',
  'stories-06-reader.json': 'RDR',
  'stories-07-dissertation-tools.json': 'DIS',
  'stories-08-standalone-tools.json': 'TOOL',
};

// Tracking fields filled in during phases 2-4. Initialised empty.
const TRACKING_DEFAULTS = {
  test_status: '',      // pass | fail | blocked | partial | n/a
  errors_found: '',     // free text describing observed errors
  severity: '',         // high | medium | low (for errors)
  fix_status: '',       // fixed | wontfix | deferred | n/a
  fix_applied: '',      // what was changed
  retest_status: '',    // pass | fail | partial
  notes: '',            // anything else
};

// Column order for the CSV.
const COLUMNS = [
  'id', 'area', 'subarea', 'feature', 'user_story', 'expected_behavior',
  'source_files', 'test_notes', 'code_smell',
  'test_status', 'errors_found', 'severity', 'fix_status', 'fix_applied',
  'retest_status', 'notes',
];

function pad(n) { return String(n).padStart(2, '0'); }

// Canonical area bucket, derived from the ID prefix so it is stable regardless
// of the free-text "area" each catalog agent wrote.
function areaFor(prefix) {
  if (['MAIN', 'MODAL', 'ENT', 'ANL'].includes(prefix)) return 'Archive browser';
  if (prefix === 'SVC') return 'Data & services';
  if (['RDR', 'DIS'].includes(prefix)) return 'Dissertation tools';
  if (prefix === 'TOOL') return 'Standalone tools';
  return 'Other';
}

function loadParts() {
  const files = readdirSync(here)
    .filter(f => /^stories-0\d.*\.json$/.test(f))
    .sort();
  const rows = [];
  for (const f of files) {
    const prefix = PREFIX[f];
    if (!prefix) throw new Error(`No ID prefix mapped for part file: ${f}`);
    const arr = JSON.parse(readFileSync(join(here, f), 'utf8'));
    if (!Array.isArray(arr)) throw new Error(`${f} is not a JSON array`);
    arr.forEach((s, i) => {
      const src = Array.isArray(s.source_files) ? s.source_files.join('; ') : (s.source_files || '');
      rows.push({
        id: `${prefix}-${pad(i + 1)}`,
        area: areaFor(prefix),
        subarea: s.subarea || '',
        feature: s.feature || '',
        user_story: s.user_story || '',
        expected_behavior: s.expected_behavior || '',
        source_files: src,
        test_notes: s.test_notes || '',
        code_smell: s.code_smell || '',
        ...TRACKING_DEFAULTS,
      });
    });
  }
  return rows;
}

function mergeTracking(rows, masterPath) {
  if (!existsSync(masterPath)) return rows;
  const old = JSON.parse(readFileSync(masterPath, 'utf8'));
  const byId = new Map(old.map(r => [r.id, r]));
  for (const row of rows) {
    const prev = byId.get(row.id);
    if (!prev) continue;
    for (const k of Object.keys(TRACKING_DEFAULTS)) {
      if (prev[k] !== undefined && prev[k] !== '') row[k] = prev[k];
    }
  }
  return rows;
}

// RFC 4180 CSV field escaping.
function csvField(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function toCsv(rows) {
  const lines = [COLUMNS.map(csvField).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(c => csvField(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}

const masterPath = join(here, 'feature-stories.json');
const csvPath = join(here, 'feature-stories.csv');

let rows = loadParts();
rows = mergeTracking(rows, masterPath);

writeFileSync(masterPath, JSON.stringify(rows, null, 2) + '\n');
writeFileSync(csvPath, toCsv(rows));

// Summary to stdout.
const byArea = {};
for (const r of rows) byArea[r.area] = (byArea[r.area] || 0) + 1;
const tested = rows.filter(r => r.test_status).length;
const failed = rows.filter(r => r.test_status === 'fail' || r.test_status === 'partial').length;
const fixed = rows.filter(r => r.fix_status === 'fixed').length;
const retestPass = rows.filter(r => r.retest_status === 'pass').length;
console.log(`Total stories: ${rows.length}`);
console.log('By area:', JSON.stringify(byArea, null, 0));
console.log(`Tested: ${tested} | Failing/partial: ${failed} | Fixed: ${fixed} | Retest-pass: ${retestPass}`);
console.log(`Wrote ${masterPath}`);
console.log(`Wrote ${csvPath}`);
