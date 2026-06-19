#!/usr/bin/env node
/**
 * Verify the two-structure PressThink dedup (#462).
 *
 * Enumerates published archive records whose source URL is on pressthink.org
 * (including the archive.pressthink.org Movable Type subdomain), detects records
 * that collide on the same normalized post path across the two URL structures,
 * and prints the candidate duplicates for a curator decision. Never deletes.
 *
 *   node scripts/check-pressthink-dedup.js
 *
 * Exit 0 when the only collisions are curator-reviewed (allowlisted); exit 1 when
 * a NEW, unreviewed two-structure collision is present, so it can gate a launch.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isPressthinkUrl,
  isArchivePressthinkUrl,
  isWordpressPressthinkUrl,
  findPressthinkDuplicates,
  clusterSignature,
  loadPublishedRecords,
  CURATOR_PENDING_DUPLICATES,
} from '../data/lib/pressthink-dedup.js';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const records = loadPublishedRecords(dataDir);

const pressthink = records.filter((r) => isPressthinkUrl(r.url));
const archiveCount = pressthink.filter((r) => isArchivePressthinkUrl(r.url)).length;
const wordpressCount = pressthink.filter((r) => isWordpressPressthinkUrl(r.url)).length;
const otherCount = pressthink.length - archiveCount - wordpressCount;
console.log(`PressThink-family records: ${pressthink.length} ` +
  `(${archiveCount} on archive.pressthink.org, ${wordpressCount} on pressthink.org` +
  `${otherCount > 0 ? `, ${otherCount} on other *.pressthink.org subdomains` : ''})`);

const clusters = findPressthinkDuplicates(records);
const unreviewed = clusters.filter((c) => !CURATOR_PENDING_DUPLICATES.has(clusterSignature(c)));

console.log(`\nNormalized-path collisions across the two structures: ${clusters.length} ` +
  `(${unreviewed.length} unreviewed, ${clusters.length - unreviewed.length} curator-pending)\n`);

for (const c of clusters) {
  const status = CURATOR_PENDING_DUPLICATES.has(clusterSignature(c)) ? 'curator-pending' : 'NEW — unreviewed';
  console.log(`  [${status}] normalized path: ${c.key}`);
  for (const r of c.records) {
    console.log(`      ${r.id}  ${r.date}  ${JSON.stringify(r.title)}`);
    console.log(`          ${r.url}`);
  }
  console.log('');
}

if (clusters.length === 0) {
  console.log('Verdict: no two-structure collisions found.');
} else if (unreviewed.length === 0) {
  console.log('Verdict: all collisions are curator-reviewed; no new duplicates. See the allowlist in data/lib/pressthink-dedup.js.');
} else {
  console.log(`Verdict: ${unreviewed.length} NEW two-structure collision(s) need curator review.`);
}

process.exit(unreviewed.length > 0 ? 1 : 0);
