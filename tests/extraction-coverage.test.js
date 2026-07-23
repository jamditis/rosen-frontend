/**
 * Extraction coverage invariant (issue #207).
 *
 * Locks in: every non-quarantined RECORD-* whose raw_text is long enough to be
 * a real article (>= 500 chars, matching
 * backend/scripts/recover_articles_playwright.py:44 MIN_OK_LEN so test and
 * recovery pipeline share one notion of "real article") must appear at least
 * once as source_record_id in extracted_relationships.csv.
 *
 * Goes RED when entity extraction has been skipped for records that already have
 * scrapable content. Goes GREEN as those records are re-extracted. If a record
 * genuinely has no extractable entities, allowlist it explicitly (don't lower
 * the threshold) — the allowlist will be added when the first such case appears.
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

const RAW_TEXT_MIN = 500;

// Records whose raw_text is >= 500 chars but contains scraped junk rather than
// the article body — the scraper captured a nav/listing page, or the URL has
// link-rotted to a squatted domain. Claude correctly returns zero entities for
// these. Add a record here only after confirming it has no recoverable article
// text; the standing fix is Wayback recovery (#294), not an allowlist entry.
//
// RECORD-00740 (OTM segment) and RECORD-00783 (fora.tv talk) were both recovered
// from the Internet Archive, their raw_text replaced, and entity extraction
// re-run, so neither needs allowlisting anymore. RECORD-00614 is quarantined
// because its URL and scraped body identify different works; relationships
// derived from that mismatched body must not be published.
const ALLOWLIST = new Set(['RECORD-00614']);

function findCoverageOffenders(candidateRecords, candidateRelationships, allowlist = ALLOWLIST) {
  const haveRel = new Set(
    candidateRelationships.map(relationship => relationship.source_record_id).filter(Boolean)
  );

  return candidateRecords
    .filter(record => record.id.startsWith('RECORD-'))
    .filter(record => (record.raw_text || '').trim().length >= RAW_TEXT_MIN)
    .filter(record => !haveRel.has(record.id))
    .filter(record => !allowlist.has(record.id))
    .map(record => record.id);
}

let records, relationships, entities;

before(() => {
  records = parse(
    fs.readFileSync(path.join(dataDir, 'archive_records-public.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );
  relationships = parse(
    fs.readFileSync(path.join(dataDir, 'extracted_relationships.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );
  entities = parse(
    fs.readFileSync(path.join(dataDir, 'extracted_entities.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );
});

describe('extraction coverage (#207)', () => {
  it('keeps unverified records in coverage unless they are explicitly quarantined', () => {
    const fixture = [{
      id: 'RECORD-UNVERIFIED',
      raw_text: 'x'.repeat(RAW_TEXT_MIN),
      verified: 'FALSE'
    }];

    assert.deepStrictEqual(
      findCoverageOffenders(fixture, [], new Set()),
      ['RECORD-UNVERIFIED']
    );
  });

  it('every non-quarantined RECORD-* with raw_text >= 500 chars appears as source_record_id in extracted_relationships.csv', () => {
    const offenders = findCoverageOffenders(records, relationships);
    assert.strictEqual(
      offenders.length,
      0,
      `${offenders.length} non-quarantined RECORD-* have raw_text >= ${RAW_TEXT_MIN} chars but 0 extracted relationships. ` +
      `Sample: ${offenders.slice(0, 10).join(', ')}${offenders.length > 10 ? ', ...' : ''}`
    );
  });

  it('every archive record with raw_text >= 500 chars has extracted relationships', () => {
    const haveRel = new Set(
      relationships.map(r => r.source_record_id).filter(Boolean)
    );
    const offenders = records
      .filter(r => (r.raw_text || '').trim().length >= RAW_TEXT_MIN)
      .filter(r => !haveRel.has(r.id))
      .filter(r => !ALLOWLIST.has(r.id))
      .map(r => r.id);
    assert.strictEqual(
      offenders.length,
      0,
      `${offenders.length} archive records have raw_text >= ${RAW_TEXT_MIN} chars but 0 extracted relationships. ` +
      `Sample: ${offenders.slice(0, 10).join(', ')}${offenders.length > 10 ? ', ...' : ''}`
    );
  });

  it('maps Tumblr extraction batch one to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00001', [
        {
          relationshipId: 'TUMBLR-00001_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'O0115',
          contextSnippet: 'We showcased the explainers we created for ProPublica and other partners to a room full of journalists, editors and entrepreneurs.',
        },
        {
          relationshipId: 'TUMBLR-00001_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'O0158',
          contextSnippet: 'The wave of attention inspired\nThe Guardian\nto reach out to Studio 20 and commission their own music video explainer on the European sovereign debt crisis.',
        },
      ]],
      ['TUMBLR-00007', [
        {
          relationshipId: 'TUMBLR-00007_REL_001',
          sourceEntityId: 'W0059',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0002',
          contextSnippet: 'The site is a collaboration between\nThe New York Times\nand New York University’s Arthur L. Carter Journalism Institute, and will cover New York City’s East Village.',
        },
        {
          relationshipId: 'TUMBLR-00007_REL_002',
          sourceEntityId: 'W0059',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0148',
          contextSnippet: 'The site is a collaboration between\nThe New York Times\nand New York University’s Arthur L. Carter Journalism Institute, and will cover New York City’s East Village.',
        },
      ]],
      ['TUMBLR-00008', [
        {
          relationshipId: 'TUMBLR-00008_REL_001',
          sourceEntityId: 'E0370',
          relationshipType: 'Occurred At',
          targetEntityId: 'O1603',
          contextSnippet: 'Studio 20 Director Jay Rosen recently gave an\nInaugural Lecture\nto the incoming class at Sciences Po école du journalisme in Paris',
        },
        {
          relationshipId: 'TUMBLR-00008_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Discusses',
          targetEntityId: 'C1088',
          contextSnippet: 'Rosen elaborated on his talk in a post he published titled\nThe Journalists Formerly Known as the Media: My Advice to the Next Generation',
        },
      ]],
      ['TUMBLR-00010', [
        {
          relationshipId: 'TUMBLR-00010_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O1089',
          contextSnippet: 'Gawker\n; Burt Herman Co-Founder and CEO,\nStorify',
        },
        {
          relationshipId: 'TUMBLR-00010_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0024',
          contextSnippet: 'September 13: Jim Kennedy, VP/Director Strategic Planning,\nThe Associated Press',
        },
      ]],
      ['TUMBLR-00011', [
        {
          relationshipId: 'TUMBLR-00011_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0115',
          contextSnippet: 'Assia’s Studio III project is developing, producing and distributing content for “Radio ProPublica” a new audio platform for the investigative journalism newsrtoom.',
        },
        {
          relationshipId: 'TUMBLR-00011_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0270',
          contextSnippet: 'This fall, Ruth is working for\nJim Brady\n, Editor-in-Chief of Journal Register Company',
        },
      ]],
    ]);
    const recordsById = new Map(records.map(record => [record.id, record]));
    const relationshipsById = new Map(relationships.map(relationship => [relationship.relationship_id, relationship]));

    for (const [recordId, recordRelationships] of expected) {
      const record = recordsById.get(recordId);
      assert.ok(record, `${recordId} is missing`);

      for (const expectedRelationship of recordRelationships) {
        const relationship = relationshipsById.get(expectedRelationship.relationshipId);
        assert.ok(relationship, `${expectedRelationship.relationshipId} is missing`);
        assert.strictEqual(relationship.source_record_id, recordId);
        assert.strictEqual(relationship.source_entity_id, expectedRelationship.sourceEntityId);
        assert.strictEqual(relationship.relationship_type, expectedRelationship.relationshipType);
        assert.strictEqual(relationship.target_entity_id, expectedRelationship.targetEntityId);
        assert.strictEqual(relationship.context_snippet, expectedRelationship.contextSnippet);
        assert.ok(
          record.raw_text.includes(relationship.context_snippet),
          `${relationship.relationship_id} has a context excerpt outside ${recordId}`
        );
      }
    }
  });

  it('maps Tumblr extraction batch two to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00012', [
        {
          relationshipId: 'TUMBLR-00012_REL_001',
          sourceEntityId: 'O1474',
          relationshipType: 'Discusses',
          targetEntityId: 'O0179',
          contextSnippet: 'PBS’\nMediaShift\nprofiled NYU’s Studio 20 concentration as an example of journalism education adapting to the changing media industry.',
        },
        {
          relationshipId: 'TUMBLR-00012_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20 Director\nJay Rosen\nexplains his philosophy for student participation',
        },
      ]],
      ['TUMBLR-00015', [
        {
          relationshipId: 'TUMBLR-00015_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0310',
          contextSnippet: 'Clay Shirky\njoined the Studio 20 faculty.',
        },
      ]],
      ['TUMBLR-00016', [
        {
          relationshipId: 'TUMBLR-00016_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'O0115',
          contextSnippet: 'The Redistricting Song is Dave’s third music video explainer and the second he’s created in partnership with ProPublica.',
        },
        {
          relationshipId: 'TUMBLR-00016_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0308',
          contextSnippet: 'Dave recently told\nThe Nieman Lab\n.',
        },
      ]],
      ['TUMBLR-00018', [
        {
          relationshipId: 'TUMBLR-00018_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0760',
          contextSnippet: 'Spanish Civil War\nfor publication by\nOxford University Press\n.',
        },
        {
          relationshipId: 'TUMBLR-00018_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0023',
          contextSnippet: 'picked up by the Washington Post, New York Times  International,  Scientific American and the Guardian',
        },
      ]],
      ['TUMBLR-00019', [
        {
          relationshipId: 'TUMBLR-00019_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'O0115',
          contextSnippet: 'In Studio II\n, She introduced us to the skills and tactics we need to execute our long-term project with\nProPublica\n.',
        },
        {
          relationshipId: 'TUMBLR-00019_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0100',
          contextSnippet: 'Zoe taught us the value of iterative project management and\nagile development',
        },
      ]],
    ]);
    const recordsById = new Map(records.map(record => [record.id, record]));
    const relationshipsById = new Map(relationships.map(relationship => [relationship.relationship_id, relationship]));

    for (const [recordId, recordRelationships] of expected) {
      const record = recordsById.get(recordId);
      assert.ok(record, `${recordId} is missing`);

      for (const expectedRelationship of recordRelationships) {
        const relationship = relationshipsById.get(expectedRelationship.relationshipId);
        assert.ok(relationship, `${expectedRelationship.relationshipId} is missing`);
        assert.strictEqual(relationship.source_record_id, recordId);
        assert.strictEqual(relationship.source_entity_id, expectedRelationship.sourceEntityId);
        assert.strictEqual(relationship.relationship_type, expectedRelationship.relationshipType);
        assert.strictEqual(relationship.target_entity_id, expectedRelationship.targetEntityId);
        assert.strictEqual(relationship.context_snippet, expectedRelationship.contextSnippet);
        assert.ok(
          record.raw_text.includes(relationship.context_snippet),
          `${relationship.relationship_id} has a context excerpt outside ${recordId}`
        );
      }
    }
  });

  it('maps every imported Bluesky thread to existing entities with source excerpts', () => {
    const threadIds = Array.from(
      { length: 10 },
      (_, index) => `THREAD-${String(index + 1).padStart(5, '0')}`
    );
    const recordsById = new Map(records.map(record => [record.id, record]));
    const entityIds = new Set(entities.map(entity => entity.entity_id));
    const normalizeNewlines = value => value.replace(/\r\n/g, '\n');

    for (const threadId of threadIds) {
      const record = recordsById.get(threadId);
      assert.ok(record, `${threadId} is missing from the archive`);

      const threadRelationships = relationships.filter(
        relationship => relationship.source_record_id === threadId
      );
      assert.ok(
        threadRelationships.length > 0,
        `${threadId} has no extracted relationships`
      );

      for (const relationship of threadRelationships) {
        assert.ok(
          entityIds.has(relationship.source_entity_id),
          `${relationship.relationship_id} has an unknown source entity`
        );
        assert.ok(
          entityIds.has(relationship.target_entity_id),
          `${relationship.relationship_id} has an unknown target entity`
        );
        assert.ok(
          normalizeNewlines(record.raw_text).includes(
            normalizeNewlines(relationship.context_snippet)
          ),
          `${relationship.relationship_id} has a context excerpt outside ${threadId}`
        );
      }
    }
  });
});
