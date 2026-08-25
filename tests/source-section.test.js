import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sourceSection } from './helpers/source-section.js';

describe('sourceSection', () => {
  it('returns only the text owned by the named markers', () => {
    assert.equal(
      sourceSection('before START owned END after', 'START', 'END', 'sample'),
      'START owned ',
    );
  });

  it('fails with the contract name when the start marker is absent', () => {
    assert.throws(
      () => sourceSection('END', 'START', 'END', 'sample contract'),
      /sample contract start marker must exist/,
    );
  });

  it('searches for the end marker after the selected start marker', () => {
    assert.equal(
      sourceSection('END ignored START owned END', 'START', 'END', 'sample'),
      'START owned ',
    );
  });
});
