/**
 * CSV source data quality tests
 *
 * Validates that the source CSV files have no data quality issues
 * that would affect the export pipeline or frontend display.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoDir = path.join(__dirname, '..');
const dataDir = path.join(repoDir, 'data');
const docsDir = path.join(repoDir, 'docs');
const manualVerificationPath = path.join(docsDir, 'manual-verification-required-2026-07-23.md');

let archiveRecords, socialPosts, entities, relationships;

function readManualVerificationRecordIds() {
  const markdown = fs.readFileSync(manualVerificationPath, 'utf-8');
  return new Set(
    [...markdown.matchAll(/^###\s+([A-Z]+-\d+)\s*$/gm)]
      .map(match => match[1])
  );
}

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

  it('credits RECORD-00038 to the source page author', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00038');
    assert.ok(record, 'RECORD-00038 must remain in the curated archive');
    assert.equal(record.author, 'Marty Linsky');
    assert.match(record.summary, /^Marty Linsky reviews Jay Rosen's book/);
  });

  it('has no duplicate URLs', () => {
    const urls = archiveRecords
      .map(r => r.url || r.URL)
      .filter(u => u && u !== '#' && u.trim().length > 0);
    const uniqueUrls = new Set(urls);
    const dupeCount = urls.length - uniqueUrls.size;
    assert.ok(dupeCount < 5, `Found ${dupeCount} duplicate URLs in archive records`);
  });

  it('does not publish raw emphasis markup in verified archive titles', () => {
    const markedUp = archiveRecords
      .filter(record => record.verified === 'TRUE')
      .filter(record => /<\/?(?:i|em)\b[^>]*>/i.test(record.title || ''))
      .map(record => `${record.id}:${record.title}`);

    assert.deepStrictEqual(
      markedUp,
      [],
      `${markedUp.length} verified archive titles contain raw emphasis markup: ${markedUp.join(', ')}`
    );
  });

  it('all archive records have complete core fields', () => {
    const requiredFields = [
      'id',
      'title',
      'url',
      'author',
      'publication_date',
      'original_publication',
      'publisher',
      'content_type',
      'format',
    ];
    const missing = archiveRecords.flatMap(record => requiredFields
      .filter(field => !record[field]?.trim())
      .map(field => `${record.id}:${field}`));
    assert.strictEqual(
      missing.length,
      0,
      `${missing.length} archive core fields are blank: ${missing.slice(0, 10).join(', ')}`
    );
  });

  it('all archive records have source-grounded summaries', () => {
    const missing = archiveRecords
      .filter(record => !record.summary?.trim())
      .map(record => record.id);
    assert.strictEqual(
      missing.length,
      0,
      `${missing.length} archive records have no summary: ${missing.slice(0, 10).join(', ')}`
    );
  });

  it('all archive records have explicit verified status or manual queue coverage', () => {
    // An explicit verdict is TRUE (kept, source-replayed) or FALSE (an
    // intentionally excluded or unresolved row). FALSE is a verdict, not an
    // omission, but every FALSE archive row must remain review-visible until
    // stronger source evidence resolves it.
    const explicit = new Set(['TRUE', 'FALSE']);
    const manualVerificationIds = readManualVerificationRecordIds();
    const missingExplicitState = archiveRecords
      .filter(record => !explicit.has((record.verified || '').trim()))
      .map(record => record.id);
    const unverified = archiveRecords.filter(record => record.verified === 'FALSE');
    const undocumented = unverified
      .filter(record => !manualVerificationIds.has(record.id))
      .map(record => record.id);
    const underflagged = unverified
      .filter(record => record.low_confidence !== 'TRUE' || record.needs_review !== 'TRUE')
      .map(record => record.id);
    const staleManualQueueIds = [...manualVerificationIds]
      .filter(id => !unverified.some(record => record.id === id));

    assert.strictEqual(
      missingExplicitState.length,
      0,
      `${missingExplicitState.length} archive records lack explicit TRUE/FALSE verified status: ${missingExplicitState.slice(0, 10).join(', ')}`
    );
    assert.strictEqual(
      undocumented.length,
      0,
      `${undocumented.length} unverified archive records are missing from the manual verification queue: ${undocumented.slice(0, 10).join(', ')}`
    );
    assert.strictEqual(
      underflagged.length,
      0,
      `${underflagged.length} unverified archive records lack low_confidence=TRUE and needs_review=TRUE: ${underflagged.slice(0, 10).join(', ')}`
    );
    assert.strictEqual(
      staleManualQueueIds.length,
      0,
      `${staleManualQueueIds.length} manual verification queue records are not currently unverified: ${staleManualQueueIds.slice(0, 10).join(', ')}`
    );
  });

  it('does not publish the corrupted News Creator Corps duplicate as an archive record', () => {
    assert.ok(
      socialPosts.some(row => row.id === 'BSKY-00119'),
      'canonical Bluesky announcement BSKY-00119 is missing'
    );
    assert.ok(
      socialPosts.some(row => row.id === 'BSKY-00086'),
      'canonical Bluesky follow-up BSKY-00086 is missing'
    );
    assert.strictEqual(
      archiveRecords.some(row => row.id === 'RECORD-00602'),
      false,
      'RECORD-00602 is a contradicted duplicate of canonical social rows'
    );
    assert.strictEqual(
      entities.some(row => row.first_mention_record_id === 'RECORD-00602' || ['C0643', 'O1231'].includes(row.entity_id)),
      false,
      'stale RECORD-00602 graph entities remain'
    );
    assert.strictEqual(
      relationships.some(row => row.source_record_id === 'RECORD-00602' || ['C0643', 'O1231'].includes(row.source_entity_id) || ['C0643', 'O1231'].includes(row.target_entity_id)),
      false,
      'stale RECORD-00602 graph relationships remain'
    );
  });

  it('does not publish the unrecoverable real-work-of-journalism placeholder tweet', () => {
    assert.strictEqual(
      archiveRecords.some(row => row.id === 'RECORD-00613'),
      false,
      'RECORD-00613 has no recovered source and uses AI-guesswork summary text'
    );
    const staleRelatedRecords = archiveRecords
      .filter(row => (row.related_to || '')
        .split(',')
        .map(value => value.trim())
        .includes('RECORD-00613'))
      .map(row => row.id);
    assert.deepStrictEqual(
      staleRelatedRecords,
      [],
      `archive records still reference deleted RECORD-00613: ${staleRelatedRecords.join(', ')}`
    );
  });

  it('does not publish the mismatched TomDispatch composite record', () => {
    const sourceRecord = archiveRecords.find(row => row.id === 'RECORD-00013');
    assert.ok(sourceRecord, 'source-backed Sinclair record RECORD-00013 is missing');
    assert.strictEqual(sourceRecord.url, 'http://archive.pressthink.org/2004/11/16/snclr_vision_p.html');
    assert.strictEqual(sourceRecord.verified, 'TRUE');
    assert.strictEqual(
      archiveRecords.some(row => row.id === 'RECORD-00614'),
      false,
      'RECORD-00614 links a 2004 source while storing unrecovered 2017-era interview text'
    );

    const staleRelatedRecords = archiveRecords
      .filter(row => (row.related_to || '')
        .split(',')
        .map(value => value.trim())
        .includes('RECORD-00614'))
      .map(row => row.id);
    assert.deepStrictEqual(
      staleRelatedRecords,
      [],
      `archive records still reference deleted RECORD-00614: ${staleRelatedRecords.join(', ')}`
    );

    const deletedEntityIds = [
      'P2350',
      'P2351',
      'P2352',
      'O1413',
      'O1414',
      'O1415',
      'O1416',
      'W0759',
      'W0760',
      'C0778',
      'C0779',
      'C0780',
      'C0781',
      'E0270',
      'E0271',
      'L0216',
    ];
    assert.strictEqual(
      entities.some(row => row.first_mention_record_id === 'RECORD-00614' || deletedEntityIds.includes(row.entity_id)),
      false,
      'stale RECORD-00614 graph entities remain'
    );
    assert.strictEqual(
      relationships.some(row => row.source_record_id === 'RECORD-00614' || deletedEntityIds.includes(row.source_entity_id) || deletedEntityIds.includes(row.target_entity_id)),
      false,
      'stale RECORD-00614 graph relationships remain'
    );
  });

  it('HuffPost pilot rows preserve directly observed 2008 source dates', () => {
    const expectedDates = new Map([
      ['RECORD-00861', '2008-07-17'],
      ['RECORD-00864', '2008-07-19'],
      ['RECORD-00871', '2008-07-19'],
    ]);

    for (const [id, expectedDate] of expectedDates) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.strictEqual(record.publication_date, expectedDate, `${id} uses its capture date instead of its source date`);
    }
  });

  it('Radio Open Source episode keeps the direct audio source', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00765');

    assert.ok(record, 'RECORD-00765 is missing');
    assert.strictEqual(record.url, 'https://radioopensource.org/jay-rosen-on-our-media-malaise-who-will-tell-the-people/');
    assert.strictEqual(record.verified, 'TRUE');
    assert.match(record.notes, /https:\/\/content\.blubrry\.com\/radioopensource\/rosendraft02\.mp3/);
  });

  it('HuffPost counterpoint article keeps source metadata', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00904');

    assert.ok(record, 'RECORD-00904 is missing');
    assert.strictEqual(record.url, 'https://www.huffpost.com/entry/a-counterpoint-to-the-vie_b_1079818');
    assert.strictEqual(record.author, 'Caryl Rivers');
    assert.strictEqual(record.publication_date, '2011-11-07');
    assert.strictEqual(record.verified, 'TRUE');
    assert.match(record.raw_text, /transparency is the new objectivity/i);
    assert.match(record.notes, /not the unresolved RECORD-00865 #NN08 micro-post/);
  });

  it('user-supplied campaign coverage links keep verified source metadata', () => {
    const expectedRows = new Map([
      ['RECORD-00910', {
        url: 'https://www.techdirt.com/2014/08/20/real-reporting-is-about-revealing-truth-not-granting-equal-weight-to-bogus-arguments/',
        author: 'Mike Masnick',
        date: '2014-08-20',
        textPattern: /he said\/she said/i,
      }],
      ['RECORD-00906', {
        url: 'https://smartocto.com/blog/smartoctober-constructive-campaign-coverage/',
        author: 'Em Kuntze; Stefan ten Teije',
        date: '2024-10-09',
        textPattern: /not the odds, but the stakes/i,
      }],
      ['RECORD-00907', {
        url: 'https://edition.cnn.com/2023/11/15/media/2024-election-horse-race-stakes-nyu-professor/index.html',
        author: 'Oliver Darcy',
        date: '2023-11-15',
        textPattern: /six words that make up a mantra/i,
      }],
      ['RECORD-00908', {
        url: 'https://www.salon.com/2020/11/11/hey-political-reporters-get-lost-this-is-not-your-moment/',
        author: 'Dan Froomkin',
        date: '2020-11-11',
        textPattern: /two sides/i,
      }],
      ['RECORD-00909', {
        url: 'https://www.youtube.com/watch?v=9seqSeHWqbs',
        author: 'Andy Plesser',
        date: '2011-02-23',
        textPattern: /Journal Register Company/i,
      }],
    ]);

    for (const [id, expected] of expectedRows) {
      const record = archiveRecords.find(row => row.id === id);

      assert.ok(record, `${id} is missing`);
      assert.strictEqual(record.url, expected.url);
      assert.strictEqual(record.author, expected.author);
      assert.strictEqual(record.publication_date, expected.date);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.low_confidence, 'FALSE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.raw_text, expected.textPattern);
      assert.match(record.notes, /2026-07-24/);
    }

    const margaretSullivanRecord = archiveRecords.find(row => row.id === 'RECORD-00726');
    assert.ok(margaretSullivanRecord, 'RECORD-00726 is missing');
    assert.strictEqual(
      margaretSullivanRecord.url,
      'https://margaretsullivan.substack.com/p/a-media-critic-urged-not-the-odds'
    );
  });

  it('keeps the reader-suggested Cascadia Citizens Agenda case study', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00911');
    assert.ok(record, 'RECORD-00911 must remain in the curated archive');
    assert.equal(record.author, 'Jon Bauer');
    assert.equal(record.publication_date, '2026-07-16');
    assert.equal(record.original_publication, 'Cascadia Daily News');
    assert.equal(record.verified, 'TRUE');
    assert.match(record.key_concepts, /(?:^|;)The Citizens' Agenda(?:;|$)/);
    assert.match(record.raw_text, /developed by New York University journalism professor and media critic Jay Rosen/);
    assert.ok(record.raw_text.length < 500, 'brief provenance must not enter the full-text extraction queue');
    assert.match(record.permissions, /full text not redistributed/);
  });

  it('does not publish the unrecoverable NN08 sketchbook fragment', () => {
    assert.strictEqual(
      archiveRecords.some(row => row.id === 'RECORD-00865'),
      false,
      'RECORD-00865 is a fragmentary HuffPost-era NN08 note without a recoverable article source'
    );
    assert.strictEqual(
      relationships.some(row => row.source_record_id === 'RECORD-00865'),
      false,
      'stale RECORD-00865 graph relationships remain'
    );
  });

  it('verified newspaper clips have source-backed relevance', () => {
    const uncertaintyPatterns = [
      /not mentioned/i,
      /\blikely\b/i,
      /\bimplies\b/i,
      /related because/i,
      /hand-selected/i,
      /OCR quality limits identification/i,
      /\bJay Rosenstein\b/i,
      /\bRobert Rosen\b/i,
    ];
    const offenders = archiveRecords
      .filter(record => /newspapers\.com/i.test(record.url || ''))
      .filter(record => /^true$/i.test(record.verified || ''))
      .filter(record => uncertaintyPatterns.some(pattern => pattern.test(record.notes || '')))
      .map(record => record.id);

    assert.deepStrictEqual(
      offenders,
      [],
      `Verified newspaper clips contain unresolved relevance claims: ${offenders.join(', ')}`
    );
  });

  it('newspaper source replays preserve explicit Jay Rosen identifications', () => {
    const sourceEvidence = new Map([
      ['CLIP-00001', /New York University Journalism Professor Jay Rosen/i],
      ['CLIP-00027', /New York University journalism professor Jay Rosen/i],
      ['CLIP-00028', /professor Jay Rosen of New York University/i],
      ['CLIP-00037', /Professor Jay Rosen of New York University/i],
      ['CLIP-00055', /Jay Rosen, director of the Project on Public Life and the Press/i],
      ['CLIP-00063', /NYU journalism professor Jay Rosen/i],
      ['CLIP-00073', /Jay Rosen of New York University/i],
    ]);

    for (const [id, evidencePattern] of sourceEvidence) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.match(record.raw_text, evidencePattern, `${id} lacks its source-backed identification`);
      assert.strictEqual(record.verified, 'TRUE', `${id} must be verified after source replay`);
      assert.notStrictEqual(record.low_confidence, 'TRUE', `${id} must not remain low confidence`);
      assert.notStrictEqual(record.needs_review, 'TRUE', `${id} must not remain in review`);
    }
  });

  it('newspaper source replays preserve page-scan wording for CLIP-00037 and CLIP-00063', () => {
    const clip37 = archiveRecords.find(row => row.id === 'CLIP-00037');
    const clip63 = archiveRecords.find(row => row.id === 'CLIP-00063');

    assert.ok(clip37, 'CLIP-00037 is missing');
    assert.ok(clip63, 'CLIP-00063 is missing');
    assert.match(
      clip37.raw_text,
      /between themselves and the political community; between news and editorial; between facts and values; between information and their beliefs/i
    );
    assert.match(
      clip37.raw_text,
      /The challenge is how to get the connections right, because the connections are what['’]s faltering/i
    );
    assert.match(
      clip63.raw_text,
      /the portrayal of blacks on TV and black viewing habits/i
    );
  });

  it('CLIP-00073 preserves a direct source quotation as its pull quote', () => {
    const record = archiveRecords.find(row => row.id === 'CLIP-00073');
    assert.ok(record, 'CLIP-00073 is missing');
    assert.match(
      record.pull_quote,
      /The big lie.*can show you the world.*is televisable, picturable/i
    );
  });

  it('newspaper missing-text batch 01 preserves source-backed Jay Rosen passages', () => {
    const sourceEvidence = new Map([
      ['CLIP-00064', /New York University professor Jay Rosen[\s\S]*Newspaper readership is an index of one['’]s involvement/i],
      ['CLIP-00065', /New York University professor Jay Rosen[\s\S]*problems with schools, kids, cars, homes, bills/i],
      ['CLIP-00066', /New York University professor Jay Rosen[\s\S]*problems with schools, kids, cars, homes, bills/i],
      ['CLIP-00067', /New York University professor Jay Rosen[\s\S]*problems with schools, kids, cars, homes, bills/i],
      ['CLIP-00068', /government['’]s bond with the audience was stronger than the media['’]s[\s\S]*New York University Journalism Professor Jay Rosen/i],
    ]);

    for (const [id, evidencePattern] of sourceEvidence) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.match(record.raw_text, evidencePattern, `${id} lacks its source-backed passage`);
      assert.match(record.word_count, /^\d+(?:\.0)?$/, `${id} lacks a numeric word count`);
      assert.strictEqual(record.verified, 'TRUE', `${id} must remain verified`);
      assert.notStrictEqual(record.low_confidence, 'TRUE', `${id} must not remain low confidence`);
      assert.notStrictEqual(record.needs_review, 'TRUE', `${id} must not remain in review`);
    }
  });

  it('newspaper missing-text batch 02 preserves source-backed Jay Rosen passages', () => {
    const sourceEvidence = new Map([
      ['CLIP-00069', /government['’]s bond with the audience was stronger than the media['’]s[\s\S]*New York University Journalism Professor Jay Rosen/i],
      ['CLIP-00070', /Simply to sculpt a well-crafted show isn['’]t going to go over with the voters very well[\s\S]*New York University journalism professor Jay Rosen/i],
      ['CLIP-00071', /Professor Jay Rosen of New York University[\s\S]*20th Century Fund study on the 1992 election/i],
      ['CLIP-00072', /New York University journalism professor Jay Rosen describes/i],
      ['CLIP-00074', /New York University journalism professor Jay Rosen writes[\s\S]*To pick up a newspaper and scan the front page[\s\S]*politics and public affairs matter/i],
    ]);
    const unresolvedContinuations = new Set(['CLIP-00071', 'CLIP-00072']);

    for (const [id, evidencePattern] of sourceEvidence) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.match(record.raw_text, evidencePattern, `${id} lacks its source-backed passage`);
      assert.match(record.word_count, /^\d+(?:\.0)?$/, `${id} lacks a numeric word count`);
      assert.strictEqual(record.verified, 'TRUE', `${id} must remain verified`);
      assert.notStrictEqual(record.low_confidence, 'TRUE', `${id} must not remain low confidence`);
      assert.strictEqual(
        record.needs_review === 'TRUE',
        unresolvedContinuations.has(id),
        `${id} has the wrong continuation-review state`
      );
    }
  });

  it('newspaper missing-text batch 03 preserves source-backed Jay Rosen passages', () => {
    const sourceEvidence = new Map([
      ['CLIP-00075', /New York University journalism professor Jay Rosen[\s\S]*character stories about journalists[\s\S]*It['’]s inevitable/i],
      ['CLIP-00076', /New York University professor Jay Rosen[\s\S]*public life to go better[\s\S]*Wendy Orange/i],
      ['CLIP-00077', /David Broder[\s\S]*Jay Rosen[\s\S]*Bill Maxwell[\s\S]*Jay Black/i],
      ['CLIP-00078', /news judgments are judgments[\s\S]*moral plane[\s\S]*New York University journalism professor Jay Rosen/i],
      ['CLIP-00079', /Professor Jay Rosen of the New York University Graduate School of Journalism[\s\S]*fine performance[\s\S]*story like this[\s\S]*far from distinguished itself/i],
    ]);

    for (const [id, evidencePattern] of sourceEvidence) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.match(record.raw_text, evidencePattern, `${id} lacks its source-backed passage`);
      assert.match(record.word_count, /^\d+(?:\.0)?$/, `${id} lacks a numeric word count`);
      assert.strictEqual(record.verified, 'TRUE', `${id} must remain verified`);
      assert.notStrictEqual(record.low_confidence, 'TRUE', `${id} must not remain low confidence`);
      assert.notStrictEqual(record.needs_review, 'TRUE', `${id} must not remain in review`);
    }

    const clip75 = archiveRecords.find(row => row.id === 'CLIP-00075');
    const clip76 = archiveRecords.find(row => row.id === 'CLIP-00076');
    const clip79 = archiveRecords.find(row => row.id === 'CLIP-00079');
    assert.strictEqual(clip75.author, 'Lee Krenis More');
    assert.strictEqual(clip79.author, 'Michael Vaikys');
    assert.doesNotMatch(`${clip76.summary}\n${clip76.notes}`, /New Big Village Renaissance/i);
    assert.doesNotMatch(clip76.raw_text, /Wanda Chappell/i);
  });

  it('newspaper missing-text batch 04 preserves source-backed Jay Rosen passages', () => {
    const sourceEvidence = new Map([
      ['CLIP-00080', /the person is trying to leak it[,”]* said professor Jay Rosen of the New York University journalism department/i],
      ['CLIP-00081', /the person is trying to leak it[,”]* said professor Jay Rosen of the New York University journalism department/i],
      ['CLIP-00082', /He didn['’]t care if you had a better solution to a problem he never felt was real[\s\S]*NYU journalism professor Jay Rosen, who studied under Postman/i],
      ['CLIP-00083', /He didn['’]t care if you had a better solution to a problem he never felt was real[\s\S]*NYU journalism professor Jay Rosen, who studied under Postman/i],
      ['CLIP-00084', /He didn['’]t care if you had a better solution to a problem he never felt was real[\s\S]*NYU journalism professor Jay Rosen, who studied under Mr\. Postman/i],
    ]);

    for (const [id, evidencePattern] of sourceEvidence) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.match(record.raw_text, evidencePattern, `${id} lacks its source-backed passage`);
      assert.match(record.word_count, /^\d+(?:\.0)?$/, `${id} lacks a numeric word count`);
      assert.strictEqual(record.verified, 'TRUE', `${id} must remain verified`);
      assert.notStrictEqual(record.low_confidence, 'TRUE', `${id} must not remain low confidence`);
      assert.notStrictEqual(record.needs_review, 'TRUE', `${id} must not remain in review`);
    }

    for (const id of ['CLIP-00082', 'CLIP-00083', 'CLIP-00084']) {
      const record = archiveRecords.find(row => row.id === id);
      assert.doesNotMatch(
        `${record.summary}\n${record.notes}\n${record.pull_quote}`,
        /doctoral advis(?:o|e)r|media ecology professor|former student and colleague/i,
        `${id} retains a claim not established by its recovered page`
      );
    }

    const clip81 = archiveRecords.find(row => row.id === 'CLIP-00081');
    assert.match(clip81.notes, /CLIP-00080/, 'CLIP-00081 must cite the matching wire-story row');
    assert.doesNotMatch(clip81.notes, /same[^.]*CLIP-00081/i, 'CLIP-00081 must not cite itself as its match');
  });

  it('newspaper missing-text batch 05 preserves source-backed Jay Rosen passages', () => {
    const sourceEvidence = new Map([
      ['CLIP-00085', /Bush administration strategy to geld the media[\s\S]*New York University journalism professor Jay Rosen[\s\S]*downgrade the press as a player within the executive branch/i],
      ['CLIP-00086', /Bush administration strategy to geld the media[\s\S]*New York University journalism professor Jay Rosen[\s\S]*downgrade the press as a player within the executive branch/i],
      ['CLIP-00087', /Bush administration strategy to geld the media[\s\S]*New York University journalism professor Jay Rosen[\s\S]*downgrade the press as a player within the executive branch/i],
      ['CLIP-00088', /early critic, New York University journalism professor Jay Rosen[\s\S]*Barry Diller doesn['’]t have time to hunt down juicy links[\s\S]*Rosen['’]s take turned out to be wildly wrong/i],
    ]);

    for (const [id, evidencePattern] of sourceEvidence) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.match(record.raw_text, evidencePattern, `${id} lacks its source-backed passage`);
      assert.match(record.word_count, /^\d+(?:\.0)?$/, `${id} lacks a numeric word count`);
      assert.ok(record.pull_quote, `${id} lacks a pull quote`);
      assert.ok(record.raw_text.includes(record.pull_quote), `${id} pull quote is not a direct source passage`);
      assert.strictEqual(record.verified, 'TRUE', `${id} must remain verified`);
      assert.notStrictEqual(record.low_confidence, 'TRUE', `${id} must not remain low confidence`);
      assert.notStrictEqual(record.needs_review, 'TRUE', `${id} must not remain in review`);
    }

    const clip88 = archiveRecords.find(row => row.id === 'CLIP-00088');
    assert.doesNotMatch(
      `${clip88.summary}\n${clip88.notes}\n${clip88.pull_quote}`,
      /recognized early|recognized the potential|potential to reshape/i,
      'CLIP-00088 must not reverse the recovered source assessment'
    );

    const clip86 = archiveRecords.find(row => row.id === 'CLIP-00086');
    assert.doesNotMatch(clip86.notes, /CLIP-00082/, 'CLIP-00086 must not cite an unrelated Postman obituary');
    assert.match(clip86.notes, /CLIP-0008[57]/, 'CLIP-00086 must cite a matching Parker syndication');
  });

  it('newspaper source replays exclude the Jay Rosenstein namesake', () => {
    const record = archiveRecords.find(row => row.id === 'CLIP-00023');
    assert.strictEqual(
      record,
      undefined,
      'CLIP-00023 names filmmaker Jay Rosenstein, not NYU journalism professor Jay Rosen'
    );
  });

  it('newspaper clips link to their recovered Drive OCR source', () => {
    const missing = archiveRecords
      .filter(record => /newspapers\.com\/image\//i.test(record.url || ''))
      .filter(record => !/^https:\/\/drive\.google\.com\/file\/d\/[\w-]+$/i.test(record.gdrive_raw_file_link || ''))
      .map(record => record.id);

    assert.deepStrictEqual(
      missing,
      [],
      `Newspaper clips lack a recovered Drive OCR link: ${missing.join(', ')}`
    );
  });

  it('newspaper clips preserve a source excerpt and word count', () => {
    const incomplete = archiveRecords
      .filter(record => /newspapers\.com\/image\//i.test(record.url || ''))
      .flatMap(record => [
        ...(!record.raw_text?.trim() ? [`${record.id}:raw_text`] : []),
        ...(!/^\d+(?:\.\d+)?$/.test(record.word_count || '') ? [`${record.id}:word_count`] : []),
      ]);

    assert.deepStrictEqual(
      incomplete,
      [],
      `Newspaper clips lack source text fields: ${incomplete.join(', ')}`
    );
  });

  it('HuffPost #NN08 imports use source publication years', () => {
    const badDates = archiveRecords
      .filter(record => record.original_publication === 'HuffPost')
      .filter(record => /#NN08|Netroots Nation/i.test(record.title || ''))
      .filter(record => !record.publication_date.startsWith('2008-'))
      .map(record => `${record.id}:${record.publication_date}`);
    assert.strictEqual(
      badDates.length,
      0,
      `${badDates.length} #NN08 records use a capture year instead of 2008: ${badDates.join(', ')}`
    );
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

  it('RECORD-00663 matches The Baffler primary source', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00663');
    assert.ok(record, 'RECORD-00663 is missing');
    assert.strictEqual(record.title, 'Pistols for Two: Jay Rosen vs Thomas Frank');
    assert.strictEqual(
      record.url,
      'https://thebaffler.com/odds-and-ends/pistols-for-two-jay-rosen-vs-thomas-frank'
    );
    assert.strictEqual(
      record.summary,
      'Rosen defends public journalism against Thomas Frank\'s critique, arguing that working within existing institutions can strengthen journalism and democracy. Frank replies that public journalism mistakes audience research for reform and ignores ideology, money, and class.'
    );
    assert.strictEqual(
      record.key_concepts,
      'Public journalism, civil society, media reform, press criticism'
    );
    assert.strictEqual(record.tags, 'Thomas Frank, Robert Warshow, The Baffler');
    assert.strictEqual(
      record.pull_quote,
      'Public journalism is a working-within-the-system move.'
    );
    assert.match(record.notes, /Primary source verified 2026-07-22/);
    assert.match(record.notes, /March 1999/);
    assert.match(record.notes, /full text not stored/i);
    assert.strictEqual(record.verified, 'TRUE');
  });

  it('RECORD-00667 matches the recovered Penn National Commission source', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00667');
    assert.ok(record, 'RECORD-00667 is missing');
    assert.strictEqual(record.title, 'Part of Our World: Journalism as Civic Leadership');
    assert.strictEqual(record.url, 'https://www.upenn.edu/static/pnc/ptrosen.html');
    assert.strictEqual(record.publication_date, '1998-01-01');
    assert.strictEqual(
      record.original_publication,
      'Public Talk: The Online Journal of Discourse Leadership'
    );
    assert.strictEqual(
      record.publisher,
      'Penn National Commission on Society, Culture and Community'
    );
    assert.strictEqual(record.word_count, '7161');
    assert.strictEqual(record.raw_text, '', 'rights-restricted full text must not be redistributed');
    assert.strictEqual(
      record.excerpt,
      'Some years ago, while watching the CBS Evening News, I was startled to hear Dan Rather say, "And that\'s part of our world tonight." Mr. Rather then thanked me for watching, but it was I who wanted to thank him-- for frank acknowledgment of what he and his colleagues actually do.'
    );
    assert.strictEqual(
      record.pull_quote,
      'the press is an active agent in public life, not a passive observer.'
    );
    assert.strictEqual(record.era, 'Public Journalism (90s)');
    assert.strictEqual(record.copyright, 'Trustees of the University of Pennsylvania');
    assert.match(record.permissions, /express written permission/i);
    assert.match(record.notes, /Fall 1998/);
    assert.match(
      record.notes,
      /85f414d02dd4550dc3394d0696330534194afd14409c46009a568c99a1780ec7/
    );
    assert.match(record.notes, /full text not stored/i);
    assert.match(record.notes, /rights notice/i);
    assert.strictEqual(record.verified, 'TRUE');
    assert.strictEqual(record.needs_review, 'FALSE');
  });

  it('recovered PBS and YouTube transcripts preserve source-backed counts', () => {
    const expected = new Map([
      ['RECORD-00728', { wordCount: '4389', duration: '' }],
      ['RECORD-00778', { wordCount: '2641', duration: '1114' }],
      ['RECORD-00779', { wordCount: '987', duration: '528' }],
      ['RECORD-00780', { wordCount: '2489', duration: '852' }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} is missing`);
      assert.strictEqual(record.word_count, source.wordCount, `${id} has a stale transcript word count`);
      assert.strictEqual(record.length_in_seconds, source.duration, `${id} has a stale source duration`);
      assert.strictEqual(record.raw_text, '', `${id} publishes transcript text before rights review`);
      assert.strictEqual(record.needs_review, 'TRUE', `${id} does not flag the pending rights decision`);
      assert.match(record.notes, /transcript recovered 2026-07-23/i);
      assert.match(record.notes, /rights review/i);
    }
  });

  it('RECORD-00039 does not use an unrelated podcast transcript', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00039');
    assert.ok(record, 'RECORD-00039 must exist');
    assert.strictEqual(record.title, 'Disinfo Discussions: The Role of News Media with Jay Rosen');
    assert.strictEqual(record.publisher, 'Aspen Digital');
    assert.strictEqual(record.platform, 'YouTube');
    assert.strictEqual(record.word_count, '4325');
    assert.strictEqual(record.length_in_seconds, '1726');
    assert.match(record.summary, /Vivian Schiller/i);
    assert.match(record.summary, /view from nowhere/i);
    assert.strictEqual(
      record.pull_quote,
      'we need a much more aggressively pro-democracy press than we have now'
    );
    assert.strictEqual(record.raw_text, '', 'RECORD-00039 publishes transcript text before rights review');
    assert.strictEqual(record.needs_review, 'TRUE');
    assert.match(record.notes, /transcript recovered 2026-07-23/i);
    assert.match(record.notes, /rights review/i);
    for (const field of ['summary', 'tags', 'pull_quote', 'raw_text']) {
      assert.doesNotMatch(
        record[field],
        /The Pub|Adam Ragusea|Mercer University/i,
        `RECORD-00039 ${field} retains unrelated podcast material`
      );
    }
  });

  it('RECORD-00043 matches the official Yale video metadata', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00043');
    assert.ok(record, 'RECORD-00043 must exist');
    assert.strictEqual(record.publication_date, '2020-08-02');
    assert.strictEqual(record.publisher, 'Yale Information Society Project');
    assert.strictEqual(record.platform, 'YouTube');
    assert.strictEqual(record.length_in_seconds, '3137');
    assert.strictEqual(record.era, 'Trump Era & Democratic Crisis (2016-2020)');
    assert.strictEqual(record.needs_review, 'TRUE');
    assert.match(record.notes, /Primary source verified 2026-07-23/i);
    assert.match(record.notes, /caption reconciliation pending/i);
  });

  it('RECORD-00075 identifies its official MIT source', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00075');
    assert.ok(record, 'RECORD-00075 must exist');
    assert.strictEqual(record.publisher, 'MIT Communications Forum');
    assert.strictEqual(record.platform, 'Web');
    assert.match(record.notes, /Primary source verified 2026-07-23/i);
    assert.match(record.notes, /edited summary, not a verbatim transcript/i);
  });

  it('HuffPost pilot records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00804', {
        wordCount: '1315',
        summary: "Argues that the internet and political blogs have created a 'Court of Appeal' against traditional press news judgment, using the Downing Street Memo as the leading example.",
        sourceSha: 'beacb9d906cb83dd59aebed6cdc432633dac2cc1595fc16b1db6ca6766deaf6e',
      }],
      ['RECORD-00805', {
        wordCount: '1710',
        excerpt: "In a presidential election, we at least have a theory. The voters are the target, the messages are designed to frighten or outrage or motivate them, and if it works more voters will on election day pick your guy. Political choice and the media campaign connect in a way we can roughly grasp. In the Supreme Court selection, the voters will again be the target, the messages will again be designed to frighten or outrage or motivate them, and if it works... then what? What is the person successfully frightened, outraged or motivated in Peoria supposed to do? Call Arlen Specter's office with demands? He doesn't even represent Peoria!",
        summary: "Critiques press coverage of Sandra Day O'Connor's retirement for describing an impending Supreme Court nomination fight as a national political campaign without explaining how such a campaign could influence senators.",
        sourceSha: '9fc14f0eebbc9cf50542e71df11d163f0d334535dbe0506b42e19a30ab60d21a',
      }],
      ['RECORD-00806', {
        wordCount: '831',
        summary: 'Calls on journalists and news organizations to stop hosting or publishing Robert Novak until he explains his role in the Valerie Plame leak, framing professional solidarity around conscience rather than legal privilege.',
        sourceSha: '90c9d9b5644dbda23c28e1819c8a142e57b33a95add668e59ebf837f51d468ae',
      }],
      ['RECORD-00807', {
        wordCount: '2914',
        excerpt: 'The brutalizing of Scott McClellan at the White House podium on Monday is a development with long roots. They stretch well beyond the particulars of what McClellan earlier said about Karl Rove and the use of Valerie Plame to discredit Joseph Wilson. Frustrations roared to life that day from hundreds of briefings prior:',
        summary: "Describes the Bush White House's 'rollback' strategy toward the press through the confrontation between Scott McClellan and reporters over the Valerie Plame leak.",
        sourceSha: 'ce4632458a00d525a5c92f407a146f0a30bd50320c6157b02f6026d8189446cf',
      }],
      ['RECORD-00808', {
        wordCount: '1968',
        excerpt: 'Thursday afternoon Robert Novak stormed off the set of CNN\'s "Inside Politics" and got himself suspended. He also eluded questions about the Valerie Plame case that were going to be asked by a CNN colleague, anchor Ed Henry, who said he warned Novak before the show began that he would be raising the matter.',
        summary: "Analyzes Robert Novak's on-air walkout from CNN's 'Inside Politics' as a collapse of his prior claim that he could not discuss the Plame case while it was under investigation.",
        sourceSha: '48758fac3372599a701b7054808a2f3b30c9179736ee143f1796f1fe54bf8302',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(record.summary, source.summary);
      if (source.excerpt) assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot two records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00809', {
        url: 'https://www.huffpost.com/entry/the-net-knows-more-than-y_b_7479',
        wordCount: '1932',
        rawTextSha: 'a65618527e74ece0f71e3417e210f206f2dfb06f013b2fefe7212c9be19a1df6',
        summary: "Frames CBS News's Public Eye launch and move online as a test of whether the network learned from its National Guard memo failure, arguing that internet-wide scrutiny and meaningful transparency are necessary to rebuild trust.",
        sourceSha: 'd0020b48e8780773102658e047fbc65014605b2a8f44d85bef530e658cfe00cb',
      }],
      ['RECORD-00810', {
        url: 'https://www.huffpost.com/entry/some-bloggers-meet-the-bo_b_8156',
        wordCount: '2495',
        rawTextSha: '772f29af3f86712375bd4e7cc07c15fcf3d77fa0397fc61bdad6832329fe0190',
        excerpt: 'Wednesday the CBS Building in Manhattan, the one they call Black Rock, was wrapped in yellow crime scene tape, a gimmick to advertise the popular crime scene show, _CSI: NY_, on CBS Wednesday nights. I was rushing by on my way to a roundtable at the nearby Museum of Television and Radio.',
        summary: 'Reports on a roundtable between bloggers and major-media executives about the web transition, including newsroom funding, weak innovation, citizen-reporting verification, and the recognition that legacy news organizations must change.',
        sourceSha: 'fe4a923ffc4b96ca83f48069c81557a4ba66c89f8b484faf78728ce47de684da',
      }],
      ['RECORD-00811', {
        url: 'https://www.huffpost.com/entry/judith-miller-and-her-tim_b_8201',
        wordCount: '1777',
        rawTextSha: 'e38b31853ee526b579da687c3da79892565a9e6a8b4b3c5dcf2b4d2f90be338e',
        excerpt: "In the mystifying drama of Judith Miller and her Times, I am as clueless as the next person about what's really going down. But it seems to me we're watching just that-- the actions of _Judy Miller's_ New York Times.",
        summary: "Argues that Judith Miller's choices in the Plame investigation constrained The New York Times's reporting and muddled its claims about civil disobedience and a federal shield law, because other reporters had negotiated alternatives.",
        sourceSha: '5ca19a4f2a9763c1d61f1ad680da2ab0b38d5ae5b071bd7e8460fe94962435ad',
      }],
      ['RECORD-00812', {
        url: 'https://www.huffpost.com/entry/news-comes-in-code-judy-m_b_8353',
        wordCount: '2434',
        rawTextSha: 'dc2e73ff1ec8d662f9bf3bbb551fb09b47b2d447321bf899ae42b87515f52652',
        excerpt: "Just one man's opinion, but now is a good time to say it: The New York Times is not any longer--in my mind--the greatest newspaper in the land.",
        summary: "Explains why Rosen had come to rank The Washington Post above The New York Times, criticizing the Times for letting Judith Miller's return drive an opaque official narrative instead of reporting the larger story to readers.",
        sourceSha: '6b25262b0280e8c5798f292fd5004c8b2689989bebbdb48f7ee2a74d7e25c701',
      }],
      ['RECORD-00813', {
        url: 'https://www.huffpost.com/entry/the-shimmer-missing-data-_b_8706',
        wordCount: '3363',
        rawTextSha: '11522166ec1bb5f2ec29cc1d31ca4e485b38bde6f01493cea4d8f3aaad75db81',
        excerpt: 'When I talk about pictures in my mind I am talking, quite specifically, about images that shimmer around the edges.',
        summary: "Examines the Times's missing and inconsistent reporting about Judith Miller's notes and grand-jury testimony, arguing that the newspaper had lost the capacity to tell the truth about itself while acting as a participant in the story.",
        sourceSha: 'aaf781128c4dddcafa9d08265d646f94244fae4d767a2c3cd34f950165fdb6be',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.summary, source.summary);
      if (source.excerpt) assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot three records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00814', {
        title: 'The Times at Bay: Armchair Critic Speculates',
        url: 'https://www.huffpost.com/entry/the-times-at-bay-armchair_b_8796',
        wordCount: '2208',
        rawTextSha: 'ebc49f9c2dc89b9edbcca24f7d902b541c97d622f0ec3860763366010f4631e9',
        excerpt: '"We\'ve been left out of this story" is a glimpse into what\'s going on at the Times. Nearly everyone feels that way-- including of course Times readers.',
        summary: 'Rosen speculates that the New York Times is in a "suspended state" over the Judith Miller affair: most of the staff is in the dark, Miller is not cooperating with the internal reporting team, and the paper\'s silence reflects fear of what Fitzgerald\'s investigation may reveal.',
        sourceSha: '617467a0db2be3d02a958b831becf211150b5977eba518ba79c5a72dd65e5f3f',
      }],
      ['RECORD-00815', {
        title: 'The Hypothesis:  Notes on the Judy Miller Situation',
        url: 'https://www.huffpost.com/entry/the-hypothesis-notes-on-t_b_8887',
        wordCount: '2158',
        rawTextSha: '549e8f4193544582b1655d3a50d1225102860d9b6d88bf7004a16f774cc442bb',
        excerpt: 'You have met The Hypothesis. If it dies by reason of being untrue I shall be pleased to report it.',
        summary: 'Rosen tests "The Hypothesis" that Judy Miller would not materially cooperate with the Times reporters investigating her, collecting evidence from news reports, editor statements, and Miller\'s own evasions to support it.',
        sourceSha: '053dc7e03f1b369dc759185a6b5e348f48cef77c69112ce49203c7c51556c925',
      }],
      ['RECORD-00816', {
        title: 'Thanks for the Link, New York Times.   Now Please Answer My Question.',
        url: 'https://www.huffpost.com/entry/thanks-for-the-link-new-y_b_9305',
        wordCount: '4407',
        rawTextSha: 'f33b30dfdf299465a968616e7af31889140c119b684a02370e3ff06386811e33',
        excerpt: 'Wow, nifty new feature. Times tells readers what bloggers are saying about its Miller report.',
        summary: 'Rosen praises the Times for linking to blogger discussion of its Miller report, then presses the paper to answer whether Judith Miller held special security clearances in 2003 and what editors knew about them.',
        sourceSha: 'b8d1ae1a54c51a42684975067fc3f6761067cb752734e528e171ff4a7d7ad7ca',
      }],
      ['RECORD-00817', {
        title: 'Public Editor Tries to Find Out: Did Miller Have a Security Clearance?',
        url: 'https://www.huffpost.com/entry/public-editor-tries-to-fi_b_9341',
        wordCount: '357',
        rawTextSha: '1144c677b685c4b18cede6d3cac86eb0924d2101ab8abf3d08983cf99f9fc612',
        excerpt: 'My guess is the Times had as much trouble as I did trying to figure out from Miller\'s fantasia what her clearances actually were.',
        summary: 'Rosen notes that Times public editor Barney Calame could not confirm whether Judith Miller held a security clearance, treats Miller as an unreliable narrator, and argues the Times should sever ties with her.',
        sourceSha: '7774370df5aaef64e26d76b30fc67cf4899ef7bcb0cb1b9a1794cb09ed499ae8',
      }],
      ['RECORD-00818', {
        title: '"We Regret Nothing."  Times Editorial Page Breaks Silence on Miller Case',
        url: 'https://www.huffpost.com/entry/we-regret-nothing-times-e_b_9792',
        wordCount: '1314',
        rawTextSha: '7a0e6d06c0df033028cdb6ade170bd6a6172fdf189e6ded273bbd1e164dfd51d',
        excerpt: 'There was a break today in the silence that had fallen over the New York Times editorial page in the matter of Judith Miller.',
        summary: 'Rosen criticizes the Times editorial page for breaking its silence only to reaffirm support for Judith Miller, ignoring internal dissent and Keller\'s regrets, while the paper still refuses to answer the security-clearance question.',
        sourceSha: '2c40d62c2edd1b992220d625fbc1af0ea67eb728d8f3bcb5536695ace6d4af2f',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot four records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00819', {
        title: 'Will theTimes Ever Tell Us If Judy Miller Had a Security Clearance?',
        url: 'https://www.huffpost.com/entry/will-thetimes-ever-tell-u_b_10300',
        publicationDate: '2005-11-08',
        wordCount: '1504',
        rawTextSha: '4f3318e9b6d172fd505ba46750b9ba7945a2a6d86abfac975cbb044476b87da5',
        excerpt: 'In my view we have no reason to trust what Miller says; if the Times lets her explanations stand, it will have given a publicly unintelligible reply.',
        summary: 'Rosen argues that Judy Miller\'s admission that she held a security clearance from the Pentagon undermines her credibility and that the New York Times must publicly correct or explain the claim rather than let Miller\'s account stand.',
        sourceSha: '8bcbf31474426f4974dbaa90fa25601dd2b2bca721a0ccd2ad7a137ae49f66b3',
      }],
      ['RECORD-00820', {
        title: 'Truthtelling in the Style of Ed Meese:  Arthur Sulzberger, Jr. on Charlie Rose',
        url: 'https://www.huffpost.com/entry/truthtelling-in-the-style_b_10573',
        publicationDate: '2005-11-13',
        wordCount: '872',
        rawTextSha: 'e90dd843a0e303feb5f7ea3d8bf53be0497173ba5cd04c713aa700a52d5ba558',
        excerpt: 'The worst thing about Sulzberger\'s performance was how badly he needed to be good on Charlie Rose that night.',
        summary: 'Rosen criticizes Arthur Sulzberger Jr.\'s appearance on Charlie Rose as evasive and damaging, comparing his refusal to acknowledge the Times\' failures to the obfuscation associated with Ed Meese.',
        sourceSha: '31cebab96b229a70f02a005fa316afe319f193af58ad1aa44e5185f9410db1cc',
      }],
      ['RECORD-00821', {
        title: 'The Main Street Strategy For Selling Knight-Ridder',
        url: 'https://www.huffpost.com/entry/the-main-street-strategy-_b_10953',
        publicationDate: '2005-11-20',
        wordCount: '1123',
        rawTextSha: 'a6bb50d3caaf38a5335d5a1c177c77d19b7a65b2466e9f86c3412e35169c5c6b',
        excerpt: 'Knight-Ridder announces that rather than sell to another big company or get bought, it has another plan: to break itself up.',
        summary: 'Rosen proposes that Knight-Ridder avoid a Wall Street sale by breaking itself into locally owned papers, giving individual newsrooms and communities control rather than selling to a single national buyer.',
        sourceSha: 'cd621bdf7562a72b19e265a429368dc94387ef5b9cbd2f447d3c3f52a59e7dda',
      }],
      ['RECORD-00822', {
        title: 'Wrong When the Governor is Wrong: A Small Detail in the Mis-reporting of the Miners\' Deaths',
        url: 'https://www.huffpost.com/entry/wrong-when-the-governor-i_b_13465',
        publicationDate: '2006-01-08',
        wordCount: '1506',
        rawTextSha: '784c1c7a28dddc486f50bf9645c1c4013baeb725a2330acd19bfab13fd8d750d',
        excerpt: 'There\'s a little detail in the misreporting of the West Virgina miners\' deaths that you should know about.',
        summary: 'Rosen examines how CNN and other outlets spread false reports that West Virginia miners had survived because they followed the governor\'s statements instead of staying at the official briefing site with the local reporter who kept asking questions.',
        sourceSha: '0110fd3d96185a8aefeec255761244444148a8454405a758171883318a59ad59',
      }],
      ['RECORD-00823', {
        title: 'Transparency at the Post: Q & A with Jim Brady of Washingtonpost.com',
        url: 'https://www.huffpost.com/entry/transparency-at-the-post-_b_14206',
        publicationDate: '2006-01-21',
        wordCount: '2661',
        rawTextSha: '52dbc7e429a6105dca7469ceeae2d34e63b774d7fa8c54da6c0b580bd0f6c036',
        excerpt: 'When Jim Brady decides to shut down the comments at post.blog to prevent even bigger problems we\'re going backwards in our ability to have a conversation with the Washington Post.',
        summary: 'In a Q&A with Washingtonpost.com executive editor Jim Brady, Rosen explores the Post\'s decision to shut down comments on post.blog after the Deborah Howell controversy and asks what transparency means when online conversation is closed off.',
        sourceSha: '5d9a659c916258d8c4450572f55977320195e21c3b354e43557d9004084385d6',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot five records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00824', {
        title: '"What if Bush Changed the Game on You?" My 1,107-Word Question to the Political Press',
        url: 'https://www.huffpost.com/entry/what-if-bush-changed-the-_b_16046',
        publicationDate: '2006-02-20',
        wordCount: '1685',
        rawTextSha: '8497022d9e3f4c0dd25a6e9abd90fdaccfd04f84282cdf50d44fce7b1879742d',
        excerpt: 'I think the Bush years have been a disaster for the Washington press.',
        summary: 'Rosen argues that the Bush White House has deliberately changed the terms of engagement with the Washington press corps, weakening the old consensus in which presidents needed the press to communicate and journalists needed access to power.',
        sourceSha: '7051ed933288032495c5bad878e293a9fcdf52113ea743be85bca8ea56135d89',
      }],
      ['RECORD-00825', {
        title: 'The Six Degrees of Newspaper Blogging and Why the Guardian is Ahead',
        url: 'https://www.huffpost.com/entry/the-six-degrees-of-newspa_b_17308',
        publicationDate: '2006-03-15',
        wordCount: '2506',
        rawTextSha: '21145c53efaed99b831648aa4e1bd5fc739d411e048e56fd1e55c6e86ea8c64e',
        summary: "Rosen uses the launch of the Guardian's comment-is-free site to argue that newspapers should move beyond simply starting blogs and instead create aggregator-style platforms that add value through reader engagement and local blogger participation.",
        sourceSha: '94bce2116bcf5340ff028eca71918ad628503236cf08720db40f0b0169d8fa0b',
      }],
      ['RECORD-00826', {
        title: 'The Pledge: Philly Newspapers Bought by Local Big Shots',
        url: 'https://www.huffpost.com/entry/the-pledge-philly-newspap_b_22189',
        publicationDate: '2006-06-05',
        wordCount: '3119',
        rawTextSha: 'dd16776f341689fe504f945d7eb5dcd4c5edd0d3ba9aa0c21bdcd66b52c69018',
        summary: "Rosen examines the Philadelphia newspapers' sale to local investors and the pledge to protect editorial independence, asking whether local, civic-minded ownership can sustain journalism that serves the city rather than purely commercial interests.",
        sourceSha: 'daffd85294ae3a18eae8ecffae7344b1ed9821d1afacf8f627fdf6dea37724c4',
      }],
      ['RECORD-00827', {
        title: '"We are Covering the War on Terror, It\'s a Classified War."',
        url: 'https://www.huffpost.com/entry/we-are-covering-the-war-o_b_24723',
        publicationDate: '2006-07-10',
        wordCount: '2464',
        rawTextSha: '715c75d8b280d36408366f8fadfb1fefe205c1729e490994fcbe8e9d3f0b83d1',
        excerpt: "Whether the journalism is handcrafted and opinionated, or mass-produced and just-the-facts, the press isn't trustable unless it is independent of the people in charge, and stands apart from interest groups competing for power.",
        summary: "Rosen reflects on the New York Times and Los Angeles Times stories about secret government tracking of global bank transfers, arguing that the press's legitimacy depends on independence, verification, transparency, and truthtelling rather than on a claim to represent the public will.",
        sourceSha: '8ea78a6e0d9acab0367e72acb3e816f56b48b63e91ac88696696ebebf756bc91',
      }],
      ['RECORD-00828', {
        title: 'Political Ergonomics and the Launch of an Open Source Photo Essay',
        url: 'https://www.huffpost.com/entry/political-ergonomics-and-_b_33042',
        publicationDate: '2006-11-01',
        wordCount: '1287',
        rawTextSha: '66131e229eb76e5068ab58b9b18dd91d6180cebe2170a6579fd116227055f53f',
        excerpt: 'Could we do it ourselves, without waiting for the news media to transcend its election day cliches?',
        summary: 'Rosen introduces the Polling Place Photo Project, an open-source photography effort to document Americans voting, and frames it as an exercise in political ergonomics that could improve how elections are understood and experienced.',
        sourceSha: 'a7d709877bd6724334735409e3327b558ad45688cd3136be85bcf8fba89956e4',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      if (source.excerpt) assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot six records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00829', {
        title: 'Extra!  Extra! John Harris and Jim VandeHei to Pull Back the Curtain on Official Washington!',
        url: 'https://www.huffpost.com/entry/extra-extra-john-harris-a_b_34826',
        publicationDate: '2006-11-24',
        wordCount: '1595',
        rawTextSha: '7d7c468319a71132e3ae82eb476dc95fc261d786308c895efde61e81eeea3dd8',
        summary: 'Rosen examines John Harris and Jim VandeHei\'s move from the Washington Post to an Allbritton political news venture and argues that its "next generation" rhetoric masks a conventional insider model rather than a genuine break with traditional political journalism.',
        sourceSha: 'd016a2d297345b93c34e2f56feefcb4e273d2dd4ebca4f438600b2b35d93c1f4',
      }],
      ['RECORD-00830', {
        title: 'The Retreat from Empiricism and Ron Suskind\'s Intellectual Scoop',
        url: 'https://www.huffpost.com/entry/the-retreat-from-empirici_b_36772',
        publicationDate: '2006-12-20',
        wordCount: '3406',
        rawTextSha: '885e4df566bf98f1c5b5b13c719409dc7da884422376d7c171f58aaf6154295e',
        excerpt: 'The press is capable of doing that--fuzzing things up--because it never came to terms with what Suskind reported in 2004. Of course, neither did the political system. Or the Republican party, or its sensible wing-- the elders, the responsible people.',
        pullQuote: 'Even realism has an obligation to be realistic.',
        summary: 'Rosen argues that Ron Suskind\'s reporting captured a deeper "retreat from empiricism" in the Bush administration, and that the press and political class have failed to absorb that story even as realism returns to foreign-policy debate.',
        sourceSha: 'b535887edd0d17740967ee370ff05d7b8a90fc32b3a6caf3809ea95851b48005',
      }],
      ['RECORD-00831', {
        title: 'Situation Grave and Deteriorating for the Agnewocracy',
        url: 'https://www.huffpost.com/entry/situation-grave-and-deter_b_38525',
        publicationDate: '2007-01-12',
        wordCount: '2485',
        rawTextSha: '50df721eccc696cdce7631fc2216596389f9b5af59e6dff24ee976d95f44ea21',
        summary: 'Rosen uses the Jamil Hussein/AP dispute and conservative admissions by Rich Lowry and Max Boot to argue that the conservative "Agnewocracy" bias campaign left many on the right unable to accept bad news from Iraq, while the mainstream press proved the more reliable reality check.',
        sourceSha: 'a9a6e60cd82c283e642ac1e3179d69ffce58cb0fa76691093bc8a265b7ccaaf6',
      }],
      ['RECORD-00832', {
        title: 'Participate in Politics by Covering the Campaign',
        url: 'https://www.huffpost.com/entry/participate-in-politics-b_b_44327',
        publicationDate: '2007-03-27',
        wordCount: '659',
        rawTextSha: '161467c80c2f0efc571cda3d2dcce62589e786dd5e925b3856071d65d848ec58',
        excerpt: 'Our idea is not complicated: it\'s campaign reporting by a great many more people than would ever fit on the bus that the boys (and girls) of the press have famously gotten on and off every four years, as they try to cover the race for president.',
        summary: 'Rosen announces a Huffington Post/NewAssignment.Net partnership for the 2008 campaign that will enlist many volunteer contributors to cover candidate beats, proposing a distributed, pro-am alternative to traditional bus journalism.',
        sourceSha: '87b7a2761efb53600d8060016d4c7017233e1acceac2389d832d567851d67a6d',
      }],
      ['RECORD-00833', {
        title: 'That Man Tried to Run You Over. Why Are You Having Dinner With Him?',
        url: 'https://www.huffpost.com/entry/that-man-tried-to-run-you_b_47427',
        publicationDate: '2007-05-02',
        wordCount: '2109',
        rawTextSha: '7b2dd0891a093c4b2f69d0af992e569a3d83dd550c05c3b9286174b5be10c349',
        excerpt: 'Bush broke with the consensus that created the modern White House press corps. One small but highly symbolic part of the consensus was the Correspondents dinner, and this is why it matters that the New York Times has quit the event.',
        summary: 'Rosen welcomes the New York Times\' withdrawal from the White House Correspondents Association dinner as a symbolic rejection of the Bush-era consensus that marginalized the press, and criticizes journalism\'s reluctance to confront that structural failure.',
        sourceSha: '2f386c7227b9c2c40e1421fad3a29ef6085f6238d418b6653f9a6390d7eda0b1',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      if (source.excerpt) assert.strictEqual(record.excerpt, source.excerpt);
      if (source.pullQuote) assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot seven records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00834', {
        title: '"Something Quite Breathtaking." My Exchange with Neil Lewis of the New York Times',
        url: 'https://www.huffpost.com/entry/something-quite-breathtak_b_48081',
        publicationDate: '2007-05-10',
        wordCount: '1382',
        rawTextSha: '96ba2f0ec0896fbbeeca7be441986fe88ca905324f71dec5b7a5f611a7d77a2a',
        excerpt: 'I told Rutenberg there were reasons for the mistrust of the dinner that had little to do with activists clashing with journalists and everything to do with the history of Bush and the press.',
        pullQuote: 'Neil Lewis, a Washington correspondent for the New York Times, wrote me about my criticisms of his colleague, Jim Rutenberg, in a previous post.',
        summary: 'Jay Rosen publishes an on-the-record exchange with New York Times correspondent Neil Lewis about press ethics, the White House Correspondents\' Dinner, and the American press\'s failure to challenge the run-up to the Iraq war.',
        sourceSha: '6292d2c7b29cd7edbfd108b3474bba73db86180cb45a8c47b96b711ce38b6ff7',
      }],
      ['RECORD-00835', {
        title: 'A Blog is a Little First Amendment Machine',
        url: 'https://www.huffpost.com/entry/a-blog-is-a-little-first-_b_50164',
        publicationDate: '2007-05-31',
        wordCount: '1953',
        rawTextSha: '2ac6f4db91b50324e3ee2298aec2481e51ef750a7c144c69399de735bf964b35',
        excerpt: 'I\'m going to tell you some stories that I think illustrate the disruptive effects that blogging has had, and the democratic potential it represents.',
        pullQuote: 'When in the eighteenth century the press first appeared on the political stage the people on the other end of it were known as the public.',
        summary: 'Rosen uses five stories as parables to argue that blogging acts as a \'little First Amendment machine,\' disrupting one-way mass media and opening democratic possibilities for journalism.',
        sourceSha: '8116ec769f23f380eafbbc50c18fca6ce8e70302b35d18ddc171b88e05c3831c',
      }],
      ['RECORD-00836', {
        title: 'Twilight for the Curmudgeons',
        url: 'https://www.huffpost.com/entry/twilight-for-the-curmudge_b_50881',
        publicationDate: '2007-06-06',
        wordCount: '1442',
        rawTextSha: '44a2c7ea01bb3fea693b80e532e6cd64f008590a478de12c69435b9636fbc4db',
        excerpt: 'Neil Henry (ex-Washington Post, now at Berkeley J-School) wants reparations from Google for what it\'s done to news.',
        pullQuote: 'Link rot must not be allowed to set in, for this is a document.',
        summary: 'Rosen responds to Neil Henry\'s call for Google reparations to old media and argues that the curmudgeon class in newsrooms and journalism schools has lost the people best able to save the business.',
        sourceSha: '010890aa45ff0034c56d4ee2b39e9e4ebec228c43d7464fe7e23f7f474506d17',
      }],
      ['RECORD-00837', {
        title: 'Who\'s Ahead?  No, Seriously...',
        url: 'https://www.huffpost.com/entry/whos-ahead-no-seriously_b_52344',
        publicationDate: '2007-06-15',
        wordCount: '1281',
        rawTextSha: 'e4659a1095c479a5eff21149d951f022cf13a46e5136a4e7839994fa39c51e84',
        excerpt: 'Even when they stop making a lot of sense culturally they may still make for consensus within an occupational culture, and thus prevail past their date of expiration.',
        pullQuote: 'It\'s nice to know that Mitt Romney has pulled ahead in New Hampshire, seven months before the primary voting.',
        summary: 'Rosen critiques the horse-race frame of campaign coverage and asks which candidates are \'ahead\' on substantive issues such as health care, civil liberties, education, and the Internet rather than on polls alone.',
        sourceSha: '4628b4b90e858ab36b118250ce4c0d7756bf1abceb7f98c02cdf3b1002ca8cd7',
      }],
      ['RECORD-00838', {
        title: 'OffTheBus.Net Hires Two People Who Know How to Organize 200',
        url: 'https://www.huffpost.com/entry/offthebusnet-hires-two-pe_b_52732',
        publicationDate: '2007-06-19',
        wordCount: '1196',
        rawTextSha: 'bd90443d9003ce718ac742280f1eeba9eec845432187522eb8a32890ac643083',
        excerpt: 'Some big news today for OffTheBus.Net, the joint venture in campaign journalism I have undertaken with Arianna Huffington and the Huffington Post.',
        pullQuote: 'Some big news today for OffTheBus.Net, the joint venture in campaign journalism I have undertaken with Arianna Huffington and the Huffington Post.',
        summary: 'Rosen announces that OffTheBus.Net, a citizen-campaign-journalism venture with the Huffington Post, has hired Amanda Michel and Zack Exley to organize volunteer coverage of the 2008 presidential race.',
        sourceSha: '7ec2a3303f6142f22daea3467b431f5fed7f18ad0a8ee5302c5a83a77a3c3030',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot eight records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00839', {
        title: 'Zack Exley and Amanda Michel Join OffTheBus.Net. Press Release, June 19, 2007',
        url: 'https://www.huffpost.com/entry/zack-exley-and-amanda-mic_b_52733',
        publicationDate: '2007-06-19',
        wordCount: '1093',
        rawTextSha: 'f3ce208cfbf90973b446ba13cb3055506510ff7d1462a43aeb1e2107929e99a7',
        excerpt: 'Political Organizers Amanda Michel and Zack Exley, Specialists in Use of the Internet, Join OffTheBus.Net for the 2008 cycle.',
        pullQuote: 'Michel will be Project Director; Exley will be Senior Adviser and a traveling correspondent.',
        summary: 'Huffington Post and NewAssignment.Net announce that Internet organizers Amanda Michel and Zack Exley have joined OffTheBus.Net as project director and senior adviser for the 2008 campaign cycle.',
        sourceSha: '64c525c4fdab94598ed8bd923714e5ecf253fa9ea6ab95081061aecd5a8c9a17',
      }],
      ['RECORD-00840', {
        title: 'Printing Press Progressives at Mother Jones Try to Debunk the Political Web',
        url: 'https://www.huffpost.com/entry/printing-press-progressiv_b_54281',
        publicationDate: '2007-06-29',
        wordCount: '2012',
        rawTextSha: 'e1f01fceeead58913426e8550df3a70c134819788b7506b8ca29dfc130d59f51',
        excerpt: 'Mother Jones magazine has come out with a special Politics 2.0 package.',
        pullQuote: 'Mother Jones_ magazine has come out with a special Politics 2.0 package.',
        summary: 'Rosen criticizes Mother Jones\'s framing of its Politics 2.0 package as simplistic, hype-driven false alternatives while praising the package\'s interviews as more grounded.',
        sourceSha: '9cefc4113b850579158d1afd05b188b9b226427519f218388a5fc3963cd67080',
      }],
      ['RECORD-00841', {
        title: 'About OffTheBus',
        url: 'https://www.huffpost.com/entry/about-offthebus_1_b_56446',
        publicationDate: '2007-07-16',
        wordCount: '418',
        rawTextSha: '288200500a2215aca17ffddf3694da7170f894e89e828df23e75d5053ac36e34',
        excerpt: 'Off The Bus is a news and opinion site about the 2008 election and the race for the White House.',
        pullQuote: 'Off The Bus is a news and opinion site about the 2008 election and the race for the White House.',
        summary: 'OffTheBus is introduced as an open, pro-am campaign news bureau created by NewAssignment.Net and the Huffington Post, combining unedited citizen blogs with filtered, edited sections and collaborative reporting projects.',
        sourceSha: 'cc43debf33cd7a300cad3820192381508c90cf3c9dc27d232ab055971ec86647',
      }],
      ['RECORD-00842', {
        title: 'The Hair Beat, the Politics of No Politics, and the Mystery Driver for OffTheBus',
        url: 'https://www.huffpost.com/entry/the-hair-beat-the-politic_b_57410',
        publicationDate: '2007-07-23',
        wordCount: '1697',
        rawTextSha: '36ce28e28690374243c90ee8bfd309f29696261daea6b319910c71a687eed714',
        excerpt: 'Frank Sennett is a columnist and writes two blogs for the Spokesman-Review in Spokane, one of my favorite local newspapers run by one of my favorite editors, Steve Smith, pioneer of the transparent newsroom.',
        pullQuote: 'Now Blogspotter ("making sense of the blog world so you don\'t have to") and Hard 7 ("the culture of politics and the politics of culture") are both Sennett spaces.',
        summary: 'In a Q&A with Spokesman-Review columnist Frank Sennett, Rosen discusses OffTheBus\'s rolling launch, contributor standards and support, reporting structure, and editorial identity within its Huffington Post partnership.',
        sourceSha: '381f2cae7f419e2624b7710ffffbe3de06eeda388de0e606d982a2ab48f447cc',
      }],
      ['RECORD-00843', {
        title: 'Tips on How to Write a Post for OffTheBus & Possibly Make  the Front Page',
        url: 'https://www.huffpost.com/entry/tips-on-how-to-write-a-po_b_58058',
        publicationDate: '2007-07-30',
        wordCount: '1969',
        rawTextSha: '316365e02a08c97e09e62b48cf0d58be60ee711140cbdb58de2f5725cedd2a91',
        excerpt: 'Many of the people who signed up with us are seeking some guidance-- asking, in effect, what do you want? We\'re hoping that if we can get on the same page with contributors about what makes a good post for OffTheBus, then the site will soon start rocking. The following Q and A is intended to move that along.',
        pullQuote: 'As things start rolling at OffTheBus, we\'re getting a lot of inquiries about effective blog posts, which is good.',
        summary: 'Rosen offers contributors guidance on writing effective OffTheBus posts, emphasizing original reporting, timeliness, sourcing, and how to get a piece promoted to the front page.',
        sourceSha: 'a4db8e9aa4a6001ae00fa06b61551f3c5a5f4918f3d7ad7c5c3eddae355a9f87',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot nine records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00844', {
        title: 'The Agitators: Notes From Day One of YearlyKos',
        url: 'https://www.huffpost.com/entry/the-agitators-notes-from_b_58984',
        publicationDate: '2007-08-03',
        wordCount: '1356',
        rawTextSha: '2f9cbe196f818a33fba9b939dab06656ea0320e13c2d70b3f96f169e877306b6',
        excerpt: 'Bloggers aggregate attention to politics. Therefore they get attention from politicians. The press lives off politics, these Kossacks live for it.',
        pullQuote: 'And I don\'t mean for a second that Kos is the CEO with the ideas and Cooper the efficient aide who carries out those ideas.',
        summary: 'Reporting from YearlyKos, Rosen argues that Gina Cooper and the netroots volunteers, not only Markos Moulitsas, built the event\'s political force. He links the convention\'s influence to bloggers\' aggregated attention, participation, and OffTheBus\'s open campaign-reporting model.',
        sourceSha: '81efb4c1054eadda15748ffea8cfc0afe3232fc62ddda9079a3a6719c805b3ef',
      }],
      ['RECORD-00845', {
        title: 'Why Do We Suck? and Other Questions Political Journalists Asked Themselves at YearlyKos',
        url: 'https://www.huffpost.com/entry/why-do-we-suck-and-other_b_59252',
        publicationDate: '2007-08-06',
        wordCount: '1490',
        rawTextSha: '7cb479564dd03633b2c7bb786bc04dd2deb830be1fdcf0fc199d392f99dd0064',
        excerpt: '"My readers know more than I do" had always been true, but it took the Internet for that knowledge to be forwarded into journalism. Now it\'s manifest in the professional lives of political reporters.',
        pullQuote: 'My main conclusion: more respect expressed for the blogosphere, and a little less wariness between the two groups.',
        summary: 'Rosen reviews press coverage of YearlyKos and finds more respect between political reporters and the liberal blogosphere than in earlier years. He argues that reporters are absorbing Dan Gillmor\'s lesson that readers know more than they do, though wariness and Iraq-war accountability remain unresolved.',
        sourceSha: 'ab3c305fded823f14ed251b7398f3b06d5aa40280ef74d252ca4330b7c353dd7',
      }],
      ['RECORD-00846', {
        title: 'Karl Rove and the Cult of Savviness in Our Political Press',
        url: 'https://www.huffpost.com/entry/karl-rove-and-the-cult-of_b_60411',
        publicationDate: '2007-08-14',
        wordCount: '1146',
        rawTextSha: '72dbfb5246cc8b0d683d29118ec10edc3782f27aac264326a0363860b735fd88',
        excerpt: 'I think that the real -- and undeclared -- ideology of American journalism is savviness, which is what made the press so vulnerable to the likes of Karl Rove.',
        pullQuote: 'Conservatives think the ideology of the Washington press corps is liberal.',
        summary: 'Rosen uses Karl Rove\'s resignation to argue that American political journalism\'s undeclared ideology is savviness. He says reporters admired Rove\'s tactical skill so much that they underplayed his extremism and the damage his politics did.',
        sourceSha: 'd1aa601f359f0032c03450a61053dcdd3540f447468d99a1f85ef5e773ba5920',
      }],
      ['RECORD-00847', {
        title: '"Would You Guys Like us to Come Without You?"',
        url: 'https://www.huffpost.com/entry/would-you-guys-like-us-to_b_63176',
        publicationDate: '2007-09-05',
        wordCount: '2001',
        rawTextSha: '6f3fe544e2f1f293534b5fd35771c0cb1b874c807b8b90f75c7a8d35aee2e3b4',
        excerpt: 'The press is not capable of making an independent decision denying the president his spin zone with a dateline in Iraq. When the White House says we\'re going, they\'re going.',
        pullQuote: 'National Security Adviser Stephen Hadley had a good question for the White House press corps Monday, when the President--surprise!--flew to Iraq.',
        summary: 'Rosen criticizes White House reporters for accepting President Bush\'s surprise Iraq trip as a necessary assignment even when it functioned as a managed propaganda event. He argues that the press corps lacked the independence to deny the president a spin zone with an Iraq dateline.',
        sourceSha: 'd86954cf867853a02f6564c6497d299cdebbe31aff264aa6484b48742ee1d92c',
      }],
      ['RECORD-00848', {
        title: 'The Master Narrative that Went Missing During the Bush Presidency',
        url: 'https://www.huffpost.com/entry/the-master-narrative-that_b_64213',
        publicationDate: '2007-09-13',
        wordCount: '2206',
        rawTextSha: '5e049405834c366b060928c123c539598e04f720395a35d77531e15c2bd6e48d',
        excerpt: 'The story that produces lots of other stories should have been the hellbent expansion of executive power, and the go-it-alone politics that followed from it.',
        pullQuote: 'Some new developments this week in the continuing story of how the press was overawed by the Administration of George W.',
        summary: 'Rosen argues that Bush-era coverage lacked the master narrative of executive-power expansion. He points to Charlie Savage, Jack Goldsmith, and the Cheney project as evidence that the press needed a connecting story about maximal executive power rather than isolated campaign and policy episodes.',
        sourceSha: '02251d36950723d42159dd8070954f1d02d0cd27c2106228ee93a9a799c7532e',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-24/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot ten records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00849', {
        title: 'Rather Unbound',
        url: 'https://www.huffpost.com/entry/rather-unbound_b_65563',
        publicationDate: '2007-09-24',
        wordCount: '1202',
        rawTextSha: '3340135a7b379a8633e36b8f7c95aa0c27a38b6b261eeeb827d202470755fb1a',
        excerpt: 'If I were to underline one thing about Dan Rather\'s $70 million suit against CBS, it\'s the theatricality of it, which is also the key to understanding Rather himself.',
        pullQuote: 'If I were to underline one thing about Dan Rather\'s $70 million suit against CBS, it\'s the _theatricality_ of it, which is also the key to understanding Rather himself.',
        summary: 'Rosen reads Dan Rather\'s lawsuit against CBS as a theatrical attempt to replay Rathergate and revive Rather\'s self-image as a driven reporter. He argues that the case is less about money than about putting CBS, the Bush National Guard story, and Rather\'s own legacy back on stage.',
        sourceSha: 'b6741da8baf7628d4237fa9528672f9a6d24b37fec76b06c44292ec5027e1eab',
      }],
      ['RECORD-00850', {
        title: 'The Hill Restores Armstrong Williams to Legitimacy. Why?',
        url: 'https://www.huffpost.com/entry/the-hill-restores-armstro_b_77979',
        publicationDate: '2007-12-23',
        wordCount: '1124',
        rawTextSha: '75c77a15a60f496db735f7d9529d82570c53c1caa3bbce1b8e5f13acee49d4f4',
        excerpt: 'HuffPost readers will certainly remember Armstrong Williams, the conservative pundit, and TV talk show host who took $240,000 from the Department of Education to promote the No Child Left Behind Act on his show and in his column.',
        pullQuote: 'He didn\'t disclose the deal because he couldn\'t disclose it without exposing the contract as fraudulent.',
        summary: 'Rosen questions The Hill\'s decision to restore Armstrong Williams as a pundit after the 2005 Department of Education payola scandal. Through a Q&A with editor Hugo Gurdon, he presses whether Williams\'s undisclosed government contract made his journalism, broadcasting, public relations, and government contracting work ethically fraudulent.',
        sourceSha: '2229ffaf2eca673c5151ff1d889c7122014d59125f623ad935a0bf5e59ba43dc',
      }],
      ['RECORD-00851', {
        title: 'Yahoos Within the GOP Coalition Challenged on their Media Think',
        url: 'https://www.huffpost.com/entry/yahoos-within-the-gop-coa_b_78654',
        publicationDate: '2007-12-29',
        wordCount: '1764',
        rawTextSha: '761fffa4f70e34427eafb1d8b042f0da5fe4a77a967b60086c794229e1d85dea',
        excerpt: 'One answer would be, for conservatives who have actually been in power, the liberal media thesis is a bit like the theory of intelligent design is for Rich Lowry and Peggy Noonan: an intellectual embarrassment.',
        pullQuote: 'John Cole ("Enjoy your new GOP, folks...") and Andrew Sullivan ("This is their party. And they asked for every last bit of it...") pounced on the squirming shown as Huckabee climbed in the polls during December.',
        summary: 'Rosen argues that Mike Huckabee\'s rise exposed contempt for social conservatives among conservative elites while hard-line liberal-media claims persisted in other parts of the GOP coalition. He contrasts that thesis with Dan Bartlett, Karl Rove, and Ari Fleischer treating the press as more professional, varied, and independent than the yahoo version allows.',
        sourceSha: '094c0b519ef803c83f504f13395f6017875d5c7f1260fcf8c50058fc1e3e3659',
      }],
      ['RECORD-00852', {
        title: 'When Candidate "Vetting" Runs off the Rails',
        url: 'https://www.huffpost.com/entry/when-candidate-vetting-ru_b_88924',
        publicationDate: '2008-02-28',
        wordCount: '112',
        rawTextSha: '2fd0be897328e359679db375ac829982e49c4322ffa7f3dea872acf646ce7bee',
        excerpt: 'Each story went weirdly wrong. Each story left people scratching their heads: what were the Times editors thinking?',
        pullQuote: 'Huff Post readers, bloggers, journalists, talk show hosts, onlookers: help me out.',
        summary: 'Rosen asks readers to find the pattern among three New York Times candidate-vetting stories about Obama, Hillary Clinton, and John McCain. The short prompt says each story went weirdly wrong, left readers wondering what the editors were thinking, and reflected a vetting ritual with a touch of the bizarre.',
        sourceSha: 'e6ecbe33ab28b04cad69d43c2befca17253a61ad44c05a0a7ecd60c390d45067',
      }],
      ['RECORD-00853', {
        title: 'When Dumb Articles Happen to Smart Newspapers',
        url: 'https://www.huffpost.com/entry/when-dumb-articles-happen_b_89809',
        publicationDate: '2008-03-04',
        wordCount: '1912',
        rawTextSha: '03f54e83eb5a54551ff2b7a26a738a1478ec8a327aa77cfc2da115f0a1dc1e7f',
        excerpt: 'Thursday I posted a little exercise in pattern recognition at the New York Times. Today I am back with the answers I received, plus some commentary on the Washington Post\'s "women are dumb" article, which fits the pattern in some ways.',
        pullQuote: 'Thursday I posted a little exercise in pattern recognition at the New York Times.',
        summary: 'Rosen follows up on his candidate-vetting pattern exercise with reader responses and a critique of Washington Post and New York Times stories that revealed newsroom self-image problems. He argues that smart newspapers produce dumb articles when narrative rituals and institutional self-regard overwhelm evidence.',
        sourceSha: 'c657d296262eb839af1965ab8c7ced33a50523b40f290c7e9060d41b35b8a540',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-24/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot eleven records match their official sources', () => {
    const expected = new Map([
      ['RECORD-00854', {
        title: 'Walter Pincus of the Post: Our Neutered Newsrooms are a Poor Example to the Rest of the World',
        url: 'https://www.huffpost.com/entry/walter-pincus-of-the-post_b_92019',
        publicationDate: '2008-03-18',
        wordCount: '2957',
        rawTextSha: 'ef2ddee448169bdbc15a7b79665a8b32f3ba22ae9f2db87908324d5d2c3f2c61',
        excerpt: 'The only exit from this system is for people in the press to start recognizing: there _is_ a politics to what they do. They have to get that part right. And they have to be more transparent about it.',
        pullQuote: 'It is rare that a single article advances American press think.',
        summary: "Rosen argues that neutrality claims like Clark Hoyt's defense of the Times trap the media-bias debate, and that journalists must recognize the politics in their work and make it transparent, as Josh Marshall's TPM does by joining accountability reporting to an open display of political conviction.",
        sourceSha: '1dacc962fe486d4bf1ba6d0fb8427a4120100a4f6662fc9f03f7bf6b8d3cd42d',
      }],
      ['RECORD-00855', {
        title: 'Obama Tells the Best Political Team on Television: You Guys Have a Choice...',
        url: 'https://www.huffpost.com/entry/obama-tells-the-best-poli_b_92139',
        publicationDate: '2008-03-18',
        wordCount: '685',
        rawTextSha: 'c2ca3b27f4321ff8980ec768a320cc143d21825810afecb63e097ff094a73c34',
        excerpt: 'In fact it was a [speech](https://www.huffpost.com/entry/obama-race-speech-read-t_n_92077) aimed right at figures like Blitzer, at the [best political team](http://www.cnn.com/POLITICS/best.political.team/archive/) on television, and all the makers of our election year spectacle.',
        pullQuote: 'Moments after it concluded Wolf Blitzer was asked to tell us what he heard in it.',
        summary: "Rosen criticizes CNN and Wolf Blitzer for reducing Obama's race speech to campaign tactics instead of engaging its challenge to the campaign spectacle and the press's role in keeping race controversies alive.",
        sourceSha: '99eee19f175791a76156c90f92c23f1efe6685ee1816b8723a8634e82cdf5df8',
      }],
      ['RECORD-00856', {
        title: 'Where Did McCain Get What He\'s Got "in the Bank" with the Press?',
        url: 'https://www.huffpost.com/entry/where-did-mccain-get-what_b_93711',
        publicationDate: '2008-03-27',
        wordCount: '2112',
        rawTextSha: '2debe6510d79803d87d00a70e159323b532e1a9dcdfc6c4e8d0cb89d2f21d778',
        excerpt: "Chuck Todd's phrase, _he's got enough of that in the bank,_ got people wondering what kind of depositary institution this was.",
        pullQuote: "First came John McCain's strange assertion that Al Qaeda in Iraq was being trained and supported by the Iranians.",
        summary: "Rosen asks why Chuck Todd said John McCain had enough credibility 'in the bank' with the press after falsely linking Al Qaeda in Iraq to Iran, arguing that banked capital came from McCain's open, on-the-record ease with reporters on the Straight Talk Express rather than demonstrated foreign-policy mastery.",
        sourceSha: '61069523ad8e8d889f0c7165227a32150dc4812e27ab0885899523d42de7e7b7',
      }],
      ['RECORD-00857', {
        title: 'The Uncharted: From Off The Bus to Meet the Press',
        url: 'https://www.huffpost.com/entry/the-uncharted-from-off-th_b_96575',
        publicationDate: '2008-04-22',
        wordCount: '2470',
        rawTextSha: '22c51b32da698e47140d442dcd86d43114d7f764b32fe62ce559bf03d5f8f6af',
        excerpt: "They became public because [Mayhill Fowler](https://www.huffpost.com/mayhill-fowler) reported them for OffTheBus Friday afternoon. Russert used Mayhill's quotes again on [another story](https://www.huffpost.com/entry/obama-says-no-to-foreign_b_95357) she broke earlier in the week.",
        pullQuote: 'One of these was OffTheBus itself, the site I started with Arianna Huffington last year.',
        summary: "Rosen argues that Meet the Press erased Mayhill Fowler and OffTheBus from the Obama 'bitter' controversy, showing how old media struggled to credit pro-am campaign reporting even when it drove the story.",
        sourceSha: 'b910fdc1de0d3682ba28281a7ba056949a2e08a59f5ada2c338a8ac72c5de842',
      }],
      ['RECORD-00858', {
        title: 'They Were Undercover Campaign Volunteers',
        url: 'https://www.huffpost.com/entry/they-were-undercover-camp_b_97529',
        publicationDate: '2008-04-26',
        wordCount: '186',
        rawTextSha: 'a41a108da674f02a7e6a6264a5087db9275e4933053ce1cb747700eb5196c4cb',
        excerpt: "They're both writers for City Paper who chose to go undercover to find out how the volunteer operations for both candidates actually worked.",
        pullQuote: "But we're not the only ones trying to do that.",
        summary: 'Rosen points readers to two Philadelphia City Paper writers who went undercover as Clinton and Obama volunteers, framing their reports as revealing evidence about campaign organizing despite ethical questions.',
        sourceSha: 'fc27d7dc586be1c17fc929217f5c15bb7d58d4fb108f45dec56552bc5752f7c0',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Official HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot twelve records match their source evidence', () => {
    const expected = new Map([
      ['RECORD-00859', {
        title: 'Scott McClellan And The Opacity Agenda',
        url: 'https://www.huffpost.com/entry/scott-mcclellan-and-the-o_b_104857',
        publicationDate: '2008-06-11',
        wordCount: '2525',
        rawTextSha: 'c012883e030a441f5bc519055e6553f32dfa5ccbd9411fb684f0a2dbc9409d2b',
        excerpt: 'McClellan as White House spokesman lacked experience, talent, charm, agility, depth. But Bush and Cheney saw these defects as an advantage. They actually wanted the executive branch to become more opaque, and he was the perfect man for the job.',
        pullQuote: 'These words have a strange poignancy today.',
        summary: "Rosen uses Scott McClellan's memoir to argue that Bush and Cheney preferred an opaque executive branch and that McClellan's limits as press secretary served that secrecy agenda.",
        sourceSha: 'cdf43c9170b945d23b37518cbf746f242530271cbd2b7117faa89fc3a22f864d',
      }],
      ['RECORD-00860', {
        title: 'When Bill Clinton Met Mayhill Fowler on the Rope Line',
        url: 'https://www.huffpost.com/entry/when-bill-clinton-met-may_b_106974',
        publicationDate: '2008-06-21',
        wordCount: '3888',
        rawTextSha: '7e8f39348d07529ed28fd9019a529ce8852b4a9591da09f7869760b2940bcd8b',
        excerpt: "Newsroom people, you don't have to leave the moral universe you grew up in. Just admit the possibility of another valid one beyond yours.",
        pullQuote: 'Last week OffTheBus brought you another case with Mayhill Fowler in the middle of it.',
        summary: "Rosen defends Mayhill Fowler's OffTheBus reporting on Bill Clinton's rope-line comments, arguing that campaign journalism can include a valid citizen-reporter ethic outside traditional newsroom rules.",
        sourceSha: 'e541bfca40e39caabee788a7775fedf23e731f0007836fd84d415714ce44eb06',
      }],
      ['RECORD-00861', {
        title: 'Karl Frisch of Media Matters in Austin Chronicle\'s story on Netroots: "We\'re ideological, not partisan." http://is.gd/WCk  #NN08',
        url: 'https://www.huffpost.com/entry/karl-frisch-of-media-matt_b_113470',
        publicationDate: '2008-07-17',
        wordCount: '137',
        rawTextSha: 'e5c37b47d7f36cbd0fe5a8b44c7405c99379cc0cc16e69edc32920151c866fda',
        excerpt: 'Karl Frisch of Media Matters in Austin Chronicle\'s story on Netroots: "We\'re ideological, not partisan." [http://is.gd/WCk](http://web.archive.org/web/20131109231444/http://is.gd/WCk) \\#NN08',
        pullQuote: '',
        summary: 'A short #NN08 post points to an Austin Chronicle Netroots Nation item quoting Media Matters\' Karl Frisch: "We\'re ideological, not partisan."',
        sourceSha: '0041b650c6c2d9689c1337ffe71f62db091c55950fa2bfdacd5bcdd63ca41afe',
      }],
      ['RECORD-00862', {
        title: '#NN08 Nancy Pelosi was moved up half an hour this morning so the speculation is that Al Gore is a surprise guest later today.',
        url: 'https://www.huffpost.com/entry/nn08-nancy-pelosi-was-mov_b_113745',
        publicationDate: '2008-07-19',
        wordCount: '82',
        rawTextSha: '9946a7dc23ae8c527bb54b6a1a86c3fd00c6c3b746a369da6943cba908417153',
        excerpt: '# \\#NN08 Nancy Pelosi was moved up half an hour this morning so the speculation is that Al Gore is a surprise guest later today.',
        pullQuote: '',
        summary: "A short #NN08 dispatch notes that Nancy Pelosi's Netroots Nation appearance was moved earlier, fueling speculation that Al Gore would appear as a surprise guest later that day.",
        sourceSha: '94c9e65f3e58330739ad36373c6cafcd88af3c7845615ca5478975c3e0830537',
      }],
      ['RECORD-00863', {
        title: '#NN08 Sketchbook: I tell Joe Trippi that his "Nixon won on radio" (in 1960 debate) reference is basically an urban legend.  Blank.',
        url: 'https://www.huffpost.com/entry/nn08-sketchbook-i-tell-jo_b_113757',
        publicationDate: '2008-07-19',
        wordCount: '142',
        rawTextSha: '81d637bcf5728a3fcf8d4e1edfda5ccfa6c8a5ffe43a3687792bac94432c7bf9',
        excerpt: '# \\#NN08 Sketchbook: I tell Joe Trippi that his "Nixon won on radio" (in 1960 debate) reference is basically an urban legend. Blank.',
        pullQuote: '',
        summary: 'A short #NN08 sketchbook post says Rosen told Joe Trippi that the "Nixon won on radio" claim about the 1960 debate is an urban legend.',
        sourceSha: '2ecba87badcf6807880b33ac689eba97e49bb267cbf8f26f8827a27c6dfd0b7d',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot thirteen records match available Wayback evidence', () => {
    const expected = new Map([
      ['RECORD-00864', {
        title: '#NN08 Sketchbook. Trippi\'s poem: "I came up top down."',
        url: 'https://www.huffpost.com/entry/nn08-sketchbook-trippis-p_b_113760',
        publicationDate: '2008-07-19',
        wordCount: '71',
        rawTextSha: '5b15812a9d7e4014be9cc23396819e00188fe8692df092314ecd7035db665353',
        excerpt: '# \\#NN08 Sketchbook. Trippi\'s poem: "I came up top down."',
        pullQuote: '',
        summary: 'A short #NN08 sketchbook post quotes Joe Trippi\'s poem: "I came up top down."',
        sourceSha: '4bbb6c7857b7c1877cf14ef3b2207883ff7acd381a70f7c503248138b6f3d1d4',
      }],
      ['RECORD-00866', {
        title: '#NN08 Sketchbook: Politicians think "Netroots Nation" equals "youth," because kids get the Net. But glance at the crowd and: Fail.',
        url: 'https://www.huffpost.com/entry/nn08-sketchbook-politicia_b_113765',
        publicationDate: '2008-07-19',
        wordCount: '140',
        rawTextSha: 'e07da9599f4e1f4ae586ed9bb6fb5c939aa435c087763988cd33338244561175',
        excerpt: '# \\#NN08 Sketchbook: Politicians think "Netroots Nation" equals "youth," because kids get the Net. But glance at the crowd and: Fail.',
        pullQuote: '',
        summary: 'A short #NN08 sketchbook post says politicians wrongly equate Netroots Nation with youth because the crowd shows the movement is not just young people.',
        sourceSha: '0199cd5b7624d4595240146b9393425074553d587998dcb812d48a40bdb98266',
      }],
      ['RECORD-00867', {
        title: '#NN08 Sketchbook. Matt Yglesias: In policy debate you can\'t say, "I know, let\'s spend a $170 billion a year on it." But in Iraq...',
        url: 'https://www.huffpost.com/entry/nn08-sketchbook-matt-ygle_b_113772',
        publicationDate: '2008-07-19',
        wordCount: '86',
        rawTextSha: 'e2736a5a5586be748a1d526d3fdf6e44d7cee06ccdfc52ad8fd76494e1b265e8',
        excerpt: '# \\#NN08 Sketchbook. Matt Yglesias: In policy debate you can\'t say, "I know, let\'s spend a $170 billion a year on it." But in Iraq...',
        pullQuote: 'Matt Yglesias: In policy debate you can\'t say, "I know, let\'s spend a $170 billion a year on it." But in Iraq...',
        summary: 'A short #NN08 sketchbook post quotes Matt Yglesias contrasting normal policy spending constraints with the scale of Iraq war spending.',
        sourceSha: '63b72c598a5a66c39c79418c36c8b1d0d6d375f4437847becc99042a7addd6f0',
      }],
      ['RECORD-00868', {
        title: '#NN08 Sketchbook. Gina Cooper, boss of Netroots Nation, isn\'t smooth in questioning Pelosi, but behind her the power of millions.',
        url: 'https://www.huffpost.com/entry/nn08-sketchbook-gina-coop_b_113780',
        publicationDate: '2008-07-19',
        wordCount: '26',
        rawTextSha: '950029bd6d26935db2210780e9ee4b210fbb55519a8a86403555e210032c1093',
        excerpt: '# \\#NN08 Sketchbook. Gina Cooper, boss of Netroots Nation, isn\'t smooth in questioning Pelosi, but behind her the power of millions.',
        pullQuote: '',
        summary: "A short #NN08 sketchbook post notes Gina Cooper's unsmooth questioning of Nancy Pelosi while emphasizing the grassroots power behind her.",
        sourceSha: '11d7cfd6b97630102b1e96697abd182a3cc4385ad19418bd40a54d0971acc84e',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed unexpectedly`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Wayback archived HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }

    assert.strictEqual(
      archiveRecords.some(row => row.id === 'RECORD-00865'),
      false,
      'RECORD-00865 should stay removed after curator review'
    );
  });

  it('HuffPost pilot fourteen records match source evidence', () => {
    const expected = new Map([
      ['RECORD-00869', {
        title: '#NN08 Righties came to Austin to draft off Netroots media attention, but stories comparing the two note how small their event is.',
        url: 'https://www.huffpost.com/entry/nn08-righties-came-to-aus_b_113813',
        publicationDate: '2008-07-19',
        wordCount: '84',
        rawTextSha: '9880cf8c15a7f57f68f5377896d518cd62e81d57b2712700b2e997c00264dc97',
        excerpt: '# \\#NN08 Righties came to Austin to draft off Netroots media attention, but stories comparing the two note how small their event is.',
        pullQuote: '',
        summary: 'A short #NN08 post says right-wing bloggers came to Austin to draft off Netroots Nation media attention, while comparison stories noted how small their event was.',
        sourceSha: '2b51ef5dcf9349d3d2070c431b4525b1110d0356f3af8e33e2a9fa18d90e6345',
        sourcePattern: /Wayback archived HuffPost source verified 2026-07-23/,
      }],
      ['RECORD-00870', {
        title: '#nn08 You know, if Markos was a control freak there would be no Netroots Nation. His "distributed ego" style should be studied.',
        url: 'https://www.huffpost.com/entry/nn08-you-know-if-markos-w_b_113854',
        publicationDate: '2008-07-19',
        wordCount: '84',
        rawTextSha: '22f7cd6437c35a05bba3058a37e07f3eae4d8edab5ca9c7d8e5fad026efb6948',
        excerpt: '# \\#nn08 You know, if Markos was a control freak there would be no Netroots Nation. His "distributed ego" style should be studied.',
        pullQuote: 'His "distributed ego" style should be studied.',
        summary: 'A short #nn08 post says Markos Moulitsas\'s distributed ego leadership style helped make Netroots Nation possible and should be studied.',
        sourceSha: '4fa21e3f81b9b2ac8df16fd77927177ac1d78669dfa035ee2731d19239eeb3f4',
        sourcePattern: /Wayback archived HuffPost source verified 2026-07-23/,
      }],
      ['RECORD-00871', {
        title: '#NN08 Sketchbook: Code Pinkers at the Pelosi event didn\'t get that their tactics were for people who never expect to take power.',
        url: 'https://www.huffpost.com/entry/nn08-sketchbook-code-pink_b_113872',
        publicationDate: '2008-07-19',
        wordCount: '730',
        rawTextSha: 'f5fd902bd42a8527399fc4eac961d9522b5106466cb277d95d2f3427cfc6882a',
        excerpt: '# \\#NN08 Sketchbook: Code Pinkers at the Pelosi event didn\'t get that their tactics were for people who never expect to take power.',
        pullQuote: '',
        summary: 'A short #NN08 sketchbook post argues that Code Pink protesters at the Pelosi event during Netroots Nation used tactics suited to people who never expect to hold power.',
        sourceSha: '367e2163721d861b0b10ed052c4a1879c0b1a5eeb67816e937d5ef6e65519e26',
        sourcePattern: /Wayback archived HuffPost source verified 2026-07-23/,
      }],
      ['RECORD-00872', {
        title: 'Three Questions For ABC News About Its Anthrax Reporting',
        url: 'https://www.huffpost.com/entry/three-key-questions-for-a_b_116671',
        publicationDate: '2008-08-11',
        wordCount: '1520',
        rawTextSha: 'e30e2d5d64b020eea5c8a747fbd2b6f92715d90d5780f945a17f8665af77d788',
        excerpt: 'ABC News was probably duped on a story of huge importance, putting Iraqi fingerprints on anthrax attacks that actually came from the U.S at a time when the case for war was beginning to get traction.',
        pullQuote: 'Dan Gillmor and I are posting these questions simultaneously.',
        summary: 'Rosen and Dan Gillmor press ABC News to answer questions about its anthrax reporting, including whether sources misled the network into linking the attacks to Iraq.',
        sourceSha: 'b1ed6da2177915cca79483da7d577db37476269bfa71d427e4da328e5e815721',
        sourcePattern: /Modern HuffPost source verified 2026-07-23/,
      }],
      ['RECORD-00873', {
        title: 'Hype Busters at Mother Jones Bring the Noise',
        url: 'https://www.huffpost.com/entry/hype-busters-at-mother-jo_b_120078',
        publicationDate: '2008-09-20',
        wordCount: '1513',
        rawTextSha: '8587258f83ca4b66503d95b69e030b9c111bf52b3e093798f365bd748f6c58d3',
        excerpt: 'Mother Jones is currently running a feature offering us the views of 24 writers, thinkers and historians on a question the editors find important: "Is Obama exaggerating when he compares his campaign to the great progressive moments in US history?"',
        pullQuote: 'Is the concept really so hard for the editors of Mother Jones to grasp?',
        summary: 'Rosen critiques Mother Jones\'s Obama hype-busting package, arguing that attempts to puncture campaign hype can become another form of hype when the framing is careless.',
        sourceSha: 'daae6c220c00a9c5bbf057cc7335f7d302a099f4ed44a5d53ddcabe398c30670',
        sourcePattern: /Modern HuffPost source verified 2026-07-23/,
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed unexpectedly`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.low_confidence, 'FALSE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, source.sourcePattern);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }
  });

  it('HuffPost pilot fifteen records match modern HuffPost evidence', () => {
    const expected = new Map([
      ['RECORD-00874', {
        title: 'The Culture War Option For The Palin Convention',
        url: 'https://www.huffpost.com/entry/the-culture-war-option-fo_b_123483',
        publicationDate: '2008-10-04',
        wordCount: '983',
        rawTextSha: '7b6c5927576245bbdd6041252f87b037f552923fda2d66378bbef979fda6d1a7',
        excerpt: 'McCain\'s convention gambit is now a culture war strategy. It depends for its execution on conflict with journalists and bloggers and on confusion between and among the press, the blogosphere, and the Democratic party.',
        pullQuote: 'It revives cultural memory: the resentment narrative after Chicago \'68 but with the angry left more distributed.',
        summary: 'Rosen argues that John McCain\'s Palin convention strategy turned toward culture-war politics by creating conflict with journalists and bloggers, blurring press-blogosphere-party boundaries, and betting on backlash.',
        sourceSha: '690176d06c7d38c1a8da1e0c93d58a028f78391ac535937bbda43f7a828415bc',
      }],
      ['RECORD-00875', {
        title: 'Audience Atomization Overcome: Why the Net Erodes the Authority of the Press',
        url: 'https://www.huffpost.com/entry/audience-atomization-over_b_157807',
        publicationDate: '2009-04-14',
        wordCount: '1925',
        rawTextSha: '87c75ed5851f83a2288d54a566de2180d051a3e4aa93c7a2881d957313b81216',
        excerpt: 'Sometimes the people the press thinks of as deviant types are closer to the sphere of consensus than the journalists who are classifying those same people as "fringe."',
        pullQuote: 'Take a sheet of paper and make a big circle in the middle.',
        summary: 'Rosen uses the spheres of consensus, legitimate debate, and deviance to argue that the internet weakens press authority by letting publics challenge which voices journalists classify as fringe.',
        sourceSha: 'd786adfffb8250640d6e0a9e396cdd825abe53253049690eb1de404ce64366a2',
      }],
      ['RECORD-00876', {
        title: '"He Said, She Said" Journalism: Are We Done With That Yet?',
        url: 'https://www.huffpost.com/entry/he-said-she-said-journali_b_187682',
        publicationDate: '2009-04-16',
        wordCount: '3024',
        rawTextSha: 'ab23bf9fe433fb3d7e45f700e07b800b07fef963bc48946c2b661d5fc9e5b815',
        excerpt: '"He said, she said" is not so much a truth-telling strategy as refuge-seeking behavior that fits well into newsroom production demands.',
        pullQuote: 'There I am, sitting at the breakfast table, with my coffee and a copy of the New York Times, in the classic newspaper reading position from before the Web.',
        summary: 'Rosen criticizes he said, she said journalism as a newsroom refuge that avoids judging competing truth claims, using AIG bailout coverage to argue that reporters should move beyond stenographic dispute framing.',
        sourceSha: 'aa074de890fbdedabf7995c7914a96419e01eacb8292f1b5a18cd39e731525ad',
      }],
      ['RECORD-00877', {
        title: 'The Politics of the New Huffington Post at AOL',
        url: 'https://www.huffpost.com/entry/the-politics-of-the-new-h_b_821112',
        publicationDate: '2011-02-10',
        wordCount: '1306',
        rawTextSha: 'd0a7ccd044bcf915f136af7fe05a4d2db511657458dc8763013a7ff0708b0a75',
        excerpt: 'Is ideological innovation possible in online journalism, and will we see it from this merger? No one ever thinks to ask that. Without understanding why, we just assume the answer is no.',
        pullQuote: '( Howard Kurtz: "Can a fast-moving, irreverent, and sometimes racy product keep its DNA once transplanted into a very different corporate culture?")\n\n2\\.',
        summary: 'Rosen argues that coverage of AOL\'s purchase of HuffPost asked practical merger questions while ignoring whether the deal could produce ideological innovation in online journalism.',
        sourceSha: 'defa25d8de9e9068f681fd117f583c4f39c1d0c321af667dd84e0b24bda076da',
      }],
      ['RECORD-00878', {
        title: 'The Many Ways Journalists Are Complicit in Political Polarization',
        url: 'https://www.huffpost.com/entry/leave-it-there-press_b_8739698',
        publicationDate: '2015-12-07',
        wordCount: '794',
        rawTextSha: '8a431c9057372b9776779a734a530e4e9a3ced3bd0bfde4b4736c4ff1f2f7272',
        excerpt: 'I am not saying journalists are the ones we should blame for American\'s dysfunctional politics. But I do consider them active participants in the events that got us here.',
        pullQuote: 'Roy Blunt (R-MO) and moderator Chuck Todd appear on \'Meet the Press\' in Washington, D.C., Sunday, Oct.',
        summary: 'Rosen argues that journalists are not the sole cause of political polarization but are active participants in it, especially when they distance themselves from conflicts their own conventions help sustain.',
        sourceSha: '58f738c6147be329cebf9b8134f1f94ba294438e23b4600f8237452c94f69da4',
      }],
    ]);

    for (const [id, source] of expected) {
      const record = archiveRecords.find(row => row.id === id);
      assert.ok(record, `${id} must exist`);
      assert.strictEqual(record.title, source.title);
      assert.strictEqual(record.url, source.url);
      assert.strictEqual(record.author, 'Jay Rosen');
      assert.strictEqual(record.publication_date, source.publicationDate);
      assert.strictEqual(record.word_count, source.wordCount);
      assert.strictEqual(
        crypto.createHash('sha256').update(record.raw_text).digest('hex'),
        source.rawTextSha,
        `${id} raw_text changed unexpectedly`
      );
      assert.strictEqual(record.excerpt, source.excerpt);
      assert.strictEqual(record.pull_quote, source.pullQuote);
      assert.strictEqual(record.summary, source.summary);
      assert.strictEqual(record.verified, 'TRUE');
      assert.strictEqual(record.low_confidence, 'FALSE');
      assert.strictEqual(record.needs_review, 'FALSE');
      assert.match(record.notes, /Modern HuffPost source verified 2026-07-23/);
      assert.match(record.notes, new RegExp(source.sourceSha));
    }

    const alternateTitle = archiveRecords.find(row => row.id === 'RECORD-00878');
    assert.match(alternateTitle.notes, /title tag reads "Tone Poem for the 'Leave It There' Press"/);
  });

  it('TomDispatch Sinclair source remains covered after removing the composite', () => {
    const record = archiveRecords.find(row => row.id === 'RECORD-00013');

    assert.ok(record, 'RECORD-00013 must exist');
    assert.strictEqual(record.title, "PressThink: Off the Charts: Sinclair Broadcast Group's Political Vision");
    assert.strictEqual(record.publication_date, '2004-11-16');
    assert.match(record.raw_text, /This originally appeared Oct\. 28, 2004 at TomDispatch\.com/);
    assert.doesNotMatch(record.raw_text, /Tribune Media|Boris Epshteyn|Ajit Pai/i);
  });

  it('RECORD-00097 uses the PressThink source publication date', () => {
    const record = archiveRecords.find(item => item.id === 'RECORD-00097');

    assert.ok(record, 'RECORD-00097 must exist');
    assert.strictEqual(record.publication_date, '2015-11-29');
  });

  it('thread containers preserve their member post text', () => {
    const socialById = new Map(socialPosts.map(post => [post.id, post]));
    const threads = archiveRecords.filter(record => record.id.startsWith('THREAD-'));

    assert.strictEqual(threads.length, 10, 'Expected the ten curated thread containers');

    for (const thread of threads) {
      const match = thread.notes.match(/(?:^|\|\s*)thread_data:\s*(\{.*\})\s*$/s);
      assert.ok(match, `${thread.id} lacks parseable thread_data`);
      const threadData = JSON.parse(match[1]);
      const sourceTexts = [];
      let sourceWordCount = 0;

      for (const member of threadData.posts) {
        const source = socialById.get(member.id);
        assert.ok(source, `${thread.id} references missing source post ${member.id}`);
        assert.ok(source.raw_text.trim(), `${thread.id} source post ${member.id} has no text`);
        assert.strictEqual(
          member.content,
          source.raw_text,
          `${thread.id} embeds stale content for ${member.id}`
        );
        sourceTexts.push(source.raw_text);
        sourceWordCount += Number(source.word_count);
      }

      assert.strictEqual(thread.raw_text, sourceTexts.join('\n\n'));
      assert.strictEqual(thread.excerpt, sourceTexts[0]);
      assert.strictEqual(Number(thread.word_count), sourceWordCount);
    }
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

  it('does not address non-Rosen Bluesky posts as Jay Rosen posts', () => {
    const misaddressed = socialPosts
      .filter(row => row.platform === 'Bluesky')
      .filter(row => row.author?.trim().toLowerCase() !== 'jay rosen')
      .filter(row => row.url?.startsWith('https://bsky.app/profile/jayrosen.bsky.social/post/'))
      .map(row => row.id);
    assert.deepStrictEqual(
      misaddressed,
      [],
      `${misaddressed.length} non-Rosen Bluesky posts use Jay Rosen's profile URL: ${misaddressed.slice(0, 10).join(', ')}`
    );
  });

  it('does not assign Jay Rosen copyright to non-Rosen Bluesky posts', () => {
    const misattributed = socialPosts
      .filter(row => row.platform === 'Bluesky')
      .filter(row => row.author?.trim().toLowerCase() !== 'jay rosen')
      .filter(row => row.copyright?.trim().toLowerCase() === 'jay rosen')
      .map(row => row.id);
    assert.deepStrictEqual(
      misattributed,
      [],
      `${misattributed.length} non-Rosen Bluesky posts assign copyright to Jay Rosen: ${misattributed.slice(0, 10).join(', ')}`
    );
  });

  it('records primary-source verification for Bluesky pilot 01', () => {
    const did = 'did:plc:3t37x6vfigdzzp2gjcfnzlz4';
    const responseHash = '3729ee61e0400fb44af226279271fea674e2fb2946fd85ec5ca4ef997adbe77d';
    const expected = new Map([
      ['BSKY-00001', ['bafyreiavhbuedfkjvmo3msi3f2kqwbc4x4i2cjbkxsl626pa6zdkrrp6ti', '2025-10-30 13:37:31']],
      ['BSKY-00002', ['bafyreidllciqxuqa7zrsfdm3pffwit6vr4tthl6wdq5jerdu62zmozwkhq', '2025-10-29 21:12:17']],
      ['BSKY-00003', ['bafyreihxl7ntydagdm6zd4ro6cx4fqcyhyoxjswkodx3iaksqzsuqpcj7q', '2025-10-29 20:46:27']],
      ['BSKY-00004', ['bafyreiadw2uj5lnbameewfx2nzo5mfbwatyumho3rnjptbutf7efqpf5a4', '2025-10-29 19:35:28']],
      ['BSKY-00005', ['bafyreifo7o3wnchr2rtyhvdvs4qsxixwx27ywimbxsdgmow4wqsjumhjkm', '2025-10-29 18:38:03']],
      ['BSKY-00006', ['bafyreiaxtrg66a6gas7idhfz46pwlgntkdn4wqoytvjklwhapb34psdjdm', '2025-10-25 20:14:55']],
      ['BSKY-00007', ['bafyreiaad4pk3z4gehmtw5cwluqildpvovfi2r5bsukiatx4cjhij67jxm', '2025-10-25 17:46:52']],
      ['BSKY-00008', ['bafyreibzawinsj2cbqf4xab5jow7vco2dtgzufgg3hxv54h27ax2o7ly2y', '2025-10-25 17:42:55']],
      ['BSKY-00009', ['bafyreieygqnil6qskkuuniw7elfy3xuabinhi3zfegvt2eoo73fojt3hau', '2025-10-25 17:19:47']],
      ['BSKY-00010', ['bafyreigyarexsqn4zcrdhoqvbenjnfc7zld7ut3ni7oz4rekgcndvzv7gq', '2025-10-25 16:45:44']],
      ['BSKY-00011', ['bafyreihfhmp6l6ulfjkbgt5stkz5wocl5srkr53hsia5h2fokcleqnzk3u', '2025-10-25 15:04:57']],
      ['BSKY-00012', ['bafyreiavlvkjge4rpfavebcblf3yzqsrkrkjhhuguotttc4f45ytk3gtnu', '2025-10-25 01:41:34']],
      ['BSKY-00013', ['bafyreignrfpzofnbmj3p5clupszvbpadwvb5rosxh5v46uoskmwjp4xiwq', '2025-10-24 19:25:18']],
      ['BSKY-00014', ['bafyreigiunaktct36py6twhv6dif4yxvrz2sy7hgul6hqq3ktmg4gqhdai', '2025-10-24 18:15:49']],
      ['BSKY-00015', ['bafyreih4j7yugchc2hrmmzo7sbsvoor5g26yiyxtt2ts6v5crmloptaxsq', '2025-10-24 18:08:06']],
      ['BSKY-00016', ['bafyreicnko5kk4gwtjndxf6aia5x55p3hnhwpp2pidoactqpozmhzxyszu', '2025-10-24 17:58:02']],
      ['BSKY-00017', ['bafyreiailpic4g2i4u7bfbhhql435qploxrpfpclbpouz5hn3ockqwuwim', '2025-10-24 17:55:17']],
      ['BSKY-00018', ['bafyreighcqhjhrhor3cwm3jhs4bv35zsmq6xrhipdo32ugmjc37psf7axm', '2025-10-24 17:28:51']],
      ['BSKY-00019', ['bafyreiaww37w7pt2gpblq6q7uplzp7nwq5o7kkantdeqpx2p2qgdxysudm', '2025-10-23 00:27:02']],
      ['BSKY-00020', ['bafyreighsvpyvohkx76n4twjkb65up5y4ti26gnww27y3m7jbhhrdd27zi', '2025-10-22 18:44:41']],
      ['BSKY-00021', ['bafyreigzl7a6gcnf774ibdhkkfjyuzoiz7cwea6dgvvukkzdt6msbhoqbi', '2025-10-22 18:28:55']],
      ['BSKY-00022', ['bafyreicgkfywh6tbg53r22kdp2oafqmai22pr2z5djibkwatjlqxp2ls5i', '2025-10-22 17:53:14']],
      ['BSKY-00023', ['bafyreicfdzlue6iaq2i33gnkoyq4ftxs4rwgeqsreexpcmh3wnvlf5chpq', '2025-10-22 15:28:56']],
      ['BSKY-00024', ['bafyreibqqj6tgqv45nnz47wslktbrhmkbrbulqknrtgynpu3koi5jomxea', '2025-10-20 14:54:41']],
      ['BSKY-00025', ['bafyreifos4tfgcuovoher3bappz6llosnfkiefr7rcp6t7pu7lxphansm4', '2025-10-20 14:53:55']],
    ]);

    for (const [id, [cid, publicationDate]] of expected) {
      const post = socialPosts.find(row => row.id === id);
      assert.ok(post, `${id} is missing`);
      const rkey = post.url.match(/\/post\/([a-z0-9]+)$/)?.[1];
      assert.ok(rkey, `${id} has no Bluesky record key`);
      assert.strictEqual(post.publication_date, publicationDate);
      assert.strictEqual(post.verified, 'TRUE');
      assert.match(post.notes, new RegExp(`URI at://${did}/app\\.bsky\\.feed\\.post/${rkey}`));
      assert.match(post.notes, new RegExp(`cid=${cid}`));
      assert.match(post.notes, new RegExp(`response SHA-256 ${responseHash}`));
    }
  });

  it('records primary-source verification for Bluesky pilot 02', () => {
    const did = 'did:plc:3t37x6vfigdzzp2gjcfnzlz4';
    const responseHash = '2f9b4864e8f65839c18d985a2feb14706ee92203f1e6696109759455f3a81666';
    const expected = new Map([
      ['BSKY-00026', ['bafyreifmb3nmi6dq4vfd225qn7ddsn4wfs6xa6bn4iq4rydtuzyme7zsca', '2025-10-18 18:43:21', '42']],
      ['BSKY-00027', ['bafyreicmtv4mh5jmazdmo2yjgftg3gtz3vrb2vy5igzbhlxuwblnpvvqp4', '2025-10-18 16:10:52', '2']],
      ['BSKY-00028', ['bafyreicevpyfolnabzzq7hqleigxrdvagvewh6razc7i7oig7y24dayxfa', '2025-10-18 15:52:07', '4']],
      ['BSKY-00029', ['bafyreibgnyw6vi4p455grdjpknd4ttwanqvzvc5rvodu7rxv7anndp46ma', '2025-10-16 15:23:17', '18']],
      ['BSKY-00030', ['bafyreib55nq5mzreekwvs53yu2ypt62fcbntizilechce3xjktz4w76yyi', '2025-10-17 23:25:46', '43']],
      ['BSKY-00031', ['bafyreihvs7l3w4k6arib5kz3igfctozfdbq4d7fc2c3cfuj4oicylw5eue', '2025-10-17 22:55:11', '17']],
      ['BSKY-00032', ['bafyreie5x7r5ckf4fkhta5tw6aynp5f6qkdqsb46bdasnqo5fqmmf73f5q', '2025-10-17 15:36:51', '15']],
      ['BSKY-00033', ['bafyreib26pcwo54xtn2mg3d6t6kylyjjxxj4rqhzljp2z75c5mywthokx4', '2025-10-17 15:12:30', '15']],
      ['BSKY-00035', ['bafyreidwslchm2ichkcw6qh463zq4cehqzzh3bqfef3v3cj4gnj7bks4wm', '2025-10-16 03:05:05', '2']],
      ['BSKY-00036', ['bafyreifpjztxlweezerxh73iylhoinz523sr4aikuypomqyfwt5y4m4use', '2025-10-16 01:34:19', '1']],
      ['BSKY-00037', ['bafyreie2xzwfafdhomag3z7tg77ynmjvjefrn2x7qubsa3ig3223yjxydm', '2025-10-16 01:26:44', '23']],
      ['BSKY-00038', ['bafyreiapndu2snne365gqv73nhk4o5kmo2dqbezbhvoh2imdpukuugs7vy', '2025-10-16 00:53:28', '51']],
      ['BSKY-00039', ['bafyreie5nnza7uect7ogf7dll5pt76lf3engjbwvx36iq7xps2pn3rbp7y', '2025-10-15 17:06:32', '4']],
      ['BSKY-00040', ['bafyreigun22vzqu7j6wedoi6sppwjxbudr6hxgogp3tqarnwhdqc6e4hfy', '2025-10-15 17:05:01', '17']],
      ['BSKY-00041', ['bafyreifn5z2j5pgsqbyrtpcwud5xbdkjcpibamgounyh6kmbctdutn7qqa', '2025-10-15 16:58:44', '2']],
      ['BSKY-00042', ['bafyreielys2abureb75hrla6jraexfg7vj75l2cskedwwalxsn54oznf5m', '2025-10-15 16:34:35', '47']],
      ['BSKY-00043', ['bafyreihpm3dyqggberp74zzzzgq4clxct2hnpol2j72fft5irylxr6umaq', '2025-10-15 15:41:50', '46']],
      ['BSKY-00044', ['bafyreig33q7hmb4yb33dwg2rotm5uiz6jpk63gaw5awd5zqnmkkhlopdlq', '2025-10-15 02:09:20', '51']],
      ['BSKY-00045', ['bafyreias4jv7rv5tbjnl25d2bhpafzadj5xmyhxvxv6jdmiwvlgnmu46xu', '2025-10-15 00:00:56', '6']],
      ['BSKY-00046', ['bafyreia5uxfqjwevh7ceuoixcoqom3neqq2nqozvljtutoqdxkaw6tdc6u', '2025-10-14 23:45:29', '22']],
      ['BSKY-00047', ['bafyreibfdbvcp7qivjwdyz3ynqfcigjfpwv6j56577danedyy522pcipwe', '2025-10-14 22:16:24', '23']],
      ['BSKY-00048', ['bafyreih3lhlvwbmo67dvy7f2mx5e6olb5btt4vcbzhfcdnwdlbj3bdmtli', '2025-10-14 19:17:02', '5']],
      ['BSKY-00049', ['bafyreigb2dhsq2kul2gvb6qlarhfkdcjy7f3clwslwok4eemsgxw2jwtyu', '2025-10-14 14:59:23', '37']],
      ['BSKY-00050', ['bafyreiczfdiqtkfdcnp3a62j6odsu4ylkiwvsxsn3cuglzdfydhg4iouye', '2025-10-14 14:10:08', '34']],
      ['BSKY-00051', ['bafyreidfsk7vas2wuqgig5ecqoh4te7344xucgdvus4yw5sm4h6wkq4nvy', '2025-10-14 14:05:54', '14']],
    ]);

    for (const [id, [cid, publicationDate, wordCount]] of expected) {
      const post = socialPosts.find(row => row.id === id);
      assert.ok(post, `${id} is missing`);
      const rkey = post.url.match(/\/post\/([a-z0-9]+)$/)?.[1];
      assert.ok(rkey, `${id} has no Bluesky record key`);
      assert.strictEqual(post.author, 'Jay Rosen');
      assert.strictEqual(post.publication_date, publicationDate);
      assert.strictEqual(post.word_count, wordCount);
      assert.strictEqual(post.verified, 'TRUE');
      assert.match(post.notes, new RegExp(`URI at://${did}/app\\.bsky\\.feed\\.post/${rkey}`));
      assert.match(post.notes, new RegExp(`cid=${cid}`));
      assert.match(post.notes, new RegExp(`response SHA-256 ${responseHash}`));
    }
  });

  it('recovers native source URLs for non-Rosen Bluesky source queue rows', () => {
    const expectedIds = [
      'BSKY-00060', 'BSKY-00241', 'BSKY-00333', 'BSKY-00383', 'BSKY-00586',
      'BSKY-00650', 'BSKY-00684', 'BSKY-00740', 'BSKY-00765', 'BSKY-00878',
      'BSKY-01170', 'BSKY-01278', 'BSKY-01693', 'BSKY-01695', 'BSKY-01820',
      'BSKY-02329',
    ];

    for (const id of expectedIds) {
      const post = socialPosts.find(row => row.id === id);
      assert.ok(post, `${id} is missing`);
      assert.notStrictEqual(post.author, 'Jay Rosen', `${id} should remain attributed to its original author`);
      assert.strictEqual(post.verified, 'TRUE');
      assert.match(post.url, /^https:\/\/bsky\.app\/profile\/[^/]+\/post\/[a-z0-9]+$/);
      assert.match(post.notes, /ATProto source recovery 2026-07-23/);
      assert.match(post.notes, /\bURI at:\/\/did:plc:[a-z0-9]+\/app\.bsky\.feed\.post\/[a-z0-9]+\b/);
      assert.match(post.notes, /\bcid=[a-z0-9]+\b/);
    }
  });

  it('Python validator parses social_posts.csv with embedded newlines intact', () => {
    const output = execFileSync('python', ['backend/scripts/validate_archive_data.py'], {
      cwd: repoDir,
      encoding: 'utf-8',
    });
    assert.match(output, /Social Posts:\s+29747\b/);
    assert.doesNotMatch(output, /Bluesky, social media platforms/);
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

  it('Twitter publication dates match their source tweet IDs', () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const formatEastern = date => {
      const parts = Object.fromEntries(
        formatter.formatToParts(date).map(part => [part.type, part.value])
      );
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    };
    const mismatches = [];

    for (const row of socialPosts.filter(post => post.platform === 'Twitter/X')) {
      const match = row.url.match(/\/(?:status)\/(\d+)(?:[/?#]|$)/);
      if (!match) {
        mismatches.push(`${row.id}:invalid URL`);
        continue;
      }
      const milliseconds = (BigInt(match[1]) >> 22n) + 1288834974657n;
      const sourceDate = formatEastern(new Date(Number(milliseconds)));
      const storedMatch = row.publication_date.match(/^(\d{4}-\d{2}-\d{2}) (\d{1,2}):(\d{2}):(\d{2})$/);
      const normalizedStoredDate = storedMatch
        ? `${storedMatch[1]} ${storedMatch[2].padStart(2, '0')}:${storedMatch[3]}:${storedMatch[4]}`
        : row.publication_date;
      if (normalizedStoredDate !== sourceDate) {
        mismatches.push(`${row.id}:${row.publication_date}->${sourceDate}`);
      }
    }

    assert.deepStrictEqual(
      mismatches,
      [],
      `${mismatches.length} Twitter dates disagree with their source tweet IDs: ${mismatches.slice(0, 10).join(', ')}`
    );
  });

  it('all social posts have explicit verified status', () => {
    const unresolved = socialPosts
      .filter(post => !['TRUE', 'FALSE'].includes(post.verified))
      .map(post => post.id);
    assert.strictEqual(
      unresolved.length,
      0,
      `${unresolved.length} social posts are missing an explicit TRUE/FALSE verification outcome: ${unresolved.slice(0, 10).join(', ')}`
    );
  });

  it('verified social posts keep source evidence', () => {
    const missingEvidence = socialPosts
      .filter(post => post.verified === 'TRUE')
      .filter(post => !(post.url || '').trim())
      .filter(post => !/\bsource\b|\bimport\b|\bat:\/\/|\bcid=/i.test(post.notes || ''))
      .map(post => post.id);
    assert.strictEqual(
      missingEvidence.length,
      0,
      `${missingEvidence.length} verified social posts lack platform URL or documented import evidence: ${missingEvidence.slice(0, 10).join(', ')}`
    );
  });

  it('unverified social posts document why source evidence is unresolved', () => {
    const undocumented = socialPosts
      .filter(post => post.verified === 'FALSE')
      .filter(post => !/unresolved|source.+absent|removed false|unrecover|not verified/i.test(post.notes || ''))
      .map(post => post.id);
    assert.strictEqual(
      undocumented.length,
      0,
      `${undocumented.length} unverified social posts lack unresolved-source notes: ${undocumented.slice(0, 10).join(', ')}`
    );
  });

  it('export uses explicit source verified status, not type or ID shortcuts', () => {
    const exporterSource = fs.readFileSync(path.join(dataDir, 'export-archive-data.js'), 'utf-8');
    const verifiedBlock = exporterSource.match(/const isVerified =[\s\S]*?;/);
    assert.ok(verifiedBlock, 'could not find export verified expression');
    assert.ok(
      !/type\s*===\s*['"]social['"]/.test(verifiedBlock[0]),
      'social rows must use explicit source verified status, not a type-wide shortcut'
    );
    assert.ok(
      !/rawId\s*\.\s*startsWith/.test(verifiedBlock[0]),
      'records must use explicit source verified status, not an ID-prefix shortcut'
    );
  });

  it('all social posts retain source content or document a non-text exception', () => {
    const missing = socialPosts
      .filter(post => !post.raw_text?.trim())
      .filter(post => !(
        /Source has no text; image-only post verified/i.test(post.notes || '') &&
        /\bcid=[a-z0-9]+\b/i.test(post.notes || '')
      ))
      .map(post => post.id);
    assert.strictEqual(
      missing.length,
      0,
      `${missing.length} social posts have neither raw_text nor a documented non-text exception: ${missing.slice(0, 10).join(', ')}`
    );
  });

  it('BSKY-00262 records its image-only primary source', () => {
    const post = socialPosts.find(row => row.id === 'BSKY-00262');
    assert.ok(post, 'BSKY-00262 is missing');
    assert.strictEqual(post.title, 'Breaking News Consumer\'s Handbook');
    assert.strictEqual(
      post.excerpt,
      'Image-only post sharing On the Media\'s “Breaking News Consumer\'s Handbook,” a nine-point checklist for evaluating breaking-news reports.'
    );
    assert.strictEqual(post.summary, post.excerpt);
    assert.strictEqual(
      post.thematic_categories,
      'Audience & Public Engagement, Journalism Education, Press & Media Criticism'
    );
    assert.strictEqual(
      post.key_concepts,
      'Breaking news, source verification, media literacy'
    );
    assert.strictEqual(post.tags, 'On the Media');
    assert.match(post.notes, /Source has no text; image-only post verified/i);
    assert.match(post.notes, /cid=bafyreia6asi4zucdngkobbm3hhmqtb3ybvm6fdkt2ubwrelac5bi64dmfu/);
    assert.match(post.notes, /image blob=bafkreifjacsfhpmrikevnfmxebuxyafo5jjkzm6ysuokkhr5wjso56mgvq/);
    assert.match(post.notes, /alt text is blank/i);
    assert.strictEqual(post.verified, 'TRUE');
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

  it('all entities identify their first mention record', () => {
    const missing = entities
      .filter(entity => !entity.first_mention_record_id?.trim())
      .map(entity => entity.entity_id);
    assert.strictEqual(
      missing.length,
      0,
      `${missing.length} entities have no first_mention_record_id: ${missing.slice(0, 10).join(', ')}`
    );
  });

  it('relationship-backed entities have a non-quarantined first mention', () => {
    const quarantinedRecords = new Set(['RECORD-00614']);
    const archiveRecordIds = new Set(archiveRecords.map(record => record.id));
    const relationshipBackedIds = new Set();

    for (const relationship of relationships) {
      if (!archiveRecordIds.has(relationship.source_record_id)) continue;
      if (quarantinedRecords.has(relationship.source_record_id)) continue;
      relationshipBackedIds.add(relationship.source_entity_id);
      relationshipBackedIds.add(relationship.target_entity_id);
    }

    const missing = entities
      .filter(entity => relationshipBackedIds.has(entity.entity_id))
      .filter(entity => !entity.first_mention_record_id?.trim())
      .map(entity => entity.entity_id);

    assert.strictEqual(
      missing.length,
      0,
      `${missing.length} relationship-backed entities lack a first mention: ${missing.join(', ')}`
    );
  });

  it('maps source-backed orphan entities to their first archive evidence', () => {
    const expected = new Map([
      ['C0076', 'RECORD-00577'],
      ['C0243', 'RECORD-00143'],
      ['C0262', 'RECORD-00129'],
      ['C0308', 'RECORD-00117'],
      ['C0323', 'RECORD-00132'],
      ['C0324', 'RECORD-00126'],
      ['C0350', 'RECORD-00145'],
      ['C0362', 'RECORD-00122'],
      ['C0363', 'RECORD-00122'],
      ['C0364', 'RECORD-00122'],
      ['C0399', 'RECORD-00119'],
      ['C0429', 'RECORD-00136'],
      ['C0430', 'RECORD-00111'],
      ['C0438', 'RECORD-00131'],
      ['C0475', 'RECORD-00128'],
      ['C0476', 'RECORD-00128'],
      ['C0477', 'RECORD-00128'],
      ['C0540', 'RECORD-00162'],
      ['C0583', 'RECORD-00667'],
      ['C0597', 'RECORD-00158'],
      ['E0005', 'RECORD-00002'],
      ['E0079', 'RECORD-00130'],
      ['E0157', 'RECORD-00114'],
      ['E0180', 'RECORD-00135'],
      ['E0181', 'RECORD-00113'],
      ['L0067', 'RECORD-00156'],
      ['L0075', 'RECORD-00165'],
      ['L0136', 'RECORD-00110'],
      ['L0158', 'RECORD-00128'],
      ['L0160', 'RECORD-00124'],
      ['L0161', 'RECORD-00124'],
      ['L0162', 'RECORD-00124'],
      ['L0199', 'RECORD-00238'],
      ['O0036', 'RECORD-00853'],
      ['O0037', 'RECORD-00853'],
      ['O0625', 'RECORD-00116'],
      ['O0644', 'RECORD-00132'],
      ['O0718', 'RECORD-00122'],
      ['O0719', 'RECORD-00122'],
      ['O0733', 'RECORD-00150'],
      ['O0951', 'RECORD-00124'],
      ['O0973', 'RECORD-00152'],
      ['O0974', 'RECORD-00166'],
      ['O1109', 'RECORD-00085'],
      ['O1110', 'RECORD-00280'],
      ['O1111', 'RECORD-00544'],
      ['O1188', 'RECORD-00216'],
      ['P0050', 'RECORD-00002'],
      ['P0061', 'RECORD-00853'],
      ['P0064', 'RECORD-00286'],
      ['P0065', 'RECORD-00853'],
      ['P0071', 'RECORD-00853'],
      ['P1016', 'RECORD-00101'],
      ['P1054', 'RECORD-00568'],
      ['P1178', 'RECORD-00513'],
      ['P1256', 'RECORD-00211'],
      ['P1401', 'RECORD-00531'],
      ['P1402', 'RECORD-00264'],
      ['P1403', 'RECORD-00242'],
      ['P1657', 'RECORD-00166'],
      ['P2093', 'RECORD-00202'],
      ['P2126', 'RECORD-00772'],
      ['P2127', 'RECORD-00772'],
      ['P2128', 'RECORD-00772'],
      ['P2180', 'RECORD-00483'],
      ['W0009', 'RECORD-00002'],
      ['W0010', 'RECORD-00014'],
      ['W0011', 'RECORD-00014'],
      ['W0012', 'RECORD-00014'],
      ['W0085', 'RECORD-00056'],
      ['W0399', 'RECORD-00160'],
      ['W0519', 'RECORD-00135'],
      ['W0520', 'RECORD-00135'],
      ['W0593', 'RECORD-00100'],
      ['W0610', 'RECORD-00109'],
      ['W0637', 'RECORD-00513'],
    ]);
    const entitiesById = new Map(entities.map(entity => [entity.entity_id, entity]));
    const recordsById = new Map(archiveRecords.map(record => [record.id, record]));
    const normalizeNewlines = value => value.replace(/\r\n/g, '\n');

    for (const [entityId, recordId] of expected) {
      const entity = entitiesById.get(entityId);
      const record = recordsById.get(recordId);
      assert.ok(entity, `${entityId} must exist`);
      assert.ok(record, `${recordId} must exist`);
      assert.strictEqual(entity.first_mention_record_id, recordId);

      const sourceRelationships = relationships.filter(relationship =>
        relationship.source_record_id === recordId &&
        (relationship.source_entity_id === entityId || relationship.target_entity_id === entityId)
      );
      assert.ok(sourceRelationships.length > 0, `${entityId} lacks a relationship in ${recordId}`);
      const storedSourceText = normalizeNewlines([
        record.raw_text,
        record.excerpt,
        record.summary,
        record.pull_quote,
      ].filter(Boolean).join('\n\n'));
      const hasStoredExactExcerpt = sourceRelationships.some(relationship =>
        storedSourceText.includes(normalizeNewlines(relationship.context_snippet))
      );
      const isRightsWithheldEvidence =
        !record.raw_text &&
        /not to be duplicated or redistributed without.+written permission/i.test(record.permissions) &&
        /raw_text(?:\.txt)? SHA-256 [a-f0-9]{64}/i.test(record.notes) &&
        sourceRelationships.every(relationship =>
          relationship.context_snippet.trim().split(/\s+/).length <= 80
        );
      assert.ok(
        hasStoredExactExcerpt || isRightsWithheldEvidence,
        `${entityId} lacks stored source evidence or a bounded, hashed rights-withheld excerpt in ${recordId}`
      );
    }
  });

  it('maps reviewed orphan entities to their earliest source-text evidence', () => {
    const expected = new Map([
      ['C0160', { recordId: 'RECORD-00237', phrase: 'freedom of speech' }],
      ['C0261', { recordId: 'RECORD-00165', phrase: 'world citizenship' }],
      ['C0316', { recordId: 'RECORD-00146', phrase: 'gatekeeper model' }],
      ['C0545', { recordId: 'RECORD-00879', phrase: 'one-to-many' }],
      ['C0562', { recordId: 'RECORD-00127', phrase: 'news/opinion distinction' }],
      ['C0604', { recordId: 'RECORD-00503', phrase: 'Easongate' }],
      ['C0650', { recordId: 'RECORD-00183', phrase: 'norm of objectivity' }],
      ['E0106', { recordId: 'RECORD-00125', phrase: 'war in Iraq' }],
      ['E0119', { recordId: 'RECORD-00110', phrase: 'Jason Blair crisis' }],
      ['L0131', { recordId: 'CLIP-00076', phrase: 'Cambridge, Mass' }],
      ['O0313', { recordId: 'RECORD-00208', phrase: 'Fort Worth Star-Telegram' }],
      ['O1118', { recordId: 'RECORD-00140', phrase: 'Monacle' }],
      ['O1189', { recordId: 'RECORD-00410', phrase: 'MediaChannel' }],
      ['O1207', { recordId: 'RECORD-00882', phrase: 'Center for Collaborative Journalism' }],
      ['P1015', { recordId: 'RECORD-00101', phrase: 'Matthew Yglesisas' }],
      ['P1213', { recordId: 'RECORD-00115', phrase: 'Salaam Pax' }],
      ['P2012', { recordId: 'RECORD-00138', phrase: 'Rupert Murdoch' }],
      ['P2094', { recordId: 'RECORD-00170', phrase: 'Rony Albovitz' }],
    ]);
    const entitiesById = new Map(entities.map(entity => [entity.entity_id, entity]));
    const recordsById = new Map(archiveRecords.map(record => [record.id, record]));

    for (const [entityId, { recordId, phrase }] of expected) {
      const entity = entitiesById.get(entityId);
      const record = recordsById.get(recordId);
      assert.ok(entity, `${entityId} must exist`);
      assert.ok(record, `${recordId} must exist`);
      assert.strictEqual(entity.first_mention_record_id, recordId);
      assert.ok(
        record.raw_text.toLowerCase().includes(phrase.toLowerCase()),
        `${recordId} must contain ${phrase}`
      );

      const matchingRecords = archiveRecords
        .filter(candidate => candidate.raw_text.toLowerCase().includes(phrase.toLowerCase()))
        .sort((left, right) =>
          left.publication_date.localeCompare(right.publication_date) ||
          left.id.localeCompare(right.id)
        );
      assert.strictEqual(
        matchingRecords[0]?.id,
        recordId,
        `${entityId} should point to the earliest archive record containing ${phrase}`
      );
    }
  });

  it('maps the second reviewed orphan-entity batch to source-text evidence', () => {
    const expected = new Map([
      ['E0121', { recordId: 'RECORD-00118', phrase: 'California recall' }],
      ['E0197', { recordId: 'RECORD-00445', phrase: 'Harvard conference on blogging, journalism and credibility' }],
      ['E0221', { recordId: 'RECORD-00502', phrase: 'case of Trent Lott' }],
      ['E0222', { recordId: 'RECORD-00242', phrase: 'Rathergate' }],
      ['P0626', { recordId: 'RECORD-00509', phrase: 'Doc Searles' }],
      ['P1050', { recordId: 'RECORD-00137', phrase: 'Dan Gillmor' }],
      ['P1929', { recordId: 'RECORD-00544', phrase: 'Karen Schneider' }],
      ['P2092', { recordId: 'RECORD-00410', phrase: 'Danny Schecter' }],
      ['P2178', { recordId: 'RECORD-00673', phrase: 'Jules Boykoff' }],
      ['W0571', { recordId: 'RECORD-00123', phrase: 'article about the Sacramento Bee' }],
      ['W0573', { recordId: 'RECORD-00487', phrase: 'PowerLine' }],
    ]);
    const entitiesById = new Map(entities.map(entity => [entity.entity_id, entity]));
    const recordsById = new Map(archiveRecords.map(record => [record.id, record]));

    for (const [entityId, { recordId, phrase }] of expected) {
      const entity = entitiesById.get(entityId);
      const record = recordsById.get(recordId);
      assert.ok(entity, `${entityId} must exist`);
      assert.ok(record, `${recordId} must exist`);
      assert.strictEqual(entity.first_mention_record_id, recordId);
      assert.ok(
        record.raw_text.toLowerCase().includes(phrase.toLowerCase()),
        `${recordId} must contain ${phrase}`
      );
    }

    const finalMapped = new Map([
      ['P1928', { recordId: 'TWTR-09476', phrase: 'Bill Buzenberg' }],
      ['W0160', { recordId: 'RECORD-00130', phrase: 'protecting serious journalism' }],
    ]);
    const sourceRecordsById = new Map(
      [...archiveRecords, ...socialPosts].map(record => [record.id, record])
    );

    for (const [entityId, { recordId, phrase }] of finalMapped) {
      const entity = entitiesById.get(entityId);
      const record = sourceRecordsById.get(recordId);
      assert.ok(entity, `${entityId} must exist`);
      assert.ok(record, `${recordId} must exist`);
      assert.strictEqual(entity.first_mention_record_id, recordId);
      assert.ok(
        [
          record.title,
          record.excerpt,
          record.summary,
          record.raw_text,
          record.tags,
          record.key_concepts,
          record.pull_quote,
        ].join('\n').toLowerCase().includes(phrase.toLowerCase()),
        `${recordId} must contain ${phrase}`
      );
    }

    const deletedOrphans = [
      'C0443',
      'C0552',
      'C0581',
      'C0582',
      'C0649',
      'C0652',
      'L0159',
      'O0722',
      'P1214',
      'P2011',
      'P2176',
      'P2177',
      'W0258',
      'W0260',
      'W0261',
      'W0638',
      'W0663',
      'W0664',
    ];

    for (const entityId of deletedOrphans) {
      assert.ok(!entitiesById.has(entityId), `${entityId} should be removed as a no-evidence orphan`);
    }
  });

});

// ============================================
// extracted_relationships.csv
// ============================================

describe('extracted_relationships.csv', () => {
  it('has data', () => {
    assert.ok(relationships.length > 0, 'No relationships found');
  });

  it('does not retain graph data extracted from quarantined RECORD-00614 content', () => {
    const quarantined = relationships
      .filter(relationship => relationship.source_record_id === 'RECORD-00614')
      .map(relationship => relationship.relationship_id);
    const quarantineBackedEntities = entities
      .filter(entity => entity.first_mention_record_id === 'RECORD-00614')
      .map(entity => entity.entity_id);

    assert.deepStrictEqual(
      quarantined,
      [],
      `RECORD-00614 retains ${quarantined.length} relationships from mismatched source content`
    );
    assert.deepStrictEqual(
      quarantineBackedEntities,
      [],
      `RECORD-00614 remains the provenance source for entities: ${quarantineBackedEntities.join(', ')}`
    );
  });

  it('preserves source-backed Free Press provenance from canonical RECORD-00150', () => {
    const freePress = entities.find(entity => entity.entity_id === 'O0734');
    const sourceRelationship = relationships.find(relationship =>
      relationship.source_record_id === 'RECORD-00150' &&
      (relationship.source_entity_id === 'O0734' || relationship.target_entity_id === 'O0734')
    );

    assert.ok(freePress, 'O0734 must retain its canonical Free Press evidence');
    assert.strictEqual(freePress.first_mention_record_id, 'RECORD-00150');
    assert.ok(sourceRelationship, 'O0734 must remain reachable from RECORD-00150');
    assert.match(sourceRelationship.context_snippet, /from Free Press/);
  });

  it('has source and target columns', () => {
    const columns = Object.keys(relationships[0]);
    const hasSource = columns.some(c => c.toLowerCase().includes('source'));
    const hasTarget = columns.some(c => c.toLowerCase().includes('target'));
    assert.ok(hasSource, `No source column found. Available: ${columns.join(', ')}`);
    assert.ok(hasTarget, `No target column found. Available: ${columns.join(', ')}`);
  });

  it('references only existing records and entity IDs', () => {
    const entityIds = new Set(entities.map(e => e.entity_id));
    const recordIds = new Set(
      [...archiveRecords, ...socialPosts].map(record => record.id)
    );
    const badRefs = [];
    for (const rel of relationships) {
      if (!recordIds.has(rel.source_record_id)) {
        badRefs.push(`${rel.relationship_id}:record:${rel.source_record_id}`);
      }
      if (!entityIds.has(rel.source_entity_id)) {
        badRefs.push(`${rel.relationship_id}:source:${rel.source_entity_id}`);
      }
      if (!entityIds.has(rel.target_entity_id)) {
        badRefs.push(`${rel.relationship_id}:target:${rel.target_entity_id}`);
      }
    }
    assert.strictEqual(
      badRefs.length,
      0,
      `${badRefs.length} relationship references do not resolve: ${badRefs.slice(0, 10).join(', ')}`
    );
  });

  it('has no self-referential entity relationships', () => {
    const archiveRecordIds = new Set(archiveRecords.map(record => record.id));
    const selfReferences = relationships
      .filter(relationship => archiveRecordIds.has(relationship.source_record_id))
      .filter(relationship => relationship.source_entity_id === relationship.target_entity_id)
      .map(relationship => relationship.relationship_id);
    assert.strictEqual(
      selfReferences.length,
      0,
      `${selfReferences.length} relationships point an entity to itself: ${selfReferences.join(', ')}`
    );
  });

  it('has no duplicate semantic relationship keys', () => {
    const seen = new Map();
    const duplicates = [];

    for (const relationship of relationships) {
      const key = [
        relationship.source_record_id,
        relationship.source_entity_id,
        relationship.relationship_type,
        relationship.target_entity_id,
      ].join('|');
      if (seen.has(key)) {
        duplicates.push(`${seen.get(key)}+${relationship.relationship_id}`);
      } else {
        seen.set(key, relationship.relationship_id);
      }
    }

    assert.strictEqual(
      duplicates.length,
      0,
      `${duplicates.length} semantic relationship keys are duplicated: ${duplicates.join(', ')}`
    );
  });

  it('uses canonical entity names for relationship endpoints', () => {
    const entityNames = new Map(
      entities.map(entity => [entity.entity_id, entity.entity_name.trim()])
    );
    const archiveRecordIds = new Set(archiveRecords.map(record => record.id));
    const mismatches = [];

    for (const relationship of relationships) {
      if (!archiveRecordIds.has(relationship.source_record_id)) continue;
      for (const endpoint of ['source', 'target']) {
        const id = relationship[`${endpoint}_entity_id`];
        const storedName = relationship[`${endpoint}_entity_name`]?.trim();
        const canonicalName = entityNames.get(id);
        if (canonicalName && storedName !== canonicalName) {
          mismatches.push(
            `${relationship.relationship_id}:${endpoint}:${storedName}->${canonicalName}`
          );
        }
      }
    }

    assert.strictEqual(
      mismatches.length,
      0,
      `${mismatches.length} relationship endpoint names differ from their canonical entities: ` +
      mismatches.slice(0, 10).join(', ')
    );
  });
});
