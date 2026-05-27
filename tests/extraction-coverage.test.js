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

let records, relationships;

before(() => {
  records = parse(
    fs.readFileSync(path.join(dataDir, 'archive_records-public.csv'), 'utf-8'),
    { columns: true, skip_empty_lines: true }
  );
  relationships = parse(
    fs.readFileSync(path.join(dataDir, 'extracted_relationships.csv'), 'utf-8'),
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
      .map(r => r.id);
    assert.strictEqual(
      offenders.length,
      0,
      `${offenders.length} RECORD-* have raw_text >= ${RAW_TEXT_MIN} chars but 0 extracted relationships. ` +
      `Sample: ${offenders.slice(0, 10).join(', ')}${offenders.length > 10 ? ', ...' : ''}`
    );
  });
});
