import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { acquireBodyScrollLock } from '../frontend/services/bodyScrollLock.js';

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

describe('shared body scroll lock', () => {
  it('stays locked when the record closes underneath its nested report', () => {
    globalThis.document = { body: { style: { overflow: '' } } };
    const releaseRecord = acquireBodyScrollLock();
    const releaseReport = acquireBodyScrollLock();

    try {
      releaseRecord();
      assert.equal(document.body.style.overflow, 'hidden');

      releaseReport();
      assert.equal(document.body.style.overflow, '');
    } finally {
      releaseRecord();
      releaseReport();
    }
  });

  it('restores a pre-existing style once and tolerates duplicate releases', () => {
    globalThis.document = { body: { style: { overflow: 'clip' } } };
    const release = acquireBodyScrollLock();

    release();
    release();

    assert.equal(document.body.style.overflow, 'clip');
  });
});
