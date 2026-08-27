/**
 * Measure the real cost/benefit of issue #277's two proposed artifacts.
 *
 * #277 wants to move two jobs to build time: facet posting lists (replacing the
 * per-filter Array scan) and a pre-baked entity->records map (replacing the
 * load-time inversion in archiveService.buildEntityMaps). This script grounds that
 * proposal in current data instead of the issue's estimates, which were written
 * when the archive was ~10x smaller. It prints:
 *
 *   - record / entity / edge counts
 *   - the real gzip size of each proposed artifact vs the issue's estimate
 *   - the filter-scan time, split into its text-substring part (the job #276's
 *     MiniSearch FTS removes) and its facet part (the job #277's posting lists
 *     remove), so the residual win attributable to #277 is visible on its own
 *   - how much of entityToRecords duplicates the recordEntityMap already shipped
 *
 * Run: node scripts/measure-facet-entity-cost.js
 * Reads data/archive-core.json + data/archive-entities.json (both committed).
 * Diagnostic only - writes nothing, imports the pure builders it measures.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  buildFacetPostingLists,
  invertRecordEntityMap,
} from '../data/lib/facet-postings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
const gzKB = (obj) => (zlib.gzipSync(Buffer.from(JSON.stringify(obj))).length / 1024).toFixed(1);

// Median of several timed runs - steadier than a single pass under GC jitter.
const timeScanMs = (fn, iterations = 200, runs = 5) => {
  for (let i = 0; i < 5; i++) fn(); // warm up
  const samples = [];
  for (let run = 0; run < runs; run++) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6 / iterations);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
};

export const main = () => {
  const core = readJson('archive-core.json');
  const entities = readJson('archive-entities.json');
  const records = core.records;
  const recordEntityMap = entities.recordEntityMap || {};

  const edges = Object.values(recordEntityMap).reduce((sum, ids) => sum + ids.length, 0);
  console.log(`records: ${records.length}   entities (shipped): ${entities.entities?.length ?? 'n/a'}`);
  console.log(
    `recordEntityMap: ${Object.keys(recordEntityMap).length} records with relations, ${edges} edges`,
  );

  // --- Proposed artifact sizes ---
  const postings = buildFacetPostingLists(records);
  const entityToRecords = invertRecordEntityMap(recordEntityMap);
  console.log('\nproposed artifact sizes (gzip):');
  console.log(`  facets.json       ${gzKB(postings)} KB   (issue estimate: ~15 KB)`);
  console.log(`  entityToRecords   ${gzKB(entityToRecords)} KB   (issue estimate: ~40 KB)`);
  console.log(
    `  recordEntityMap   ${gzKB(recordEntityMap)} KB   (already shipped; entityToRecords is its transpose)`,
  );

  // --- Filter-scan timing, split by which issue owns each part ---
  const term = 'trust';
  const matchesText = (r) =>
    (r.title || '').toLowerCase().includes(term) ||
    (r.summaryPreview || '').toLowerCase().includes(term) ||
    (r.categories || []).some((c) => c.toLowerCase().includes(term));

  const facetCategory = (core.facets?.categories || [])[0];
  const facetEra = (core.facets?.eras || [])[0];
  const matchesFacets = (r) =>
    (facetCategory ? (r.categories || []).includes(facetCategory) : true) &&
    (facetEra ? r.era === facetEra : true) &&
    r.type !== 'social';

  const textScan = () => records.filter(matchesText).length;
  const facetScan = () => records.filter(matchesFacets).length;

  // The post-#276 path: a search term has already narrowed results to an FTS
  // Set, so the facet predicate runs over only those matches, not all records.
  // This is the cost an eager facets.json would have to beat - and the number
  // the "intersect the FTS Set" recommendation rests on.
  const ftsMatches = records.filter(matchesText);
  const facetScanOverSubset = () => ftsMatches.filter(matchesFacets).length;

  const textMs = timeScanMs(textScan);
  const facetMs = timeScanMs(facetScan);
  const subsetMs = timeScanMs(facetScanOverSubset);
  console.log('\nper-pass filter-scan cost:');
  console.log(`  text-substring over all records (replaced by #276 FTS):   ${textMs.toFixed(2)} ms`);
  console.log(`  facet-only over all records     (replaced by #277 lists):  ${facetMs.toFixed(2)} ms`);
  console.log(
    `  facet-only over the ${ftsMatches.length}-record FTS subset (the post-#276 path): ${subsetMs.toFixed(3)} ms`,
  );
};

if (import.meta.url === `file://${process.argv[1]}`) main();
