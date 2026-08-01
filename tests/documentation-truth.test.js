import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('documentation truth', () => {
  it('does not hard-code the changing test-file inventory in CLAUDE.md', () => {
    const guide = fs.readFileSync(path.join(rootDir, 'CLAUDE.md'), 'utf8');
    const inventoryLines = guide
      .split('\n')
      .filter((line) => line.includes('tests/') && /test suite|suite under/i.test(line));

    assert.ok(inventoryLines.length > 0, 'CLAUDE.md must still describe the tests/ suite');

    for (const pattern of [
      /\b\d[\d,]*\s+\*\.test\.js files?\b/i,
      /\b\d[\d,]*\s+test files?\b/i,
      /\b\d[\d,]*\s+runnable\/support files?\b/i,
    ]) {
      for (const line of inventoryLines) {
        assert.doesNotMatch(
          line,
          pattern,
          'CLAUDE.md must describe the test suite without a count that drifts whenever coverage changes',
        );
      }
    }
  });
});
