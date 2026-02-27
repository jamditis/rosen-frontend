/**
 * fix-junk-excerpts.js
 *
 * Removes scraped UI artifacts from excerpt and summary fields in the archive CSV.
 * Conservative approach: only removes patterns that are clearly scraped junk,
 * not legitimate mentions of words like "membership" or "newsletter" in context.
 *
 * Usage: node data/fixes/fix-junk-excerpts.js [--dry-run]
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const DRY_RUN = process.argv.includes('--dry-run');

const csvPath = decodeURIComponent(new URL('../archive_records-public.csv', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const raw = readFileSync(csvPath, 'utf-8');
const records = parse(raw, { columns: true, relax_column_count: true });

const changes = [];

/**
 * Clean a text field by removing scraped UI junk.
 * Returns the cleaned text, or the original if no changes were needed.
 */
function cleanField(text, recordId, fieldName) {
  if (!text || !text.trim()) return text;

  let cleaned = text;

  // 1. Medium byline + metadata block
  //    Pattern: "N min read · Date" or "N minute read"
  cleaned = cleaned.replace(
    /\d+\s*min(ute)?\s*read\s*·?\s*/gi,
    ''
  );

  // 2. "-- N Listen Share" (Medium boilerplate after date)
  cleaned = cleaned.replace(
    /\s*--\s*\d+\s+Listen\s+Share\s*/gi,
    ' '
  );

  // 3. Audio version callouts: "🎧 Listen to the audio version..."
  cleaned = cleaned.replace(
    /🎧\s*Listen to the audio version[^.]*\.\s*/gi,
    ''
  );

  // 4. "Share on X" button text blocks
  //    These appear as a sequence: "Share on Bluesky Share on Facebook Share on LinkedIn..."
  //    Handle "X (Twitter)" variant where X is followed by parenthetical
  cleaned = cleaned.replace(
    /(\s*Share on (Bluesky|Facebook|LinkedIn|Reddit|Email|X\s*(\(Twitter\))?|Twitter)\s*)+/gi,
    ' '
  );

  // 5. Consecutive standalone UI button text on their own lines.
  //    Only match when multiple UI words appear together (e.g., "Listen\nShare\nFollow")
  //    to avoid false positives where "Listen" starts a real sentence.
  cleaned = cleaned.replace(
    /(?:^|\n)(\s*(Listen|Share|Follow|Copy link|Subscribe)\s*\n){2,}/gm,
    '\n'
  );

  // 6. Single standalone "Copy link" on its own line (always UI junk)
  cleaned = cleaned.replace(
    /(?:^|\n)\s*Copy link\s*(?:\n|$)/gm,
    '\n'
  );

  // 10. Unsplash image credits in parentheses
  cleaned = cleaned.replace(
    /\s*\([^)]{1,40}\s*\/\s*Unsplash\)\s*/gi,
    ' '
  );

  // Compare against original
  if (cleaned !== text) {
    changes.push({ id: recordId, field: fieldName, before: text, after: cleaned });
    return cleaned;
  }

  return text;
}

// Process each record
let excerptCount = 0;
let summaryCount = 0;

for (const record of records) {
  const origExcerpt = record.excerpt;
  const origSummary = record.summary;

  record.excerpt = cleanField(record.excerpt, record.id, 'excerpt');
  record.summary = cleanField(record.summary, record.id, 'summary');

  if (record.excerpt !== origExcerpt) excerptCount++;
  if (record.summary !== origSummary) summaryCount++;
}

// Log changes
console.log(`\n${'='.repeat(60)}`);
console.log(`  Junk excerpt/summary cleanup ${DRY_RUN ? '(DRY RUN)' : ''}`);
console.log(`${'='.repeat(60)}\n`);

for (const change of changes) {
  console.log(`${change.id} [${change.field}]`);

  // Show a diff-like view: what was removed
  const beforeWords = change.before.split(/\s+/);
  const afterWords = change.after.split(/\s+/);
  const removedParts = beforeWords.filter(w => !afterWords.includes(w));
  if (removedParts.length > 0 && removedParts.length < 30) {
    console.log(`  Removed: "${removedParts.join(' ')}"`);
  } else {
    console.log(`  Before (first 150 chars): ${change.before.substring(0, 150)}`);
    console.log(`  After  (first 150 chars): ${change.after.substring(0, 150)}`);
  }
  console.log();
}

console.log(`${'─'.repeat(60)}`);
console.log(`  Excerpts modified: ${excerptCount}`);
console.log(`  Summaries modified: ${summaryCount}`);
console.log(`  Total changes: ${changes.length}`);
console.log(`${'─'.repeat(60)}\n`);

if (!DRY_RUN && changes.length > 0) {
  const columns = Object.keys(records[0]);
  const output = stringify(records, { header: true, columns });
  writeFileSync(csvPath, output);
  console.log(`Wrote cleaned CSV to ${csvPath}`);
} else if (DRY_RUN) {
  console.log('Dry run — no files were modified.');
} else {
  console.log('No changes needed.');
}
