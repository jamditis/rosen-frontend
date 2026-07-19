/**
 * "needs review" flag tests (#350)
 *
 * The card feed and record modal render a subtle marker when a record is
 * auto-published but flagged for a human pass. The flag's type is not stable
 * across the data pipeline: the committed JSON stores a boolean, while
 * data/export-archive-data.js coerces it with .toString() (a string) on
 * regeneration. The predicate must read both shapes, so these tests pin both —
 * a boolean-only `=== true` check (what the issue first suggested) would stop
 * rendering the day the JSON is regenerated as strings. Upstream type
 * normalisation is tracked in #356.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordNeedsReview } from '../frontend/utils/needsReview.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('recordNeedsReview — flagged only for an explicit true', () => {
  it('flags a boolean true (the committed-JSON shape)', () => {
    assert.equal(recordNeedsReview({ needsReview: true }), true);
  });

  it("flags the string 'true' (the export-archive-data.js .toString() shape)", () => {
    assert.equal(recordNeedsReview({ needsReview: 'true' }), true);
  });

  it("flags a string 'true' regardless of case or surrounding space", () => {
    assert.equal(recordNeedsReview({ needsReview: 'True' }), true);
    assert.equal(recordNeedsReview({ needsReview: '  true ' }), true);
    assert.equal(recordNeedsReview({ needsReview: 'TRUE' }), true);
  });

  it('does not flag boolean false (the common case — 26,606 records today)', () => {
    assert.equal(recordNeedsReview({ needsReview: false }), false);
  });

  it("does not flag the string 'false' or an empty string", () => {
    assert.equal(recordNeedsReview({ needsReview: 'false' }), false);
    assert.equal(recordNeedsReview({ needsReview: '' }), false);
  });

  it('does not flag an absent field (the 9 records with no needsReview)', () => {
    assert.equal(recordNeedsReview({ id: 'THREAD-00011' }), false);
  });

  it('does not flag a truthy non-true value (no accidental coercion)', () => {
    // A bare `if (record.needsReview)` would wrongly flag these; the strict
    // predicate must not. 1 and 'yes' are not the flag's true representation.
    assert.equal(recordNeedsReview({ needsReview: 1 }), false);
    assert.equal(recordNeedsReview({ needsReview: 'yes' }), false);
    assert.equal(recordNeedsReview({ needsReview: {} }), false);
  });

  it('is null/undefined-safe (no record, or no field)', () => {
    assert.equal(recordNeedsReview(null), false);
    assert.equal(recordNeedsReview(undefined), false);
    assert.equal(recordNeedsReview({ needsReview: null }), false);
    assert.equal(recordNeedsReview({ needsReview: undefined }), false);
  });
});

describe('the live marker surfaces delegate to the predicate (keeps coverage relevant)', () => {
  // ArchiveResults owns the shared standard/desktop card feed; RecordModal owns
  // the detail surface. Both must route through recordNeedsReview, or a future
  // edit could drop the marker / hand-roll a buggy check and #350 recurs.
  it('ArchiveResults.js (shared live card feed) renders the marker via recordNeedsReview', () => {
    assert.match(readSrc('frontend/components/ArchiveResults.js'), /recordNeedsReview\(\s*item\s*\)/);
  });

  it('RecordModal.js (record modal) renders the marker via recordNeedsReview on the core record', () => {
    // Must read the core `record` prop, NOT `displayRecord`: the modal merges
    // on-demand details over the core record ({...record, ...details}), and
    // archive-details.json carries its own needsReview that would overwrite a
    // freshly flagged core record. Reading `record` immunizes the marker.
    assert.match(readSrc('frontend/components/RecordModal.js'), /recordNeedsReview\(\s*record\s*\)/);
  });
});
