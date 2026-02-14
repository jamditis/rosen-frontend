/**
 * Fix 6 duplicate URLs in archive_records-public.csv
 *
 * Each URL appears in two records. This script removes the less complete
 * duplicate from each pair, keeping the better-curated record.
 *
 * Decisions:
 * 1. current.org/the-pub-62: Keep RECORD-00772 (correct audio format, better notes), remove RECORD-00583
 * 2. cjr.org/kicker: Keep RECORD-00802 (more filled fields, word count), remove RECORD-00742
 * 3. edge.org/memberbio: Keep RECORD-00072 (most filled fields: 26), remove RECORD-00775
 * 4. msnbc.com/11th-hour: Keep RECORD-00738 (has excerpt, correct date), remove RECORD-00796
 * 5. pbs.org/newshour/brief: Keep RECORD-00777 (verified, more fields), remove RECORD-00055
 * 6. vox.com transcript: Keep RECORD-00751 (verified, pull quote, good notes), remove RECORD-00093
 */

import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFileSync, writeFileSync } from 'fs';

const CSV_PATH = 'data/archive_records-public.csv';

const REMOVE_IDS = new Set([
  'RECORD-00583', // dup of RECORD-00772 (current.org/the-pub-62)
  'RECORD-00742', // dup of RECORD-00802 (cjr.org/kicker)
  'RECORD-00775', // dup of RECORD-00072 (edge.org/memberbio)
  'RECORD-00796', // dup of RECORD-00738 (msnbc.com/11th-hour)
  'RECORD-00055', // dup of RECORD-00777 (pbs.org/newshour/brief)
  'RECORD-00093', // dup of RECORD-00751 (vox.com transcript)
]);

const csv = readFileSync(CSV_PATH, 'utf-8');
const records = parse(csv, { columns: true });

const beforeCount = records.length;
console.log(`Before: ${beforeCount} records`);

const filtered = records.filter(r => {
  if (REMOVE_IDS.has(r.id)) {
    console.log(`  Removing ${r.id}: ${r.title}`);
    return false;
  }
  return true;
});

const afterCount = filtered.length;
console.log(`After: ${afterCount} records`);
console.log(`Removed: ${beforeCount - afterCount} records`);

if (beforeCount - afterCount !== 6) {
  console.error('ERROR: Expected to remove exactly 6 records');
  process.exit(1);
}

const output = stringify(filtered, {
  header: true,
  columns: Object.keys(records[0]),
});

writeFileSync(CSV_PATH, output);
console.log('CSV updated successfully.');
