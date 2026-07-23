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

  it('maps Tumblr extraction batch three to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00022', [
        {
          relationshipId: 'TUMBLR-00022_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0148',
          contextSnippet: 'These final projects are the both the capstone project for students enrolled in the NYU Arthur L. Carter School of Journalism',
        },
        {
          relationshipId: 'TUMBLR-00022_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O1039',
          contextSnippet: 'partnered with Forbes to explore how to make online video a better return on investment.',
        },
        {
          relationshipId: 'TUMBLR-00022_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0034',
          contextSnippet: 'helped manage and produce social gaming content for the Huffington Post.',
        },
        {
          relationshipId: 'TUMBLR-00022_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0015',
          contextSnippet: 'drew inspiration from many innovative social feeds on Twitter as well as CNN’s In America documentary unit',
        },
      ]],
      ['TUMBLR-00023', [
        {
          relationshipId: 'TUMBLR-00023_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0178',
          contextSnippet: 'that they will collaborate in the development of a “citizens agenda” approach to election coverage during the 2012 campaign for president.',
        },
        {
          relationshipId: 'TUMBLR-00023_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Mentions',
          targetEntityId: 'P0184',
          contextSnippet: 'Jay Rosen and Amanda Michel, The Guardian’s Open Editor, explained it this way in a',
        },
        {
          relationshipId: 'TUMBLR-00023_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0042',
          contextSnippet: 'The alternative to “who’s going to win in the game of getting elected?” is, we think, a “citizens agenda” approach to campaign coverage.',
        },
      ]],
      ['TUMBLR-00025', [
        {
          relationshipId: 'TUMBLR-00025_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0214',
          contextSnippet: 'New York Daily News',
        },
      ]],
      ['TUMBLR-00027', [
        {
          relationshipId: 'TUMBLR-00027_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O1748',
          contextSnippet: 'Seed.com',
        },
        {
          relationshipId: 'TUMBLR-00027_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0002',
          contextSnippet: 'New York Times',
        },
      ]],
      ['TUMBLR-00028', [
        {
          relationshipId: 'TUMBLR-00028_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0115',
          contextSnippet: 'From ProPublica to the New York Times, you may see Studio 20 alums popping up all over the news world.',
        },
        {
          relationshipId: 'TUMBLR-00028_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0002',
          contextSnippet: 'From ProPublica to the New York Times, you may see Studio 20 alums popping up all over the news world.',
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

  it('maps Tumblr extraction batch four to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00029', [
        {
          relationshipId: 'TUMBLR-00029_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0034',
          contextSnippet: 'The Huffington Post’s many, many users will either love or hate',
        },
        {
          relationshipId: 'TUMBLR-00029_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0178',
          contextSnippet: 'I create user-driven features for The Guardian US',
        },
        {
          relationshipId: 'TUMBLR-00029_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0075',
          contextSnippet: 'managing our presence on different social networks such as Twitter',
        },
      ]],
      ['TUMBLR-00030', [
        {
          relationshipId: 'TUMBLR-00030_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0178',
          contextSnippet: 'Studio 20 is collaborating with the Guardian US on how to    improve election coverage',
        },
        {
          relationshipId: 'TUMBLR-00030_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0042',
          contextSnippet: '“The Citizens’ Agenda” as the project was    christened',
        },
        {
          relationshipId: 'TUMBLR-00030_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0005',
          contextSnippet: 'Our own Jay Rosen and the Guardian’s Amanda Michel summed up the idea',
        },
        {
          relationshipId: 'TUMBLR-00030_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0184',
          contextSnippet: 'Our own Jay Rosen and the Guardian’s Amanda Michel summed up the idea',
        },
        {
          relationshipId: 'TUMBLR-00030_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0277',
          contextSnippet: 'John King',
        },
        {
          relationshipId: 'TUMBLR-00030_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0186',
          contextSnippet: 'Grist',
        },
        {
          relationshipId: 'TUMBLR-00030_REL_007',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0043',
          contextSnippet: 'Wired',
        },
        {
          relationshipId: 'TUMBLR-00030_REL_008',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0446',
          contextSnippet: 'TechPresident',
        },
      ]],
      ['TUMBLR-00031', [
        {
          relationshipId: 'TUMBLR-00031_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0015',
          contextSnippet: 'CNN anchor/reporter Soledad O\'Brien',
        },
        {
          relationshipId: 'TUMBLR-00031_REL_002',
          sourceEntityId: 'P1225',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20’s own Professor Jason Samuels',
        },
        {
          relationshipId: 'TUMBLR-00031_REL_003',
          sourceEntityId: 'P0109',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0015',
          contextSnippet: 'CNN anchor/reporter Soledad O\'Brien',
        },
        {
          relationshipId: 'TUMBLR-00031_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0109',
          contextSnippet: 'CNN anchor/reporter Soledad O\'Brien',
        },
      ]],
      ['TUMBLR-00032', [
        {
          relationshipId: 'TUMBLR-00032_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'O0115',
          contextSnippet: 'joint explainer project with ProPublica',
        },
        {
          relationshipId: 'TUMBLR-00032_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P1387',
          contextSnippet: 'David Gregory asked a question about Super PACs',
        },
        {
          relationshipId: 'TUMBLR-00032_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0005',
          contextSnippet: 'Jay Rosen',
        },
      ]],
      ['TUMBLR-00033', [
        {
          relationshipId: 'TUMBLR-00033_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'W0910',
          contextSnippet: 'Building a Better Explainer project',
        },
        {
          relationshipId: 'TUMBLR-00033_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'O0115',
          contextSnippet: 'investigative journalism non-profit, ProPublica',
        },
        {
          relationshipId: 'TUMBLR-00033_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'W0909',
          contextSnippet: 'Explainer.net',
        },
        {
          relationshipId: 'TUMBLR-00033_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0033',
          contextSnippet: 'PressThink',
        },
        {
          relationshipId: 'TUMBLR-00033_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0308',
          contextSnippet: 'Nieman Journalism Lab’s Lois Beckett visited Studio 20',
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

  it('maps Tumblr extraction batch five to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00034', [
        {
          relationshipId: 'TUMBLR-00034_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0306',
          contextSnippet: 'Anjali Mullany',
        },
        {
          relationshipId: 'TUMBLR-00034_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0214',
          contextSnippet: 'New York Daily News’ push into social media',
        },
        {
          relationshipId: 'TUMBLR-00034_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P1225',
          contextSnippet: 'Studio 20 professor Jason Samuels',
        },
        {
          relationshipId: 'TUMBLR-00034_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0644',
          contextSnippet: 'New York Daily News’ push into social media',
        },
        {
          relationshipId: 'TUMBLR-00034_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'E0364',
          contextSnippet: 'Occupy Wall Street',
        },
      ]],
      ['TUMBLR-00035', [
        {
          relationshipId: 'TUMBLR-00035_REL_001',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'by Jay Rosen, Director of Studio 20',
        },
        {
          relationshipId: 'TUMBLR-00035_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0076',
          contextSnippet: 'Why didn’t the news industry invent Facebook?',
        },
        {
          relationshipId: 'TUMBLR-00035_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0018',
          contextSnippet: 'New York Observer’s website',
        },
      ]],
      ['TUMBLR-00036', [
        {
          relationshipId: 'TUMBLR-00036_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0310',
          contextSnippet: 'Clay Shirky',
        },
        {
          relationshipId: 'TUMBLR-00036_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0612',
          contextSnippet: 'Cognitive Surplus: Creativity and Generosity in a Connected Age',
        },
        {
          relationshipId: 'TUMBLR-00036_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0490',
          contextSnippet: 'Fortune\nnamed Shirky',
        },
        {
          relationshipId: 'TUMBLR-00036_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P2485',
          contextSnippet: 'Mark Zuckerberg, Steve Jobs, and Jeff Bezos',
        },
        {
          relationshipId: 'TUMBLR-00036_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P1894',
          contextSnippet: 'Mark Zuckerberg, Steve Jobs, and Jeff Bezos',
        },
        {
          relationshipId: 'TUMBLR-00036_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0072',
          contextSnippet: 'Mark Zuckerberg, Steve Jobs, and Jeff Bezos',
        },
      ]],
      ['TUMBLR-00037', [
        {
          relationshipId: 'TUMBLR-00037_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0015',
          contextSnippet: 'keen interest in journalism and improving it',
        },
        {
          relationshipId: 'TUMBLR-00037_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0543',
          contextSnippet: 'new media',
        },
      ]],
      ['TUMBLR-00038', [
        {
          relationshipId: 'TUMBLR-00038_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0192',
          contextSnippet: 'Google',
        },
        {
          relationshipId: 'TUMBLR-00038_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0049',
          contextSnippet: 'Jay Rosen\n, Professor of Journalism at\nNYU',
        },
        {
          relationshipId: 'TUMBLR-00038_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0033',
          contextSnippet: 'PressThink',
        },
        {
          relationshipId: 'TUMBLR-00038_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0543',
          contextSnippet: 'new media',
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

  it('maps Tumblr extraction batch six to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00052', [
        {
          relationshipId: 'TUMBLR-00052_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0656',
          contextSnippet: 'Lisa Williams',
        },
        {
          relationshipId: 'TUMBLR-00052_REL_002',
          sourceEntityId: 'P0656',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O1751',
          contextSnippet: 'founder and CEO of\nPlaceblogger.com',
        },
        {
          relationshipId: 'TUMBLR-00052_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0259',
          contextSnippet: 'MIT Media Lab’s Center for Future Civic Media',
        },
        {
          relationshipId: 'TUMBLR-00052_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0075',
          contextSnippet: 'Twitter',
        },
      ]],
      ['TUMBLR-00057', [
        {
          relationshipId: 'TUMBLR-00057_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0049',
          contextSnippet: 'NYU is offering what could be a model for next-gen J-school, its Studio 20 concentration',
        },
        {
          relationshipId: 'TUMBLR-00057_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'The classes are led by\nProf. Jay Rosen',
        },
        {
          relationshipId: 'TUMBLR-00057_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0015',
          contextSnippet: 'old employment path in the news business has been disrupted',
        },
      ]],
      ['TUMBLR-00058', [
        {
          relationshipId: 'TUMBLR-00058_REL_001',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20\nProfessor Jay Rosen',
        },
        {
          relationshipId: 'TUMBLR-00058_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0644',
          contextSnippet: 'social media age',
        },
        {
          relationshipId: 'TUMBLR-00058_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0290',
          contextSnippet: 'Dave Winer',
        },
        {
          relationshipId: 'TUMBLR-00058_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0310',
          contextSnippet: 'Clay Shirky',
        },
        {
          relationshipId: 'TUMBLR-00058_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0010',
          contextSnippet: 'Jeff Jarvis',
        },
        {
          relationshipId: 'TUMBLR-00058_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0128',
          contextSnippet: 'Dan Gillmor',
        },
        {
          relationshipId: 'TUMBLR-00058_REL_007',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0004',
          contextSnippet: 'View from Nowhere',
        },
      ]],
      ['TUMBLR-00059', [
        {
          relationshipId: 'TUMBLR-00059_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0474',
          contextSnippet: 'Australian Broadcasting Corporation’s web site',
        },
        {
          relationshipId: 'TUMBLR-00059_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20 Professor Jay Rosen’s keynote presentation',
        },
        {
          relationshipId: 'TUMBLR-00059_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0075',
          contextSnippet: 'blogging and Twitter',
        },
        {
          relationshipId: 'TUMBLR-00059_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0192',
          contextSnippet: 'Targeted ads like those served to Google users',
        },
        {
          relationshipId: 'TUMBLR-00059_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0218',
          contextSnippet: 'Apple',
        },
      ]],
      ['TUMBLR-00061', [
        {
          relationshipId: 'TUMBLR-00061_REL_001',
          sourceEntityId: 'P1225',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20\nProfessor Jason Samuels',
        },
        {
          relationshipId: 'TUMBLR-00061_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0015',
          contextSnippet: 'Journalism',
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

  it('maps Tumblr extraction batch seven to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00013', [
        {
          relationshipId: 'TUMBLR-00013_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0242',
          contextSnippet: 'MTV show Teen Mom',
        },
      ]],
      ['TUMBLR-00014', [
        {
          relationshipId: 'TUMBLR-00014_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0049',
          contextSnippet: 'STUDIO 20 concentration at NYU',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0148',
          contextSnippet: 'Studio 20 at the Arthur L. Carter Journalism Institute',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0180',
          contextSnippet: 'innovation and adapting journalism to the web',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O1191',
          contextSnippet: 'World Wide Web and its mobile extensions',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0002',
          contextSnippet: 'major partners was the New York Times',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0115',
          contextSnippet: 'collaboration\nwith ProPublica',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_007',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'W0909',
          contextSnippet: 'Explainer.net',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_008',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0310',
          contextSnippet: 'Clay Shirky',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_009',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0158',
          contextSnippet: 'collaboration with The Guardian',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_010',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0057',
          contextSnippet: 'The Wall Street Journal',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_011',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0005',
          contextSnippet: 'Jay Rosen',
        },
        {
          relationshipId: 'TUMBLR-00014_REL_012',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P1225',
          contextSnippet: 'Jason Samuels',
        },
      ]],
      ['TUMBLR-00021', [
        {
          relationshipId: 'TUMBLR-00021_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0049',
          contextSnippet: '#nyu',
        },
        {
          relationshipId: 'TUMBLR-00021_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0015',
          contextSnippet: '#journalism',
        },
      ]],
      ['TUMBLR-00024', [
        {
          relationshipId: 'TUMBLR-00024_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0218',
          contextSnippet: 'Apple Store',
        },
      ]],
      ['TUMBLR-00026', [
        {
          relationshipId: 'TUMBLR-00026_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0015',
          contextSnippet: '#journalism',
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

  it('maps Tumblr extraction batch eight to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00066', [
        {
          relationshipId: 'TUMBLR-00066_REL_001',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20\nProfessor Jay Rosen',
        },
        {
          relationshipId: 'TUMBLR-00066_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Discusses',
          targetEntityId: 'C0015',
          contextSnippet: 'what the next journalism system looks like',
        },
        {
          relationshipId: 'TUMBLR-00066_REL_003',
          sourceEntityId: 'P0005',
          relationshipType: 'Discusses',
          targetEntityId: 'C0427',
          contextSnippet: 'teach them to be innovators and entrepreneurs',
        },
      ]],
      ['TUMBLR-00067', [
        {
          relationshipId: 'TUMBLR-00067_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0049',
          contextSnippet: 'Studio 20 program\nat NYU',
        },
        {
          relationshipId: 'TUMBLR-00067_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0180',
          contextSnippet: 'innovation in web journalism',
        },
        {
          relationshipId: 'TUMBLR-00067_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0213',
          contextSnippet: 'subscribers to The Economist magazine',
        },
        {
          relationshipId: 'TUMBLR-00067_REL_004',
          sourceEntityId: 'P0005',
          relationshipType: 'Mentions',
          targetEntityId: 'O0075',
          contextSnippet: 'Prof. Jay Rosen on Twitter',
        },
      ]],
      ['TUMBLR-00068', [
        {
          relationshipId: 'TUMBLR-00068_REL_001',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20 Professor Jay Rosen',
        },
        {
          relationshipId: 'TUMBLR-00068_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0310',
          contextSnippet: 'Clay Shirky',
        },
        {
          relationshipId: 'TUMBLR-00068_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0543',
          contextSnippet: "new media's present and future",
        },
        {
          relationshipId: 'TUMBLR-00068_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0212',
          contextSnippet: "NYU Arthur L. Carter Journalism Institute's",
        },
        {
          relationshipId: 'TUMBLR-00068_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0305',
          contextSnippet: 'Matylda Czarnecka',
        },
        {
          relationshipId: 'TUMBLR-00068_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0306',
          contextSnippet: 'Anjali Mullany',
        },
        {
          relationshipId: 'TUMBLR-00068_REL_007',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0015',
          contextSnippet: '#Journalism',
        },
      ]],
      ['TUMBLR-00069', [
        {
          relationshipId: 'TUMBLR-00069_REL_001',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20 Professor Jay Rosen',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0310',
          contextSnippet: 'Clay Shirky',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0049',
          contextSnippet: 'New York University hosted a panel',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0543',
          contextSnippet: 'New Media’s Present and Future',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_005',
          sourceEntityId: 'P0005',
          relationshipType: 'Discusses',
          targetEntityId: 'C0047',
          contextSnippet: 'movement of public journalism',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0247',
          contextSnippet: 'mainstream media',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_007',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0249',
          contextSnippet: 'after-the-fact-checking',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_008',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0555',
          contextSnippet: 'Dan Rather',
        },
        {
          relationshipId: 'TUMBLR-00069_REL_009',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0289',
          contextSnippet: 'Rupert Murdoch',
        },
      ]],
      ['TUMBLR-00071', [
        {
          relationshipId: 'TUMBLR-00071_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0115',
          contextSnippet: 'musical explainers for ProPublica',
        },
        {
          relationshipId: 'TUMBLR-00071_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'C0427',
          contextSnippet: 'think entrepreneurially',
        },
        {
          relationshipId: 'TUMBLR-00071_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0843',
          contextSnippet: 'create a YouTube account',
        },
        {
          relationshipId: 'TUMBLR-00071_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0075',
          contextSnippet: 'community on Twitter or Reddit',
        },
        {
          relationshipId: 'TUMBLR-00071_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O1521',
          contextSnippet: 'Twitter or Reddit',
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

  it('maps Tumblr extraction batch nine to existing entities with source excerpts', () => {
    const expected = new Map([
      ['TUMBLR-00073', [
        {
          relationshipId: 'TUMBLR-00073_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0081',
          contextSnippet: 'working at\nUnivision News',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0034',
          contextSnippet: 'working as a Community Intern at\nThe Huffington Post',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0158',
          contextSnippet: 'web producer for the\nGuardian U.S.',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0051',
          contextSnippet: 'the Atlantic’s health channel',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0118',
          contextSnippet: 'picked up by the Drudge Report',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0276',
          contextSnippet: 'Laura Edwins',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_007',
          sourceEntityId: 'P0276',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0121',
          contextSnippet: 'Laura Edwins\nis currently the web intern at the Christian Science Monitor',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_008',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O1420',
          contextSnippet: 'Quartz',
        },
        {
          relationshipId: 'TUMBLR-00073_REL_009',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O1170',
          contextSnippet: 'NBC Universal’s iVillage',
        },
      ]],
      ['TUMBLR-00077', [
        {
          relationshipId: 'TUMBLR-00077_REL_001',
          sourceEntityId: 'P0005',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20 Director\nJay Rosen',
        },
        {
          relationshipId: 'TUMBLR-00077_REL_002',
          sourceEntityId: 'P0005',
          relationshipType: 'Discusses',
          targetEntityId: 'C0015',
          contextSnippet: 'Journalism, the practice',
        },
        {
          relationshipId: 'TUMBLR-00077_REL_003',
          sourceEntityId: 'P0005',
          relationshipType: 'Discusses',
          targetEntityId: 'C0238',
          contextSnippet: 'the media',
        },
      ]],
      ['TUMBLR-00078', [
        {
          relationshipId: 'TUMBLR-00078_REL_001',
          sourceEntityId: 'P1225',
          relationshipType: 'Affiliated With',
          targetEntityId: 'O0179',
          contextSnippet: 'Studio 20\nProfessor Jason Samuels',
        },
        {
          relationshipId: 'TUMBLR-00078_REL_002',
          sourceEntityId: 'P1225',
          relationshipType: 'Mentions',
          targetEntityId: 'P0088',
          contextSnippet: 'President Barack Obama’s 2010 State of the Union address',
        },
      ]],
      ['TUMBLR-00079', [
        {
          relationshipId: 'TUMBLR-00079_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P1225',
          contextSnippet: 'Professor Jason Samuels’ latest documentary project',
        },
        {
          relationshipId: 'TUMBLR-00079_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0015',
          contextSnippet: 'air on CNN',
        },
        {
          relationshipId: 'TUMBLR-00079_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0088',
          contextSnippet: 'President Obama',
        },
        {
          relationshipId: 'TUMBLR-00079_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0093',
          contextSnippet: 'Hillary Clinton',
        },
        {
          relationshipId: 'TUMBLR-00079_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P0240',
          contextSnippet: 'Rahm Emanuel',
        },
        {
          relationshipId: 'TUMBLR-00079_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P2445',
          contextSnippet: 'Olympia Snowe',
        },
        {
          relationshipId: 'TUMBLR-00079_REL_007',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P1915',
          contextSnippet: 'Douglas Brinkley',
        },
        {
          relationshipId: 'TUMBLR-00079_REL_008',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'P1078',
          contextSnippet: 'David Sanger',
        },
      ]],
      ['TUMBLR-00081', [
        {
          relationshipId: 'TUMBLR-00081_REL_001',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0214',
          contextSnippet: 'New York Daily News',
        },
        {
          relationshipId: 'TUMBLR-00081_REL_002',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0849',
          contextSnippet: 'The Boston Herald',
        },
        {
          relationshipId: 'TUMBLR-00081_REL_003',
          sourceEntityId: 'O0179',
          relationshipType: 'Mentions',
          targetEntityId: 'O0454',
          contextSnippet: 'City University of New York (CUNY)',
        },
        {
          relationshipId: 'TUMBLR-00081_REL_004',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0426',
          contextSnippet: 'innovation—in the newsroom and in class',
        },
        {
          relationshipId: 'TUMBLR-00081_REL_005',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0543',
          contextSnippet: 'new media and how they’re innovating',
        },
        {
          relationshipId: 'TUMBLR-00081_REL_006',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0289',
          contextSnippet: 'legacy media that have been innovating',
        },
        {
          relationshipId: 'TUMBLR-00081_REL_007',
          sourceEntityId: 'O0179',
          relationshipType: 'Discusses',
          targetEntityId: 'C0015',
          contextSnippet: 'started in journalism',
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
