// Merge audit results into the master feature-stories.json, which can then be
// re-rendered to CSV via build.mjs.
//
// Phase 2 verdict shape:  { "MAIN-01": { test_status, errors_found, severity, notes }, ... }
// Phase 3 fix shape:      { "DIS-18": { fix_status, fix_applied }, ... }
// Phase 4 retest shape:   { "MODAL-16": { retest_status, notes } }
//
// Usage:
//   node docs/feature-audit/apply-verdicts.mjs           # apply test_* fields (verdicts-*.json)
//   node docs/feature-audit/apply-verdicts.mjs fix       # apply fix_* fields  (fixes-*.json)
//   node docs/feature-audit/apply-verdicts.mjs retest    # apply retest_status (retest-*.json)

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
const mode = arg === 'retest' ? 'retest' : arg === 'fix' ? 'fix' : 'test';
const masterPath = join(here, 'feature-stories.json');
const master = JSON.parse(readFileSync(masterPath, 'utf8'));
const byId = new Map(master.map(r => [r.id, r]));

const prefix = mode === 'retest' ? 'retest-' : mode === 'fix' ? 'fixes-' : 'verdicts-';
const files = readdirSync(here).filter(f => f.startsWith(prefix) && f.endsWith('.json'));

let applied = 0, missing = [];
for (const f of files) {
  const v = JSON.parse(readFileSync(join(here, f), 'utf8'));
  for (const [id, val] of Object.entries(v)) {
    const row = byId.get(id);
    if (!row) { missing.push(id); continue; }
    if (mode === 'test') {
      if (val.test_status !== undefined) row.test_status = val.test_status;
      if (val.errors_found !== undefined) row.errors_found = val.errors_found;
      if (val.severity !== undefined) row.severity = val.severity;
      if (val.notes !== undefined && val.notes !== '') row.notes = val.notes;
    } else if (mode === 'fix') {
      if (val.fix_status !== undefined) row.fix_status = val.fix_status;
      if (val.fix_applied !== undefined) row.fix_applied = val.fix_applied;
    } else {
      if (val.retest_status !== undefined) row.retest_status = val.retest_status;
      if (val.notes !== undefined && val.notes !== '') {
        row.notes = (row.notes ? row.notes + ' | ' : '') + 'RETEST: ' + val.notes;
      }
    }
    applied++;
  }
}

writeFileSync(masterPath, JSON.stringify(master, null, 2) + '\n');
console.log(`mode=${mode} files=${files.length} applied=${applied}`);
if (missing.length) console.log('WARNING unknown ids:', missing.join(', '));

// status tally
const tallyField = mode === 'fix' ? 'fix_status' : mode === 'retest' ? 'retest_status' : 'test_status';
const tally = {};
for (const r of master) {
  const k = r[tallyField] || '(none)';
  tally[k] = (tally[k] || 0) + 1;
}
console.log(`${tallyField} tally:`, JSON.stringify(tally));
