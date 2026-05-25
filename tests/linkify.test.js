/**
 * Unit tests for the URL-splitting helper backing RecordModal.linkifyText (#161).
 *
 * The previous implementation called `urlPattern.test(part)` on a `g`-flagged
 * regex inside a `.map()`, then reset `lastIndex = 0` only on the truthy
 * branch — fragile reliance on regex state. Extracted into a pure function so
 * the splitting logic can be tested without a React/jsdom harness.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { splitUrlsForLinkify } from '../frontend/utils/linkify.js';

describe('splitUrlsForLinkify (#161)', () => {
  it('returns null for null/empty input', () => {
    assert.strictEqual(splitUrlsForLinkify(null), null);
    assert.strictEqual(splitUrlsForLinkify(undefined), null);
    assert.strictEqual(splitUrlsForLinkify(''), null);
  });

  it('returns plain text untouched when there are no URLs', () => {
    const out = splitUrlsForLinkify('just a sentence about the press.');
    assert.deepStrictEqual(out, [
      { type: 'text', value: 'just a sentence about the press.' },
    ]);
  });

  it('classifies a single URL surrounded by text', () => {
    const out = splitUrlsForLinkify('see https://example.com for details');
    assert.deepStrictEqual(out, [
      { type: 'text', value: 'see ' },
      { type: 'url', value: 'https://example.com' },
      { type: 'text', value: ' for details' },
    ]);
  });

  it('classifies multiple URLs in the same string', () => {
    const out = splitUrlsForLinkify('https://a.com and also https://b.com');
    const urls = out.filter((p) => p.type === 'url').map((p) => p.value);
    assert.deepStrictEqual(urls, ['https://a.com', 'https://b.com']);
  });

  it('preserves all 10 URLs in a stress case', () => {
    // The original implementation could lose URLs if a `g`-flagged
    // `.test()` advanced past one on the second iteration; verifying every
    // URL survives is the strongest behaviour check.
    const expected = Array.from({ length: 10 }, (_, i) => `https://example.com/post-${i}`);
    const text = expected.map((u) => `Reading ${u} now.`).join(' ');
    const got = splitUrlsForLinkify(text).filter((p) => p.type === 'url').map((p) => p.value);
    assert.deepStrictEqual(got, expected);
  });

  it('handles http:// alongside https://', () => {
    const out = splitUrlsForLinkify('legacy http://old.example.org plus https://new.example.com');
    const urls = out.filter((p) => p.type === 'url').map((p) => p.value);
    assert.deepStrictEqual(urls, ['http://old.example.org', 'https://new.example.com']);
  });

  it('is idempotent across repeated calls (no leaked regex state)', () => {
    // The original used a module-scoped stateful `g`-flagged regex and
    // reset lastIndex inside the loop. Two back-to-back calls must yield
    // identical structure.
    const text = 'see https://example.com for details';
    const a = splitUrlsForLinkify(text);
    const b = splitUrlsForLinkify(text);
    assert.deepStrictEqual(a, b);
  });
});
