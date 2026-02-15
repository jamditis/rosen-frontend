import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

// --- File paths ---
const ENTITIES_PATH = new URL('../extracted_entities.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const RELATIONSHIPS_PATH = new URL('../extracted_relationships.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// --- Rules for consolidation ---
// Format: { name: keep_types[] } — any type NOT listed gets deleted
// "KEEP_ALL" means skip entirely (legitimate multi-type)

const KEEP_BOTH = 'KEEP_BOTH';
const KEEP_ALL = 'KEEP_ALL';

const RULES = {
  // === Media outlets (Org + Work) → keep Organization ===
  // These are all media outlets that got tagged as both Organization and Work.
  // The Organization type is correct; the Work type is a data quality error.
  '60 Minutes': ['Organization'],
  'ABC News': ['Organization'],
  'Al Jazeera': ['Organization'],
  'Assignment Zero': ['Organization'],
  'BuzzFeed': ['Organization'],
  'Buzzmachine': ['Organization'],
  'CBS News': ['Organization'],
  'CNN': ['Organization'],
  'Columbia Journalism Review': ['Organization'],
  'Crikey': ['Organization'],
  'Daily Kos': ['Organization'],
  'Drudge Report': ['Organization'],
  'Face the Nation': ['Organization'],
  'Fox News': ['Organization'],
  'Gawker': ['Organization'],
  'Huffington Post': ['Organization'],
  'MSNBC': ['Organization'],
  'MTP': ['Organization'],
  'Meet The Press': ['Organization'],
  'Meet the Press': ['Organization'],
  'NBC News': ['Organization'],
  'NewAssignment.Net': ['Organization'],
  'Newsweek': ['Organization'],
  'Off The Bus': ['Organization'],
  'Politico': ['Organization'],
  'ProPublica': ['Organization'],
  'Salon': ['Organization'],
  'Slate': ['Organization'],
  'TED': ['Organization'],
  'Talking Points Memo': ['Organization'],
  'The Atlantic': ['Organization'],
  'The Colbert Report': ['Organization'],
  'The Daily Show': ['Organization'],
  'The Economist': ['Organization'],
  'The Guardian': ['Organization'],
  'The Intercept': ['Organization'],
  'The New Republic': ['Organization'],
  'The Reckoning': ['Organization'],
  'The Wall Street Journal': ['Organization'],
  'The Washington Monthly': ['Organization'],
  'The Weekly Standard': ['Organization'],
  'Time': ['Organization'],
  'Vox': ['Organization'],
  'Washington Monthly': ['Organization'],
  'Wikipedia': ['Organization'],
  'The American Prospect': ['Organization'],
  'This Week': ['Organization'],
  'Instapundit': ['Organization'],
  'PressThink': ['Organization'],
  'First Draft': ['Organization'],
  'Channels': ['Organization'],
  'Crossfire': ['Organization'],
  'Front Line Voices': ['Organization'],
  'Sixty Minutes': ['Organization'],
  'Nieman Watchdog': ['Organization'],
  'Public Eye': ['Organization'],
  'OffTheBus': ['Organization'],
  'Frontline': ['Organization'],
  'Newshour': ['Organization'],
  'Nightline': ['Organization'],
  'Firedoglake': ['Organization'],
  'TPM Muckraker': ['Organization'],
  'Undercurrent': ['Organization'],
  'The Revealer': ['Organization'],
  'Nieman Reports': ['Organization'],
  'Global Voices Online': ['Organization'],
  'CBS Evening News': ['Organization'],
  'Opinion Journal': ['Organization'],
  'OffTheBus.Net': ['Organization'],
  'TPM Cafe': ['Organization'],
  'Idea Lab': ['Organization'],
  'Media Shift': ['Organization'],
  'Philly Future': ['Organization'],
  'Suburban Guerilla': ['Organization'],
  'Attytood': ['Organization'],
  'Washington Week': ['Organization'],
  'The Note': ['Organization'],
  'Media Nation': ['Organization'],
  'Campaign Desk': ['Organization'],
  'Brill\'s Content': ['Organization'],
  'This American Life': ['Organization'],
  'Hardball': ['Organization'],
  'BloggerCon III': ['Organization'],
  'Blogger': ['Organization'],
  'Movable Type': ['Organization'],
  'Project 2025': ['Organization'],

  // === Concept vs Organization → keep the more appropriate ===
  'Big Media': ['Concept'],
  'Mainstream Media': ['Concept'],
  'Mainstream Press': ['Concept'],
  'MSM': ['Concept'],
  'Free Press': KEEP_BOTH,       // "free press" concept + Free Press org
  'The Nation': KEEP_BOTH,       // concept + The Nation magazine
  'Open Source': KEEP_ALL,       // concept + radio show

  // === Event vs Organization → keep Event (except WEF) ===
  'Democratic National Convention': ['Event'],
  'DNC': ['Event'],
  'Knight News Challenge': ['Event'],
  'Networked Journalism Summit': ['Event'],
  'Personal Democracy Forum': ['Event'],
  'Yearly Kos': ['Event'],
  'World Economic Forum': KEEP_BOTH,

  // === Location vs Organization → consolidate ===
  'Fleet Center': ['Location'],
  'Harvard': ['Organization'],
  'New York City': ['Location'],
  'White House': KEEP_BOTH,

  // === Person/Org/Work confusion ===
  'Romenesko': ['Person', 'Organization'],  // delete Work
  'Wonkette': ['Person', 'Organization'],   // delete Work

  // === Event vs Location — keep both ===
  'Iowa': KEEP_BOTH,
  'Vietnam': KEEP_BOTH,

  // === Concept vs Event ===
  'Bias Wars': ['Concept'],
  'Political Conventions': ['Event'],
};

// --- Load data ---
const entitiesRaw = readFileSync(ENTITIES_PATH, 'utf-8');
const entities = parse(entitiesRaw, { columns: true, skip_empty_lines: true });

const relationshipsRaw = readFileSync(RELATIONSHIPS_PATH, 'utf-8');
const relationships = parse(relationshipsRaw, { columns: true, skip_empty_lines: true });

// --- Find cross-type duplicates ---
const byName = new Map();
for (const e of entities) {
  const name = e.entity_name;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(e);
}

const crossTypeDupes = new Map();
for (const [name, group] of byName) {
  const types = new Set(group.map(e => e.entity_type));
  if (types.size > 1) {
    crossTypeDupes.set(name, group);
  }
}

console.log(`\nCross-type duplicate entity names found: ${crossTypeDupes.size}`);
console.log('---');

// --- Apply rules ---
const idsToDelete = new Set();
// Map from deleted entity_id → kept entity_id (for relationship reassignment)
const idRemap = new Map();
// Track mention additions: kept_id → additional mentions to add
const mentionAdditions = new Map();

let consolidatedCount = 0;
let keptAsBothCount = 0;
let unhandledNames = [];

for (const [name, group] of crossTypeDupes) {
  const rule = RULES[name];

  if (rule === undefined) {
    unhandledNames.push(name);
    continue;
  }

  if (rule === KEEP_BOTH || rule === KEEP_ALL) {
    keptAsBothCount++;
    console.log(`  KEEP BOTH/ALL: "${name}" (${group.map(e => e.entity_type).join(', ')})`);
    continue;
  }

  // rule is an array of types to keep
  const keepTypes = new Set(rule);
  const toKeep = group.filter(e => keepTypes.has(e.entity_type));
  const toDelete = group.filter(e => !keepTypes.has(e.entity_type));

  if (toKeep.length === 0) {
    console.log(`  WARNING: No entities to keep for "${name}" — skipping`);
    continue;
  }

  // Pick the primary kept entity (first one) for mention merging and relationship reassignment
  const primaryKept = toKeep[0];

  for (const del of toDelete) {
    idsToDelete.add(del.entity_id);
    idRemap.set(del.entity_id, primaryKept.entity_id);

    // Sum up mentions to add
    const additionalMentions = parseInt(del.total_mentions, 10) || 0;
    if (additionalMentions > 0) {
      const current = mentionAdditions.get(primaryKept.entity_id) || 0;
      mentionAdditions.set(primaryKept.entity_id, current + additionalMentions);
    }

    console.log(`  CONSOLIDATE: "${name}" — delete ${del.entity_type} (${del.entity_id}), keep ${primaryKept.entity_type} (${primaryKept.entity_id}), +${additionalMentions} mentions`);
  }

  consolidatedCount++;
}

if (unhandledNames.length > 0) {
  console.log(`\n  UNHANDLED (${unhandledNames.length} names — no rule defined):`);
  for (const name of unhandledNames) {
    const group = crossTypeDupes.get(name);
    console.log(`    "${name}": ${group.map(e => `${e.entity_type}(${e.entity_id})`).join(', ')}`);
  }
}

// --- Update entities ---
const updatedEntities = entities.filter(e => !idsToDelete.has(e.entity_id));

// Add merged mentions to kept entities
for (const e of updatedEntities) {
  if (mentionAdditions.has(e.entity_id)) {
    const current = parseInt(e.total_mentions, 10) || 0;
    const addition = mentionAdditions.get(e.entity_id);
    e.total_mentions = String(current + addition);
  }
}

// --- Update relationships ---
let relationshipsRemapped = 0;
const updatedRelationships = relationships.map(r => {
  const updated = { ...r };
  let changed = false;

  if (idRemap.has(r.source_entity_id)) {
    const newId = idRemap.get(r.source_entity_id);
    // Find the kept entity to get its name
    const keptEntity = updatedEntities.find(e => e.entity_id === newId);
    updated.source_entity_id = newId;
    if (keptEntity) updated.source_entity_name = keptEntity.entity_name;
    changed = true;
  }

  if (idRemap.has(r.target_entity_id)) {
    const newId = idRemap.get(r.target_entity_id);
    const keptEntity = updatedEntities.find(e => e.entity_id === newId);
    updated.target_entity_id = newId;
    if (keptEntity) updated.target_entity_name = keptEntity.entity_name;
    changed = true;
  }

  if (changed) relationshipsRemapped++;
  return updated;
});

// --- Write output ---
const entityColumns = [
  'entity_id', 'entity_type', 'entity_name', 'normalized_name',
  'role_or_description', 'affiliation', 'prominence_score',
  'first_mention_record_id', 'total_mentions', 'related_entities', 'notes'
];

const relationshipColumns = [
  'relationship_id', 'source_record_id', 'source_entity_id', 'source_entity_name',
  'relationship_type', 'target_entity_id', 'target_entity_name',
  'context_snippet', 'confidence_score', 'extracted_date'
];

writeFileSync(ENTITIES_PATH, stringify(updatedEntities, { header: true, columns: entityColumns }));
writeFileSync(RELATIONSHIPS_PATH, stringify(updatedRelationships, { header: true, columns: relationshipColumns }));

// --- Summary ---
console.log('\n=== Summary ===');
console.log(`Cross-type duplicate names found: ${crossTypeDupes.size}`);
console.log(`Consolidated (merged into single type): ${consolidatedCount}`);
console.log(`Kept as legitimate multi-type: ${keptAsBothCount}`);
console.log(`Unhandled (no rule defined): ${unhandledNames.length}`);
console.log(`Entity rows deleted: ${idsToDelete.size}`);
console.log(`Entities before: ${entities.length} → after: ${updatedEntities.length}`);
console.log(`Relationships remapped: ${relationshipsRemapped}`);
console.log(`Relationships before: ${relationships.length} → after: ${updatedRelationships.length}`);
