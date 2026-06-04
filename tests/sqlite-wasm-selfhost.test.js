/**
 * Self-hosted sql.js WASM regression tests (#291).
 *
 * The sql.js loader JS is pinned with Subresource Integrity, but sql.js
 * exposes no SRI hook for the .wasm it fetches through locateFile. Fetching
 * that binary from cdnjs left it version-pinned but not integrity-verified —
 * a single-CDN compromise could swap in arbitrary WebAssembly that runs in
 * any session touching Analytics or Explorer. We now serve the binary from
 * our own deploy bundle and pin its bytes here.
 *
 * These checks guard two things: that the committed binary is the genuine,
 * unmodified sql.js 1.10.3 wasm (SHA-384, cross-verified against the npm
 * registry tarball and cdnjs, which were byte-identical), and that
 * sqliteService no longer reaches a remote CDN for the wasm.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// SHA-384 of sql.js 1.10.3 dist/sql-wasm.wasm. Verified byte-identical from
// two independent sources: the npm registry tarball (sql.js@1.10.3) and
// cdnjs (the app's prior runtime source). 655,300 bytes.
const EXPECTED_SHA384_HEX =
  '9129b4007f61a3cf676a955f3457ff9024531fac41a024b7a9ffc04c625e6054052a27a004c2e143769421906560ba5a';
const EXPECTED_SIZE_BYTES = 655300;
const WASM_REL_PATH = 'frontend/vendor/sql-wasm-1.10.3.wasm';

describe('self-hosted sql.js wasm (#291)', () => {
  it('commits the version-pinned wasm binary in frontend/vendor', () => {
    const file = path.join(rootDir, WASM_REL_PATH);
    assert.ok(fs.existsSync(file), `expected committed binary at ${WASM_REL_PATH}`);
    assert.strictEqual(
      fs.statSync(file).size,
      EXPECTED_SIZE_BYTES,
      'committed wasm size does not match sql.js 1.10.3'
    );
  });

  it('committed wasm matches the verified sql.js 1.10.3 SHA-384', () => {
    const file = path.join(rootDir, WASM_REL_PATH);
    const buf = fs.readFileSync(file);
    const digest = crypto.createHash('sha384').update(buf).digest('hex');
    assert.strictEqual(
      digest,
      EXPECTED_SHA384_HEX,
      'committed wasm SHA-384 mismatch — the binary was altered or is not genuine sql.js 1.10.3'
    );
  });

  it('sqliteService locateFile no longer fetches the wasm from a CDN', () => {
    const file = path.join(rootDir, 'frontend', 'services', 'sqliteService.js');
    const src = fs.readFileSync(file, 'utf-8');

    // The locateFile callback must resolve to the self-hosted path, not a
    // remote origin. Isolate the locateFile expression and assert it carries
    // no protocol-absolute URL.
    const idx = src.indexOf('locateFile:');
    assert.ok(idx >= 0, 'expected a locateFile callback in sqliteService.js');
    const expr = src.slice(idx, src.indexOf('\n', idx) + 1);

    assert.doesNotMatch(
      expr,
      /https?:\/\//,
      'locateFile must not point the wasm at a remote CDN (#291)'
    );
    assert.match(
      src,
      /vendor\/sql-wasm-1\.10\.3\.wasm/,
      'sqliteService must reference the self-hosted vendor wasm path (#291)'
    );
  });
});
