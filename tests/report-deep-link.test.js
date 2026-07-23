import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readReportDeepLink } from '../frontend/utils/reportDeepLink.js';

test('reads each supported participation report intent and consumes only bridge params', () => {
  const record = readReportDeepLink('https://archive.test/?q=trust&report=record&source=participate#archive');
  assert.equal(record.intent, 'record');
  assert.equal(record.cleanHref, 'https://archive.test/?q=trust#archive');
  const problem = readReportDeepLink('https://archive.test/?report=problem&source=participate');
  assert.equal(problem.intent, 'problem');
  assert.equal(problem.cleanHref, 'https://archive.test/');
});

test('ignores forged, incomplete, and unrelated deep links without rewriting them', () => {
  for (const href of [
    'https://archive.test/?report=admin&source=participate',
    'https://archive.test/?report=record',
    'https://archive.test/?report=problem&source=elsewhere',
  ]) assert.deepEqual(readReportDeepLink(href), { intent: null, cleanHref: href });
});

test('opens the existing report modal once and removes consumed bridge parameters', async () => {
  const app = await readFile(new URL('../frontend/App.js', import.meta.url), 'utf8');

  assert.match(app, /const reportEntryHandled = useRef\(false\)/);
  assert.match(app, /const entry = readReportDeepLink\(window\.location\.href\)/);
  assert.match(app, /setBugReportIntent\(entry\.intent\)/);
  assert.match(app, /setBugReportOpen\(true\)/);
  assert.match(app, /window\.history\.replaceState\(\{\}, '', entry\.cleanHref\)/);
  assert.match(app, /initialIntent=\$\{bugReportIntent\}/);
});
