/**
 * Record deep-link regression tests (?record=ID)
 *
 * Guards the bug where pasting a link to a specific record dropped the visitor
 * on the homepage instead of opening that record. Two effects in App.js race on
 * a deep-linked load: the "write URL from state" effect runs on mount, and the
 * "read state from URL" effect is gated on the async archive data. If
 * selectedRecordId starts as null, the write effect calls
 * url.searchParams.delete('record') on mount and erases ?record=ID before the
 * read effect (which waits for records to load) can ever see it.
 *
 * The fix initialises selectedRecordId from the URL so the mount-time write
 * effect preserves the param instead of deleting it. These are source-pattern
 * checks because the suite has no browser/React harness; the runtime behaviour
 * was verified with Playwright against the preview server.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'App.js'), 'utf-8');

describe('record deep links survive initial mount', () => {
  it('initialises selectedRecordId from the URL, not from a bare null', () => {
    const match = appJs.match(
      /\[\s*selectedRecordId\s*,\s*setSelectedRecordId\s*\]\s*=\s*useState\(([\s\S]*?)\)\s*;/
    );
    assert.ok(match, 'selectedRecordId useState declaration not found in App.js');

    const initializer = match[1].trim();
    assert.ok(
      /getRecordIdFromUrl\s*\(\s*\)/.test(initializer),
      'selectedRecordId must be initialised from getRecordIdFromUrl() so a ?record= deep link survives mount'
    );
    assert.ok(
      initializer !== 'null',
      'selectedRecordId must not be initialised to null — the mount-time URL effect would delete the ?record= param before it is read'
    );
  });

  it('validates the deep-linked id once records load, clearing a non-match', () => {
    // The lazy initialiser trusts the URL, so a bogus ?record=NOPE would pin a
    // phantom id (no modal, but the param sticks). The [records]-keyed effect
    // must resolve the id against loaded records and clear it when there is no
    // match. Guard that validation branch, not merely the presence of a read.
    assert.match(
      appJs,
      /records\.find\(\s*r\s*=>\s*r\.id\s*===\s*recordId\s*\)/,
      'App.js must resolve the deep-linked id against loaded records (records.find by id)'
    );
    assert.match(
      appJs,
      /setSelectedRecordId\(\s*target\s*\?\s*recordId\s*:\s*null\s*\)/,
      'App.js must clear the selected record id when the deep-linked id matches no loaded record'
    );
  });
});
