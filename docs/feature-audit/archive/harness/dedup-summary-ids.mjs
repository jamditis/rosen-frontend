// One-off: rename the 6 duplicate id="summary" headings in the reader to
// chapter-scoped unique ids (RDR-02 bug class). Line->id map derived from the
// nearest preceding chapter heading. Idempotent: a re-run finds nothing to do.
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'dissertation/reader/index.html';
const map = {
  407: 'chapter-1-summary',
  625: 'chapter-2-summary',
  758: 'chapter-3-summary',
  940: 'chapter-4-summary',
  1128: 'chapter-5-summary',
  1704: 'chapter-7-summary',
};

const lines = readFileSync(path, 'utf8').split('\n');
let changed = 0;
for (const [ln, id] of Object.entries(map)) {
  const i = Number(ln) - 1;
  if (lines[i] && lines[i].includes('id="summary"')) {
    lines[i] = lines[i].replace('id="summary"', `id="${id}"`);
    changed++;
  }
}
writeFileSync(path, lines.join('\n'));
console.log(`renamed ${changed} summary ids`);
