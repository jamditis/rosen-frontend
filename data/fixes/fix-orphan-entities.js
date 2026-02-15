import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// Resolve paths (Windows drive letter fix for import.meta.url)
const entitiesPath = new URL('../extracted_entities.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const relationshipsPath = new URL('../extracted_relationships.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const recordsPath = new URL('../archive_records-public.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// Load all three CSVs
const entities = parse(readFileSync(entitiesPath, 'utf-8'), { columns: true, skip_empty_lines: true });
const relationships = parse(readFileSync(relationshipsPath, 'utf-8'), { columns: true, skip_empty_lines: true });
const records = parse(readFileSync(recordsPath, 'utf-8'), { columns: true, skip_empty_lines: true });

// Build set of valid record IDs
const validRecordIds = new Set(records.map(r => r.id));
console.log(`Valid records in archive: ${validRecordIds.size}`);

// The 46 orphan record IDs
const orphanRecordIds = new Set([
  'RECORD-00006', 'RECORD-00019', 'RECORD-00168', 'RECORD-00172', 'RECORD-00182',
  'RECORD-00188', 'RECORD-00232', 'RECORD-00233', 'RECORD-00236', 'RECORD-00240',
  'RECORD-00243', 'RECORD-00246', 'RECORD-00248', 'RECORD-00260', 'RECORD-00277',
  'RECORD-00282', 'RECORD-00284', 'RECORD-00285', 'RECORD-00287', 'RECORD-00290',
  'RECORD-00296', 'RECORD-00302', 'RECORD-00308', 'RECORD-00322', 'RECORD-00334',
  'RECORD-00341', 'RECORD-00346', 'RECORD-00378', 'RECORD-00381', 'RECORD-00392',
  'RECORD-00399', 'RECORD-00403', 'RECORD-00405', 'RECORD-00447', 'RECORD-00450',
  'RECORD-00459', 'RECORD-00464', 'RECORD-00470', 'RECORD-00517', 'RECORD-00527',
  'RECORD-00540', 'RECORD-00546', 'RECORD-00550', 'RECORD-00565', 'RECORD-00608',
  'RECORD-00611'
]);

// Verify these are actually missing
for (const id of orphanRecordIds) {
  if (validRecordIds.has(id)) {
    console.warn(`WARNING: ${id} exists in archive — not actually orphaned`);
  }
}

// Build a map: entity_id -> list of valid source_record_ids from relationships
// Relationships reference entities via source_entity_id and target_entity_id
const entityToRecords = new Map();

for (const rel of relationships) {
  const recordId = rel.source_record_id;
  if (!validRecordIds.has(recordId)) continue; // skip relationships pointing to invalid records

  // Map both source and target entities to this record
  for (const entityId of [rel.source_entity_id, rel.target_entity_id]) {
    if (!entityId) continue;
    if (!entityToRecords.has(entityId)) {
      entityToRecords.set(entityId, new Set());
    }
    entityToRecords.get(entityId).add(recordId);
  }
}

// Helper to pick earliest record ID (lowest number)
function earliestRecord(recordIds) {
  return [...recordIds].sort((a, b) => {
    const numA = parseInt(a.replace('RECORD-', ''), 10);
    const numB = parseInt(b.replace('RECORD-', ''), 10);
    return numA - numB;
  })[0];
}

// Fix affected entities
let reassigned = 0;
let skipped = 0;
const changes = [];

for (const entity of entities) {
  const currentRef = entity.first_mention_record_id;
  if (!orphanRecordIds.has(currentRef)) continue; // not an orphan

  const validRefs = entityToRecords.get(entity.entity_id);
  if (!validRefs || validRefs.size === 0) {
    skipped++;
    console.log(`SKIP: ${entity.entity_id} (${entity.entity_name}) — no valid relationship records found`);
    continue;
  }

  const newRef = earliestRecord(validRefs);
  changes.push({
    entity_id: entity.entity_id,
    entity_name: entity.entity_name,
    old_ref: currentRef,
    new_ref: newRef,
    valid_options: validRefs.size
  });

  entity.first_mention_record_id = newRef;
  reassigned++;
}

// Write updated entities CSV
const columns = [
  'entity_id', 'entity_type', 'entity_name', 'normalized_name',
  'role_or_description', 'affiliation', 'prominence_score',
  'first_mention_record_id', 'total_mentions', 'related_entities', 'notes'
];

const output = stringify(entities, { header: true, columns });
writeFileSync(entitiesPath, output);

// Report
console.log(`\n--- Results ---`);
console.log(`Entities with orphan references: ${reassigned + skipped}`);
console.log(`Reassigned to valid records: ${reassigned}`);
console.log(`Skipped (no valid relationships): ${skipped}`);

if (changes.length > 0) {
  console.log(`\nChanges:`);
  for (const c of changes) {
    console.log(`  ${c.entity_id} (${c.entity_name}): ${c.old_ref} -> ${c.new_ref} (${c.valid_options} valid records)`);
  }
}
