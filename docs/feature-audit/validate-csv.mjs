// Round-trip validate feature-stories.csv: parse it back and confirm every
// data row has exactly as many fields as the header. Catches escaping bugs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const txt = readFileSync(join(here, 'feature-stories.csv'), 'utf8');

function parseCSV(s) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\r') { /* skip */ }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCSV(txt);
const header = rows[0];
const body = rows.slice(1).filter(r => r.length > 1);
const bad = body.filter(r => r.length !== header.length);

console.log('header cols:', header.length);
console.log('data rows:', body.length);
console.log('rows with wrong column count:', bad.length);
if (bad.length) {
  console.log('first bad row id:', bad[0][0], 'cols:', bad[0].length);
  process.exit(1);
}
console.log('sample row:', body[0][0], '|', body[0][1], '|', body[0][3]);
console.log('OK: CSV round-trips cleanly.');
