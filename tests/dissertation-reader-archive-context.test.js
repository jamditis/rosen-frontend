import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reader = readFileSync('dissertation/reader/index.html', 'utf8');

test('the dissertation reader identifies its place in the larger archive', () => {
  assert.match(reader, /<nav class="reader-context" aria-label="Breadcrumb">[\s\S]*href="\.\.\/\.\.\/"[\s\S]*Jay Rosen Internet Archive[\s\S]*The Impossible Press[\s\S]*<\/nav>/);
});
