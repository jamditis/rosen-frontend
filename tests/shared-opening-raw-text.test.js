/**
 * Guards the raw_text corrections from the shared-opening audit (issue #864).
 *
 * The audit grouped the curated records whose raw_text or excerpt open with the
 * same twelve words (docs/research/2026-11-shared-opening-raw-text-audit.md).
 * Two of those groups were text attached to the wrong record, and the correct
 * text was already in the repository, so the audit restored it:
 *
 * - RECORD-00029, the 2016 PressThink essay on asymmetry, stored the transcript
 *   of RECORD-00030, a two-minute IRE video about crowdsourcing. The PressThink
 *   source journal holds the essay's own text, linked to RECORD-00029.
 * - RECORD-00161, the December 2003 post on Tim Rutten, stored only the PressThink
 *   sidebar of older posts. Its body was stored on RECORD-00162 instead, and the
 *   deleted print twin RECORD-00459 (rutten_ombud_p.html, removed in d9a8f6f2)
 *   carried the same body.
 *
 * These checks keep both from sliding back.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const RUTTEN_OPENING =
  'Tim Rutten of the LA Times has big problems with the new ombudsman at the New York Times.';
const SIDEBAR_OPENING = 'The People Formerly Known as the Audience:';
const CROWDSOURCING_OPENING = 'all right why is crowdsourcing important for journalists';

let byId;
let journal;

before(() => {
  const records = parse(
    fs.readFileSync(path.join(rootDir, 'data', 'archive_records-public.csv'), 'utf8'),
    { columns: true, skip_empty_lines: true },
  );
  byId = new Map(records.map((record) => [record.id, record]));
  journal = fs
    .readFileSync(path.join(rootDir, 'preservation', 'pressthink', 'versions.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
});

describe('shared-opening audit corrections (#864)', () => {
  it('stores the asymmetry essay on RECORD-00029, from its linked source version', () => {
    const versions = journal.filter((entry) => entry.record_id === 'RECORD-00029');
    assert.ok(versions.length > 0, 'the PressThink journal links a version to RECORD-00029');
    const latest = versions[versions.length - 1];
    assert.match(latest.source.url, /asymmetry-between-the-major-parties-fries-the-circuits/);

    const record = byId.get('RECORD-00029');
    assert.equal(record.raw_text, latest.source.text);
    assert.ok(
      !record.raw_text.startsWith(CROWDSOURCING_OPENING),
      'RECORD-00029 must not carry the RECORD-00030 crowdsourcing transcript',
    );
  });

  it('leaves the crowdsourcing transcript on RECORD-00030, where it belongs', () => {
    assert.ok(byId.get('RECORD-00030').raw_text.startsWith(CROWDSOURCING_OPENING));
  });

  it('stores the Rutten post body on RECORD-00161 instead of the sidebar', () => {
    const record = byId.get('RECORD-00161');
    assert.ok(record.raw_text.startsWith(RUTTEN_OPENING), 'RECORD-00161 opens with its own post');
    assert.ok(!record.raw_text.includes(SIDEBAR_OPENING), 'the sidebar capture is gone');
    assert.match(record.url, /\/2003\/12\/11\/rutten_ombud\.html$/);
  });
});
