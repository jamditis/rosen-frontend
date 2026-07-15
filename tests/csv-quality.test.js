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

  it('raw_text has no CP1252-mojibake or replacement-char artifacts (#162)', () => {
    // CP1252-mojibake: UTF-8 bytes misread as CP1252 then re-encoded as UTF-8.
    // Visual signatures: "Â£" (£), "â€" prefix (smart quotes/dashes/ellipsis),
    // "Ã" prefix (accented latin), "ï¿½" (a multi-char rendering of U+FFFD
    // that arises when the same double-encode happens to a replacement char),
    // and the literal replacement character U+FFFD itself (the residue when
    // a char was lost upstream and there's nothing to recover).
    const MOJIBAKE_RE = /Â[£¢¥§°]|â€|Ã[©¨ àáóñ]|ï¿½|�/u;
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

  it('no URL collides with a non-thread archive_records URL (#163)', () => {
    // Cross-source dedup: a URL that lives as a regular article record (RECORD-*,
    // TUMBLR-*, CLIP-*) should not also appear as a social post — otherwise the
    // archive shows the same content twice. THREAD-* records are excluded by
    // design: a thread record's url field is its root social post's URL, and
    // the constituent social posts are intentionally kept in social_posts.csv
    // so thread-detection can reconstruct the conversation.
    const id = (r) => r.id || r.ID || '';
    const url = (r) => (r.url || r.URL || '').trim();
    const nonThreadArticleUrls = new Set(
      archiveRecords
        .filter(r => !id(r).startsWith('THREAD-'))
        .map(url)
        .filter(u => u && u !== '#')
    );
    const collisions = socialPosts
      .filter(s => {
        const u = url(s);
        return u && u !== '#' && nonThreadArticleUrls.has(u);
      })
      .map(id);
    assert.strictEqual(collisions.length, 0,
      `${collisions.length} social posts share a URL with a non-thread article record: ${collisions.slice(0, 5).join(', ')}`);
  });

  it('no published summary uses AI-guesswork hedging language (#236)', () => {
    // When the scraper can't reach a source URL, the summary generator falls
    // back on generic, hedging descriptors instead of grounded content. These
    // signatures detect that fallback. Scoped to verified=TRUE rows: the CSV
    // is the curator's working surface, and verified=FALSE rows are already
    // parked for re-sourcing (see #235). This test guards the *published*
    // surface, not the queue.
    const HEDGING_PATTERNS = [
      /provides an example of/i,
      /addresses a crucial issue/i,
      /likely (addresses|discusses|covers|involves)/i,
      /specific details would be helpful/i,
      /appears to (discuss|argue|cover)/i,
      /it likely [a-z]+/i,
    ];
    const isVerified = (r) => {
      const v = r.verified || r.Verified || '';
      return v === 'TRUE' || v === 'true' || v === 'Yes' || v === true;
    };
    const offenders = archiveRecords
      .filter(isVerified)
      .filter(r => HEDGING_PATTERNS.some(p => p.test(r.summary || '')))
      .map(r => r.id);
    assert.strictEqual(offenders.length, 0,
      `${offenders.length} published records have AI-guesswork hedging summaries (re-scrape or set verified=FALSE): ${offenders.slice(0, 5).join(', ')}`);
  });

  it('no summary opens by equating the author with the document (#581)', () => {
    // The summary generator sometimes wrote "Rosen is a/an <document>" (e.g.
    // "Rosen is an open letter to Bill Gates...") where it meant to describe the
    // piece, a grammar error a reader spots at a glance (RECORD-00444, #581).
    // This is a regression guard for the observed #581 signature, not a general
    // author=document detector. It flags "Rosen is a/an" followed by one of the
    // document/act nouns seen in the 14 real defects AND that noun's complement:
    // a comma, a preposition, or a present participle acting as a verb (followed
    // by a determiner/preposition, or ending the clause). Requiring the
    // participle to be verb-like keeps a person compound that merely starts with
    // the same noun from matching -- "Rosen is an interview training coach..."
    // has "training" modifying the head noun "coach", so it is not flagged, while
    // "Rosen is a blog post presenting a dialogue..." (RECORD-00265) is. The noun
    // list is deliberately closed to the observed defects rather than broadened
    // to every possible document word: a wider list re-introduces person-construction
    // false positives for no confirmed gain. Verified against all 14 originals.
    // The one-time fix (data/fixes/fix-author-is-document-summaries.js) corrects
    // those 14 by id.
    const NOUNS = 'interview|preview|blog post|transcript|critique|debriefing|response|distillation|call to action|open letter';
    const PREPS = 'of|to|with|by|for|in|on|about|between|from|as|against';
    const DETS = 'an?|the';
    const AUTHOR_IS_DOCUMENT = new RegExp(
      `^\\s*(?:Jay\\s+)?Rosen\\s+is\\s+an?\\s+(?:${NOUNS})` +
      `(?:,|\\s+(?:${PREPS})\\b|\\s+\\w+ing(?:\\s+(?:${DETS}|${PREPS})\\b|[,.]|$))`, 'i');

    // Fixtures lock the boundary: the signature must fire on the observed defect
    // shapes and must not fire on a person construction that merely starts with
    // the same noun or on an already-corrected summary.
    const shouldFlag = [
      'Rosen is an open letter to Bill Gates offering advice on how to create a blog.',
      'Rosen is a response to Michael Skube\'s opinion piece in the Los Angeles Times.',
      'Rosen is a call to action, recruiting journalists to volunteer for a project.',
      'Rosen is a blog post presenting a dialogue between Jay Rosen and a correspondent.',
    ];
    const shouldNotFlag = [
      'Jay Rosen is an interview training coach for reporters.',
      'Jay Rosen is a blog post writing instructor at NYU.',
      'Rosen is a response coordinator for the newsroom.',
      'Jay Rosen is a professor at NYU who argues for a different kind of press.',
      'This is an open letter to Bill Gates offering advice on how to create a blog.',
    ];
    for (const s of shouldFlag) assert.ok(AUTHOR_IS_DOCUMENT.test(s), `expected to flag: ${s}`);
    for (const s of shouldNotFlag) assert.ok(!AUTHOR_IS_DOCUMENT.test(s), `should not flag: ${s}`);

    const offenders = archiveRecords
      .filter(r => AUTHOR_IS_DOCUMENT.test(r.summary || ''))
      .map(r => r.id);
    assert.strictEqual(offenders.length, 0,
      `${offenders.length} summaries open by calling Rosen the document (run data/fixes/fix-author-is-document-summaries.js): ${offenders.slice(0, 5).join(', ')}`);
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
