/**
 * Unit tests for sanitizeHref (#322).
 *
 * record/thread/explorer link hrefs render attacker-controllable record URLs
 * straight into an <a href> via HTM, which does not strip dangerous schemes.
 * sanitizeHref allowlists http/https/mailto (plus scheme-less relative URLs,
 * which the archive uses for the dissertation reader link) and collapses
 * everything else — javascript:, data:, vbscript:, and the tab/newline
 * control-char bypasses browsers would otherwise execute — to '#'.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHref } from '../frontend/utils/sanitizeHref.js';

describe('sanitizeHref (#322)', () => {
  it('passes through http/https/mailto absolute URLs unchanged', () => {
    assert.strictEqual(sanitizeHref('https://example.com/x?y=1#z'), 'https://example.com/x?y=1#z');
    assert.strictEqual(sanitizeHref('http://example.com'), 'http://example.com');
    assert.strictEqual(sanitizeHref('mailto:rosen@example.com'), 'mailto:rosen@example.com');
  });

  it('passes through relative and protocol-relative URLs (e.g. the dissertation reader link)', () => {
    assert.strictEqual(sanitizeHref('./dissertation/reader/'), './dissertation/reader/');
    assert.strictEqual(sanitizeHref('/j/rosen-archive/dissertation/reader/'), '/j/rosen-archive/dissertation/reader/');
    assert.strictEqual(sanitizeHref('//embed.bsky.app/profile/x'), '//embed.bsky.app/profile/x');
    assert.strictEqual(sanitizeHref('#'), '#');
  });

  it('neutralizes javascript: in every casing and whitespace variant', () => {
    assert.strictEqual(sanitizeHref('javascript:alert(1)'), '#');
    assert.strictEqual(sanitizeHref('JaVaScRiPt:alert(1)'), '#');
    assert.strictEqual(sanitizeHref('  javascript:alert(1)'), '#');
  });

  it('neutralizes the tab/newline control-char scheme bypasses', () => {
    assert.strictEqual(sanitizeHref('java\tscript:alert(1)'), '#');
    assert.strictEqual(sanitizeHref('java\nscript:alert(1)'), '#');
    assert.strictEqual(sanitizeHref('java\r\nscript:alert(1)'), '#');
  });

  it('neutralizes data: and vbscript:', () => {
    assert.strictEqual(sanitizeHref('data:text/html,<script>alert(1)</script>'), '#');
    assert.strictEqual(sanitizeHref('vbscript:msgbox(1)'), '#');
  });

  it('returns # for non-string and empty input', () => {
    assert.strictEqual(sanitizeHref(null), '#');
    assert.strictEqual(sanitizeHref(undefined), '#');
    assert.strictEqual(sanitizeHref(''), '#');
    assert.strictEqual(sanitizeHref('   '), '#');
    assert.strictEqual(sanitizeHref(42), '#');
  });
});
