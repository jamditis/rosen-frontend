/**
 * Regression test for #174 — backend/schema.json must not have a UTF-8 BOM.
 *
 * RFC 8259 forbids a BOM in JSON text. Plain `json.load(open(...))` raises
 * `JSONDecodeError: Unexpected UTF-8 BOM` if one is present, so multiple
 * loaders in backend/scripts/ had drifted into `encoding='utf-8-sig'`
 * workarounds while others stayed on plain reads. Strip the BOM at the
 * source and the inconsistency goes away.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

describe('backend JSON files have no UTF-8 BOM (#174)', () => {
  it('backend/schema.json does not start with EF BB BF', () => {
    const file = path.join(rootDir, 'backend', 'schema.json');
    const head = fs.readFileSync(file).subarray(0, 3);
    assert.notDeepStrictEqual(
      Array.from(head),
      [0xef, 0xbb, 0xbf],
      'backend/schema.json starts with a UTF-8 BOM — strip it so plain json.load works'
    );
  });

  it('backend/schema.json parses as valid JSON', () => {
    const file = path.join(rootDir, 'backend', 'schema.json');
    const txt = fs.readFileSync(file, 'utf-8');
    assert.doesNotThrow(() => JSON.parse(txt), 'backend/schema.json is not valid JSON');
  });
});
