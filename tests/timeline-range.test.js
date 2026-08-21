import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const timelineSource = fs.readFileSync(
  path.join(repoRoot, 'frontend', 'components', 'Timeline.js'),
  'utf8',
);

describe('timeline visible year range', () => {
  it('uses the first and last populated years instead of padded bar endpoints', () => {
    assert.match(
      timelineSource,
      /\$\{enabledYears\[0\]\}–\$\{enabledYears\[enabledYears\.length - 1\]\}/,
    );
    assert.doesNotMatch(
      timelineSource,
      /\$\{timelineData\[0\]\.year\}–\$\{timelineData\[timelineData\.length - 1\]\.year\}/,
    );
  });
});
