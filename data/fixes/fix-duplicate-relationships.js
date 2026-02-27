import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const CSV_PATH = decodeURIComponent(new URL('../extracted_relationships.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

const raw = readFileSync(CSV_PATH, 'utf-8');
const records = parse(raw, { columns: true, skip_empty_lines: true });

const seen = new Set();
const deduped = [];
let dupeCount = 0;

for (const row of records) {
  if (seen.has(row.relationship_id)) {
    dupeCount++;
    continue;
  }
  seen.add(row.relationship_id);
  deduped.push(row);
}

const columns = [
  'relationship_id', 'source_record_id', 'source_entity_id', 'source_entity_name',
  'relationship_type', 'target_entity_id', 'target_entity_name',
  'context_snippet', 'confidence_score', 'extracted_date'
];

const output = stringify(deduped, { header: true, columns });
writeFileSync(CSV_PATH, output);

console.log(`Before: ${records.length} rows`);
console.log(`Duplicates removed: ${dupeCount}`);
console.log(`After: ${deduped.length} rows`);
