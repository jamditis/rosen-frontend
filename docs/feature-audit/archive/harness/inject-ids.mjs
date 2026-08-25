// One-off: freeze the current positional audit IDs into the story source parts
// so IDs become intrinsic instead of array-index-derived. After this runs,
// build.mjs reads s.id directly, so inserting, reordering, or deleting a story
// no longer renumbers its siblings and mergeTracking() can never re-attach a
// phase 2/3/4 verdict to the wrong feature.
//
// Line-based on purpose: it inserts only the `"id"` line and leaves every other
// byte of the source parts untouched, so the diff is the 166 new id lines and
// nothing else. The story schema has no nested objects (values are strings or
// arrays of strings), so a line that is exactly "  {" is always a top-level
// story object opening. Idempotent: re-running inserts nothing and throws if an
// existing id is inconsistent with its position.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..'); // docs/feature-audit

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
const pad = n => String(n).padStart(2, '0');

let total = 0, added = 0;
for (const [f, prefix] of Object.entries(PREFIX)) {
  const p = join(root, f);
  const lines = readFileSync(p, 'utf8').split('\n');
  const out = [];
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    if (line === '  {') {
      idx++; total++;
      const wantId = `${prefix}-${pad(idx)}`;
      const next = lines[i + 1] || '';
      const m = next.match(/^\s*"id":\s*"([^"]+)"/);
      if (m) {
        if (m[1] !== wantId) throw new Error(`${f} object ${idx} has id ${m[1]}, expected ${wantId}`);
        continue; // already present and correct
      }
      out.push(`    "id": "${wantId}",`);
      added++;
    }
  }
  writeFileSync(p, out.join('\n'));
}
console.log(`parts=${Object.keys(PREFIX).length} stories=${total} ids_added=${added}`);
