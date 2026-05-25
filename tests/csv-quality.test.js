/**
 * CSV source data quality tests
 *
 * Validates that the source CSV files have no data quality issues
 * that would affect the export pipeline or frontend display.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');

let archiveRecords, socialPosts, entities, relationships;

before(() => {
  archiveRecords = parse(
    fs.readFileSync(path.join(dataDir, 'archive_records-public.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );

  socialPosts = parse(
    fs.readFileSync(path.join(dataDir, 'social_posts.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );

  entities = parse(
    fs.readFileSync(path.join(dataDir, 'extracted_entities.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );

  relationships = parse(
    fs.readFileSync(path.join(dataDir, 'extracted_relationships.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );
});

// ============================================
// archive_records-public.csv
// ============================================

describe('archive_records-public.csv', () => {
  it('has data', () => {
    assert.ok(archiveRecords.length > 0, 'No archive records found');
  });

  it('has required columns', () => {
    const requiredCols = ['id', 'title', 'publication_date', 'url'];
    const columns = Object.keys(archiveRecords[0]);
    for (const col of requiredCols) {
      // Check case-insensitive (columns may be ID, Title, etc.)
      const found = columns.some(c => c.toLowerCase() === col.toLowerCase());
      assert.ok(found, `Missing required column: ${col}. Available: ${columns.join(', ')}`);
    }
  });

  it('has no duplicate IDs', () => {
    const ids = archiveRecords.map(r => r.id || r.ID).filter(Boolean);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size,
      `Found ${ids.length - uniqueIds.size} duplicate IDs in archive records`);
  });

  it('has no duplicate URLs', () => {
    const urls = archiveRecords
      .map(r => r.url || r.URL)
      .filter(u => u && u !== '#' && u.trim().length > 0);
    const uniqueUrls = new Set(urls);
    const dupeCount = urls.length - uniqueUrls.size;
    assert.ok(dupeCount < 5, `Found ${dupeCount} duplicate URLs in archive records`);
  });

  it('all dates are valid ISO format or empty', () => {
    const badDates = [];
    for (const row of archiveRecords) {
      const date = row.publication_date || row.Publication_Date || '';
      if (date && date.trim()) {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
          badDates.push({ id: row.id || row.ID, date });
        }
      }
    }
    assert.strictEqual(badDates.length, 0,
      `${badDates.length} records have invalid dates: ${JSON.stringify(badDates.slice(0, 3))}`);
  });

  it('raw_text has no CP1252-mojibake or replacement-char clusters (#162)', () => {
    // CP1252-mojibake: UTF-8 bytes misread as CP1252 then re-encoded as UTF-8.
    // Visual signatures: "Â£" (£), "â€" prefix (smart quotes/dashes/ellipsis),
    // "Ã" prefix (accented latin), "ï¿½" (a multi-char rendering of U+FFFD
    // that arises when the same double-encode happens to a replacement char).
    const MOJIBAKE_RE = /Â[£¢¥§°]|â€|Ã[©¨ àáóñ]|ï¿½/u;
    const bad = archiveRecords
      .filter(r => MOJIBAKE_RE.test(r.raw_text || ''))
      .map(r => r.id || r.ID);
    assert.strictEqual(bad.length, 0,
      `${bad.length} records contain mojibake in raw_text: ${bad.slice(0, 5).join(', ')}`);
  });
});

// ============================================
// social_posts.csv
// ============================================

describe('social_posts.csv', () => {
  it('has data', () => {
    assert.ok(socialPosts.length > 0, 'No social posts found');
  });

  it('has required columns', () => {
    const requiredCols = ['id', 'platform', 'url', 'publication_date'];
    const columns = Object.keys(socialPosts[0]);
    for (const col of requiredCols) {
      const found = columns.some(c => c.toLowerCase() === col.toLowerCase());
      assert.ok(found, `Missing required column: ${col}. Available: ${columns.join(', ')}`);
    }
  });

  it('has no duplicate IDs', () => {
    const ids = socialPosts.map(r => r.id || r.ID).filter(Boolean);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size,
      `Found ${ids.length - uniqueIds.size} duplicate IDs in social posts`);
  });

  it('has no duplicate URLs (Bluesky)', () => {
    const bskyUrls = socialPosts
      .filter(r => r.platform === 'Bluesky')
      .map(r => r.url || r.URL)
      .filter(u => u && u.trim().length > 0);
    const uniqueUrls = new Set(bskyUrls);
    assert.strictEqual(bskyUrls.length, uniqueUrls.size,
      `Found ${bskyUrls.length - uniqueUrls.size} duplicate Bluesky URLs`);
  });

  it('all platforms are recognized values', () => {
    const validPlatforms = new Set(['Twitter', 'Bluesky', 'twitter', 'bluesky', 'Twitter/X', 'Mastodon']);
    const badPlatforms = [];
    for (const row of socialPosts) {
      const platform = row.platform || '';
      if (platform && !validPlatforms.has(platform)) {
        badPlatforms.push({ id: row.id || row.ID, platform });
      }
    }
    assert.strictEqual(badPlatforms.length, 0,
      `${badPlatforms.length} posts have unrecognized platform: ${JSON.stringify(badPlatforms.slice(0, 3))}`);
  });

  it('all dates are valid or empty', () => {
    const badDates = [];
    for (const row of socialPosts) {
      const date = row.publication_date || '';
      if (date && date.trim()) {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
          badDates.push({ id: row.id || row.ID, date });
        }
      }
    }
    assert.strictEqual(badDates.length, 0,
      `${badDates.length} social posts have invalid dates: ${JSON.stringify(badDates.slice(0, 3))}`);
  });

  it('categories use normalized values', () => {
    const CANONICAL = new Set([
      'Audience & Public Engagement',
      'Journalism Education',
      'Journalism Theory & Practice',
      'Politics & Democracy',
      'Press & Media Criticism',
      'Technology & Digital Media',
    ]);

    const unknownCats = new Set();

    for (const row of [...archiveRecords, ...socialPosts]) {
      const raw = (row.thematic_categories || '');
      const cats = raw.replace(/[\[\]"']/g, '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
      for (const cat of cats) {
        if (!CANONICAL.has(cat)) unknownCats.add(cat);
      }
    }

    assert.strictEqual(unknownCats.size, 0,
      `Non-canonical categories found: ${[...unknownCats].sort().join(', ')}`);
  });
});

// ============================================
// extracted_entities.csv
// ============================================

describe('extracted_entities.csv', () => {
  it('has data', () => {
    assert.ok(entities.length > 0, 'No entities found');
  });

  it('has required columns', () => {
    const requiredCols = ['entity_id', 'entity_type', 'entity_name'];
    const columns = Object.keys(entities[0]);
    for (const col of requiredCols) {
      assert.ok(columns.includes(col), `Missing column: ${col}. Available: ${columns.join(', ')}`);
    }
  });

  it('has no duplicate entity IDs', () => {
    const ids = entities.map(e => e.entity_id).filter(Boolean);
    const uniqueIds = new Set(ids);
    assert.strictEqual(ids.length, uniqueIds.size,
      `Found ${ids.length - uniqueIds.size} duplicate entity IDs`);
  });

  it('all entities have a name', () => {
    const nameless = entities.filter(e => !e.entity_name || e.entity_name.trim().length === 0);
    assert.strictEqual(nameless.length, 0, `${nameless.length} entities have no name`);
  });

  it('prominence scores are numeric', () => {
    const badScores = entities.filter(e => {
      const score = e.prominence_score;
      return score && isNaN(parseInt(score));
    });
    assert.strictEqual(badScores.length, 0,
      `${badScores.length} entities have non-numeric prominence scores`);
  });
});

// ============================================
// extracted_relationships.csv
// ============================================

describe('extracted_relationships.csv', () => {
  it('has data', () => {
    assert.ok(relationships.length > 0, 'No relationships found');
  });

  it('has source and target columns', () => {
    const columns = Object.keys(relationships[0]);
    const hasSource = columns.some(c => c.toLowerCase().includes('source'));
    const hasTarget = columns.some(c => c.toLowerCase().includes('target'));
    assert.ok(hasSource, `No source column found. Available: ${columns.join(', ')}`);
    assert.ok(hasTarget, `No target column found. Available: ${columns.join(', ')}`);
  });

  it('references only existing entity IDs', () => {
    const entityIds = new Set(entities.map(e => e.entity_id));
    const badRefs = [];
    for (const rel of relationships) {
      const target = rel.target_entity_id || rel.Target || rel.target;
      if (target && !entityIds.has(target)) {
        badRefs.push(target);
      }
    }
    // Allow some tolerance (a few orphaned references is ok)
    assert.ok(badRefs.length < 10,
      `${badRefs.length} relationships reference non-existent entities: ${badRefs.slice(0, 5).join(', ')}`);
  });
});
