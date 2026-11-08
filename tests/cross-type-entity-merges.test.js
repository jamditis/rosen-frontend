/**
 * Cross-type entity duplicates (#875).
 *
 * data/fixes/cross-type-duplicate-rules.js holds the curator rules for names
 * that were extracted under more than one entity type. Later extraction slices
 * brought seventeen of those names back as duplicates;
 * data/fixes/apply-2026-11-cross-type-merges.js applied the rules again and
 * recorded each merge in data/entity-merges.csv. These tests pin that state and
 * the two names deliberately left for a curator.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

import { parseEntityMerges, buildEntityRedirects } from '../data/lib/entity-merges.js';
import { CROSS_TYPE_RULES, HELD_FOR_CURATOR } from '../data/fixes/cross-type-duplicate-rules.js';

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readRepo = (relative) => readFileSync(path.join(repositoryRoot, relative), 'utf8');
const readCsv = (relative) => parse(readRepo(relative), { columns: true, skip_empty_lines: true });

// The #875 merges: names that fix-cross-type-duplicates.js already had a rule
// for, which had reappeared as cross-type duplicates after later extraction
// slices. Each pair is retired id -> canonical id.
const ISSUE_875_MERGES = [
  ['O1738', 'E0077'], // Personal Democracy Forum
  ['O1373', 'E0100'], // Democratic National Convention
  ['W1077', 'O0035'], // Romenesko
  ['W0789', 'O0279'], // Meet the Press
  ['W0971', 'O0384'], // Instapundit
  ['W0955', 'O0443'], // Public Eye
  ['W0826', 'O0447'], // OffTheBus
  ['W0957', 'O0515'], // Wikipedia
  ['W0701', 'O0767'], // 60 Minutes
  ['W0984', 'O0789'], // Media Shift
  ['W1079', 'O0875'], // Washington Week
  ['W0702', 'O0883'], // The Note
  ['W0986', 'O0985'], // The Daily Show
  ['W1022', 'O1043'], // This American Life
  ['W1073', 'O1143'], // Hardball
  ['W0891', 'O1161'], // Assignment Zero
  ['W0904', 'O1205'], // This Week
];

describe('cross-type entity duplicates (#875)', () => {
  const merges = parseEntityMerges(readRepo('data/entity-merges.csv'));
  const entities = readCsv('data/extracted_entities.csv');
  const relationships = readCsv('data/extracted_relationships.csv');
  const liveIds = new Set(entities.map((entity) => entity.entity_id));
  const redirects = buildEntityRedirects(merges, liveIds);

  it('records every #875 cross-type merge', () => {
    for (const [retiredId, canonicalId] of ISSUE_875_MERGES) {
      assert.equal(redirects[retiredId], canonicalId, `${retiredId} must redirect to ${canonicalId}`);
      const merge = merges.find((entry) => entry.retiredId === retiredId);
      assert.equal(merge.issue, '#875', `${retiredId} must cite issue #875`);
    }
  });

  it('re-points every relationship of a merged-away row at the canonical id', () => {
    const retired = new Set(ISSUE_875_MERGES.map(([retiredId]) => retiredId));
    const stray = relationships
      .filter((rel) => retired.has(rel.source_entity_id) || retired.has(rel.target_entity_id))
      .map((rel) => rel.relationship_id);
    assert.deepEqual(stray, []);
    // RECORD-00658 named Meet the Press only through the retired W0789 row.
    const meetThePress = relationships.filter((rel) => rel.source_record_id === 'RECORD-00658'
      && (rel.source_entity_id === 'O0279' || rel.target_entity_id === 'O0279'));
    assert.equal(meetThePress.length, 4);
  });

  it('folds each retired row\'s mentions into its canonical row', () => {
    const mentions = new Map(entities.map((entity) => [entity.entity_id, Number(entity.total_mentions)]));
    // Before #875: E0077 had 2, O0279 had 3, O1161 had 13; each retired row had 1.
    assert.equal(mentions.get('E0077'), 3);
    assert.equal(mentions.get('O0279'), 4);
    assert.equal(mentions.get('O1161'), 14);
  });

  it('leaves no rule-backed cross-type duplicate unresolved except the ones held for a curator', () => {
    const byName = new Map();
    for (const entity of entities) {
      if (!byName.has(entity.entity_name)) byName.set(entity.entity_name, []);
      byName.get(entity.entity_name).push(entity);
    }
    const unresolved = [];
    for (const [name, group] of byName) {
      const rule = CROSS_TYPE_RULES[name];
      if (!Array.isArray(rule) || HELD_FOR_CURATOR[name]) continue;
      const keep = new Set(rule);
      if (!group.some((entity) => keep.has(entity.entity_type))) continue;
      for (const entity of group) {
        if (!keep.has(entity.entity_type)) unresolved.push(`${name}: ${entity.entity_id} (${entity.entity_type})`);
      }
    }
    assert.deepEqual(unresolved, []);
  });

  it('holds First Draft for a curator instead of merging it', () => {
    // O0084 already conflates Claire Wardle's First Draft nonprofit with Tim
    // Porter's First Draft blog, so folding the blog's Work row into it would
    // deepen the conflation rather than resolve a duplicate.
    assert.ok(HELD_FOR_CURATOR['First Draft']);
    assert.ok(liveIds.has('W0951'));
    assert.equal(redirects.W0951, undefined);
  });

  it('keeps the Pressthink concept apart from the PressThink blog', () => {
    // C0757 names the press's belief system ("their pressthink"), the idea the
    // blog is named for, and one of its rows already says the concept
    // Originated By O0033. Merging it would turn that row into a self-link.
    assert.ok(liveIds.has('C0757'));
    assert.equal(redirects.C0757, undefined);
  });
});
