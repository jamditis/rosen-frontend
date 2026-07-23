/**
 * Record deep-link behavioural tests (#422)
 *
 * The sibling tests/record-deeplink.test.js are source-pattern checks against
 * App.js — they assert the wiring but can't catch a regression that reintroduces
 * the bug by a different mechanism. These tests exercise the actual runtime
 * logic of the ?record=ID deep link by importing the pure helpers that both
 * router.js and App.js delegate to.
 *
 * frontend/services/router.js can't be imported here: it carries a ?v= suffix on
 * its viewState.js import that Node's loader won't resolve. So the pure pieces
 * live in frontend/utils/recordDeepLink.js (no ?v= imports), which router.js and
 * App.js import with the suffix in the browser and the tests import without it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalRecordUrl,
  parseRecordId,
  setRecordParam,
  shareRecordUrl,
} from '../frontend/utils/recordDeepLink.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

describe('parseRecordId — reads ?record= from a query string', () => {
  it('returns the id when ?record= is present', () => {
    assert.equal(parseRecordId('?record=RECORD-00042'), 'RECORD-00042');
  });

  it('returns the id among other params, in any position', () => {
    assert.equal(parseRecordId('?view=archive&record=BSKY-03121&x=1'), 'BSKY-03121');
  });

  it('accepts a leading-? or bare query string (URLSearchParams tolerates both)', () => {
    assert.equal(parseRecordId('record=RECORD-1'), 'RECORD-1');
  });

  it('returns null when the param is absent', () => {
    assert.equal(parseRecordId('?view=entities'), null);
  });

  it('returns null for an empty / undefined / null search', () => {
    assert.equal(parseRecordId(''), null);
    assert.equal(parseRecordId(undefined), null);
    assert.equal(parseRecordId(null), null);
  });

  it('treats a present-but-empty ?record= as no record (null, not "")', () => {
    // `params.get('record')` returns '' here; the `|| null` makes the absent and
    // empty cases indistinguishable to callers, which is the intended contract —
    // an empty id must not open a modal or pin a phantom selection.
    assert.equal(parseRecordId('?record='), null);
  });

  it('reads from a stubbed window.location.search the way getRecordIdFromUrl does', () => {
    // getRecordIdFromUrl() is `parseRecordId(window.location.search)`. Stub the
    // global the browser would supply and confirm the same value comes back.
    const prior = globalThis.window;
    globalThis.window = { location: { search: '?record=RECORD-00901' } };
    try {
      assert.equal(parseRecordId(globalThis.window.location.search), 'RECORD-00901');
    } finally {
      if (prior === undefined) delete globalThis.window;
      else globalThis.window = prior;
    }
  });
});

describe('setRecordParam — the write-effect set/delete branch', () => {
  it('sets ?record= when given a truthy id', () => {
    const params = new URLSearchParams('');
    setRecordParam(params, 'RECORD-00042');
    assert.equal(params.get('record'), 'RECORD-00042');
  });

  it('deletes ?record= when given a falsy id (null — the deselect case)', () => {
    const params = new URLSearchParams('?record=RECORD-00042');
    setRecordParam(params, null);
    assert.equal(params.has('record'), false);
  });

  it('deletes ?record= for every falsy id shape (undefined, empty string)', () => {
    for (const falsy of [undefined, '', 0]) {
      const params = new URLSearchParams('?record=RECORD-1');
      setRecordParam(params, falsy);
      assert.equal(params.has('record'), false, `expected delete for ${JSON.stringify(falsy)}`);
    }
  });

  it('round-trips: a written id is read back by parseRecordId', () => {
    // This is the deep-link contract that the mount-time race used to break:
    // selecting a record writes the param, and a reload (read) recovers it.
    const url = new URL('https://pressthink.org/j/rosen-archive/');
    setRecordParam(url.searchParams, 'RECORD-00777');
    assert.equal(parseRecordId(url.search), 'RECORD-00777');
  });

  it('returns the same searchParams it was given (chainable)', () => {
    const params = new URLSearchParams('');
    assert.equal(setRecordParam(params, 'X-1'), params);
  });
});

describe('canonicalRecordUrl — one share format across archive surfaces', () => {
  it('strips desktop state and filter params from a record URL', () => {
    assert.equal(
      canonicalRecordUrl(
        'https://pressthink.org/j/rosen-archive/?q=press&record=OLD#desktop/archive',
        'RECORD-00042',
      ),
      'https://pressthink.org/j/rosen-archive/?record=RECORD-00042',
    );
  });

  it('preserves local and GitHub Pages base paths', () => {
    assert.equal(
      canonicalRecordUrl('http://127.0.0.1:8765/#desktop/archive', 'BSKY-17'),
      'http://127.0.0.1:8765/?record=BSKY-17',
    );
    assert.equal(
      canonicalRecordUrl('https://example.github.io/rosen-frontend/#desktop', 'X-9'),
      'https://example.github.io/rosen-frontend/?record=X-9',
    );
  });

  it('rejects missing URL or record inputs', () => {
    assert.throws(() => canonicalRecordUrl('', 'RECORD-1'), /location URL/);
    assert.throws(() => canonicalRecordUrl('https://example.com/', ''), /record id/);
  });
});

describe('shareRecordUrl — bounded archive shells with useful social previews', () => {
  it('uses the original source for social records', () => {
    assert.equal(
      shareRecordUrl(
        'https://pressthink.org/j/rosen-archive/?record=OLD',
        {
          id: 'BSKY-03121',
          type: 'social',
          url: 'https://bsky.app/profile/jayrosen.bsky.social/post/abc',
        },
      ),
      'https://bsky.app/profile/jayrosen.bsky.social/post/abc',
    );
  });

  it('keeps non-social records on the archive metadata route', () => {
    assert.equal(
      shareRecordUrl(
        'https://pressthink.org/j/rosen-archive/#desktop/archive',
        { id: 'RECORD-00042', type: 'article', url: 'https://example.com/story' },
      ),
      'https://pressthink.org/j/rosen-archive/?record=RECORD-00042',
    );
  });

  it('falls back to the archive route for an unsafe social source URL', () => {
    assert.equal(
      shareRecordUrl(
        'https://pressthink.org/j/rosen-archive/',
        { id: 'BSKY-03121', type: 'social', url: 'javascript:alert(1)' },
      ),
      'https://pressthink.org/j/rosen-archive/?record=BSKY-03121',
    );
  });
});

describe('production delegates to these helpers (keeps the tests above relevant)', () => {
  // The behavioural assertions only protect the shipped deep link if the real
  // code routes through parseRecordId/setRecordParam. Without these guards the
  // helper tests could stay green while a call site reintroduces an inline
  // branch — the exact way #422 could recur unseen. These source checks fail the
  // moment a call site stops delegating, tying the behavioural coverage to the
  // production path. The mount-time URL race itself is guarded separately by
  // tests/record-deeplink.test.js.
  it('router.js getRecordIdFromUrl reads via parseRecordId', () => {
    assert.match(readSrc('frontend/services/router.js'), /parseRecordId\(window\.location\.search\)/);
  });

  it('router.js navigateTo writes the record param via setRecordParam', () => {
    assert.match(readSrc('frontend/services/router.js'), /setRecordParam\(\s*url\.searchParams\s*,\s*recordId\s*\)/);
  });

  it('App.js URL-sync effect writes the record param via setRecordParam', () => {
    assert.match(
      readSrc('frontend/App.js'),
      /setRecordParam\(\s*url\.searchParams\s*,[\s\S]{0,120}selectedRecordId\s*,?\s*\)/,
    );
  });

  it('RecordModal delegates share targets to shareRecordUrl', () => {
    assert.match(
      readSrc('frontend/components/RecordModal.js'),
      /shareRecordUrl\(window\.location\.href,\s*shareRecord\)/,
    );
    assert.match(
      readSrc('frontend/components/RecordModal.js'),
      /const shareRecord = record\?\.type === 'social'\s*\? currentFullRecord/,
    );
    assert.match(
      readSrc('frontend/components/RecordModal.js'),
      /fullRecord\?\.id === record\?\.id \? fullRecord : null/,
    );
    assert.match(readSrc('frontend/components/RecordModal.js'), /disabled=\$\{sharePending\}/);
  });
});
