/**
 * Extraction coverage invariant (issue #207).
 *
 * Locks in: every RECORD-* whose raw_text is long enough to be a real article
 * (>= 500 chars, matching backend/scripts/recover_articles_playwright.py:44
 * MIN_OK_LEN so test and recovery pipeline share one notion of "real article")
 * must appear at least once as source_record_id in extracted_relationships.csv.
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
// Empty as of #294: RECORD-00740 (OTM segment) and RECORD-00783 (fora.tv talk)
// were both recovered from the Internet Archive, their raw_text replaced, and
// entity extraction re-run, so neither needs allowlisting anymore. Note
// RECORD-00783 is abstract-only by nature: the fora.tv source was video, so no
// transcript exists to recover and its raw_text is the event abstract. Its
// entity yield is genuine but thin -- that is the ceiling, not a regression to
// re-recover.
const ALLOWLIST = new Set([]);

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
  it('every RECORD-* with raw_text >= 500 chars appears as source_record_id in extracted_relationships.csv', () => {
    const haveRel = new Set(
      relationships.map(r => r.source_record_id).filter(Boolean)
    );
    const offenders = records
      .filter(r => r.id.startsWith('RECORD-'))
      .filter(r => (r.raw_text || '').trim().length >= RAW_TEXT_MIN)
      .filter(r => !haveRel.has(r.id))
      .filter(r => !ALLOWLIST.has(r.id))
      .map(r => r.id);
    assert.strictEqual(
      offenders.length,
      0,
      `${offenders.length} RECORD-* have raw_text >= ${RAW_TEXT_MIN} chars but 0 extracted relationships. ` +
      `Sample: ${offenders.slice(0, 10).join(', ')}${offenders.length > 10 ? ', ...' : ''}`
    );
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
