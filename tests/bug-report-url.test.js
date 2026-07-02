// Tests for the "Report a bug" prefilled-issue link builder (#450).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBugReportUrl, buildReportFallbackUrl } from '../frontend/utils/bugReport.js';

test('builds a github new-issue url targeting the bug_report form', () => {
  const url = buildBugReportUrl({
    page: 'https://pressthink.org/j/rosen-archive/',
    version: '3.4.3',
    browser: 'Mozilla/5.0',
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://github.com/jamditis/rosen-frontend/issues/new');
  assert.equal(u.searchParams.get('template'), 'bug_report.yml');
  assert.equal(u.searchParams.get('labels'), 'bug,user-report');
  assert.equal(u.searchParams.get('page-context'), 'https://pressthink.org/j/rosen-archive/');
  assert.equal(u.searchParams.get('archive-version'), '3.4.3');
  assert.equal(u.searchParams.get('browser'), 'Mozilla/5.0');
});

test('encodes a record deep-link and a spaced user-agent without corrupting them', () => {
  const page = 'https://pressthink.org/j/rosen-archive/?record=RECORD-00421#archive';
  const browser = 'Mozilla/5.0 (X11; Linux x86_64) Safari/537.36';
  const url = buildBugReportUrl({ page, version: '3.4.3', browser });
  const u = new URL(url);
  // Values round-trip through the parser intact (the # is part of the value,
  // not a fragment, so the record id survives).
  assert.equal(u.searchParams.get('page-context'), page);
  assert.equal(u.searchParams.get('browser'), browser);
  assert.equal(u.hash, '', 'the # in the page value must be encoded, not a real fragment');
  const rawQuery = url.split('?')[1];
  assert.ok(!rawQuery.includes(' '), 'spaces in the query must be encoded');
});

test('omitting context yields empty strings, never the literal "undefined"', () => {
  const u = new URL(buildBugReportUrl());
  assert.equal(u.searchParams.get('page-context'), '');
  assert.equal(u.searchParams.get('archive-version'), '');
  assert.equal(u.searchParams.get('browser'), '');
  assert.equal(u.searchParams.get('template'), 'bug_report.yml');
});

test('prefill keys match the bug_report.yml field ids (guards against drift)', () => {
  // GitHub maps query params onto issue-form fields by id, so a rename on either
  // side silently breaks prefill. Keep them locked together.
  const yml = readFileSync(
    new URL('../.github/ISSUE_TEMPLATE/bug_report.yml', import.meta.url),
    'utf8',
  );
  for (const id of ['page-context', 'archive-version', 'browser']) {
    assert.ok(yml.includes(`id: ${id}`), `bug_report.yml is missing field id: ${id}`);
  }
});

// The modal falls back to a prefilled GitHub link when the backend is
// unavailable (pre-deploy, or an outage). The fallback must be intent-aware and
// carry the reader's typed data so nothing is lost and the record suggestion
// does not land on the bug form.

test('problem fallback uses the bug template and carries the typed fields', () => {
  const url = buildReportFallbackUrl({
    intent: 'problem',
    fields: { whatHappened: 'blank page', expected: 'a record', steps: '1. click' },
    context: { page: 'https://p/', version: '3.4.9', browser: 'UA' },
  });
  const u = new URL(url);
  assert.equal(u.searchParams.get('template'), 'bug_report.yml');
  assert.equal(u.searchParams.get('labels'), 'bug,user-report');
  assert.equal(u.searchParams.get('what-happened'), 'blank page');
  assert.equal(u.searchParams.get('expected'), 'a record');
  assert.equal(u.searchParams.get('steps'), '1. click');
  assert.equal(u.searchParams.get('page-context'), 'https://p/');
});

test('record fallback opens a record issue, not the bug form, and keeps url/title/why', () => {
  const url = buildReportFallbackUrl({
    intent: 'record',
    fields: { url: 'https://pressthink.org/x', title: 'A piece', why: 'it belongs' },
    context: { page: 'https://p/', version: '3.4.9', browser: 'UA' },
  });
  const u = new URL(url);
  // A record suggestion must never use the bug template.
  assert.equal(u.searchParams.get('template'), null);
  assert.equal(u.searchParams.get('labels'), 'record-suggestion,user-report');
  assert.match(u.searchParams.get('title'), /^\[record\] A piece/);
  const body = u.searchParams.get('body');
  assert.match(body, /https:\/\/pressthink\.org\/x/);
  assert.match(body, /A piece/);
  assert.match(body, /it belongs/);
});

test('record fallback titles on the url when no title was entered', () => {
  const u = new URL(buildReportFallbackUrl({ intent: 'record', fields: { url: 'https://x.io/a' } }));
  assert.match(u.searchParams.get('title'), /^\[record\] https:\/\/x\.io\/a/);
});

test('fallback defaults to the problem form and never emits "undefined"', () => {
  const u = new URL(buildReportFallbackUrl());
  assert.equal(u.searchParams.get('template'), 'bug_report.yml');
  assert.equal(u.searchParams.get('what-happened'), '');
  assert.equal(u.searchParams.get('page-context'), '');
});
