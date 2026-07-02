// Tests for the report web-app handler in automation/apps-script/Code.gs (#509).
//
// Same approach as apps-script-submit.test.js: a .gs file is plain JavaScript
// over Google-injected globals, so we load it into a node:vm sandbox with
// faithful stubs and drive doPost end-to-end. This extends the base stubs with
// ContentService (JSON output), LockService, and a MUTABLE PropertiesService so
// the daily-cap counter can be read and written like the live runtime.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'automation', 'apps-script', 'Code.gs'),
  'utf8',
);

const GOOD_PROPS = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_INSTALL_ID: '99887766',
  GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIIfake\\n-----END PRIVATE KEY-----',
};

function fakeResponse(code, body) {
  return {
    getResponseCode: () => code,
    getContentText: () => (body === undefined ? '' : body),
  };
}

// Default responder: 201 + token for auth, 201 + created issue for /issues.
function defaultFetch(url) {
  if (url.indexOf('/access_tokens') !== -1) {
    return fakeResponse(201, JSON.stringify({ token: 'ghs_test_token' }));
  }
  if (url.endsWith('/issues')) {
    return fakeResponse(201, JSON.stringify({ html_url: 'https://github.com/jamditis/rosen-frontend/issues/42' }));
  }
  return fakeResponse(404, 'unexpected url');
}

function loadAppsScript(overrides = {}) {
  const fetchLog = [];
  // Mutable script-properties store so underDailyCap_/bumpDailyCount_ behave.
  const props = { ...(overrides.props || {}) };
  const context = {
    JSON,
    Date,
    Math,
    encodeURIComponent,
    Utilities: {
      base64EncodeWebSafe(data) {
        const buf = Array.isArray(data) ? Buffer.from(data) : Buffer.from(String(data), 'utf8');
        return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      },
      computeRsaSha256Signature() { return [1, 2, 3, 4, 5]; },
      // Deterministic day key so the daily-cap tests are stable. A test can
      // override to advance the day between reserve and release.
      formatDate() { return overrides.formatDate ? overrides.formatDate() : '2026-07-02'; },
    },
    UrlFetchApp: {
      fetch(url, options) {
        fetchLog.push({ url, options });
        return (overrides.fetch || defaultFetch)(url, options);
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({
        _content: s,
        _mime: null,
        setMimeType(mt) { this._mime = mt; return this; },
        getContent() { return this._content; },
      }),
    },
    Logger: { log() {} },
  };
  context.fetchLog = fetchLog;
  context.props = props;
  vm.createContext(context);
  vm.runInContext(SRC, context);
  return context;
}

// Build the doPost event object with a JSON body (as the frontend POSTs it).
function event(payload) {
  return { postData: { contents: JSON.stringify(payload) } };
}
function out(res) {
  return JSON.parse(res.getContent());
}
const report = (over = {}) => ({ kind: 'report', intent: 'problem', whatHappened: 'the page went blank', ...over });

test('doGet reports the service is live', () => {
  const ctx = loadAppsScript();
  assert.deepStrictEqual(out(ctx.doGet()), { ok: true, service: 'rosen-report' });
});

test('doPost rejects an unrecognized kind', () => {
  const ctx = loadAppsScript();
  const res = out(ctx.doPost(event({ kind: 'nope' })));
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /Unrecognized/);
  assert.strictEqual(ctx.fetchLog.length, 0);
});

test('doPost rejects a malformed body without throwing', () => {
  const ctx = loadAppsScript();
  const res = out(ctx.doPost({ postData: { contents: '{not json' } }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(ctx.fetchLog.length, 0);
});

test('doPost silently drops a honeypot hit as success, filing nothing', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const res = out(ctx.doPost(event(report({ website: 'http://spam.example' }))));
  assert.deepStrictEqual(res, { ok: true, dropped: true });
  assert.strictEqual(ctx.fetchLog.length, 0); // no GitHub calls at all
});

test('doPost validates a missing problem description', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const res = out(ctx.doPost(event(report({ whatHappened: '   ' }))));
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /description of the problem/i);
  assert.strictEqual(ctx.fetchLog.length, 0);
});

test('doPost validates a record suggestion url', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const missing = out(ctx.doPost(event(report({ intent: 'record', whatHappened: '', url: '' }))));
  assert.strictEqual(missing.ok, false);
  const nonHttp = out(ctx.doPost(event(report({ intent: 'record', whatHappened: '', url: 'ftp://x' }))));
  assert.match(nonHttp.error, /http/i);
});

test('doPost rejects an oversized field', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const res = out(ctx.doPost(event(report({ whatHappened: 'a'.repeat(6000) }))));
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /too long/i);
});

test('doPost files a bug issue and returns its URL', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const res = out(ctx.doPost(event(report({ whatHappened: 'blank page', expected: 'a record', steps: '1. click' }))));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.issueUrl, 'https://github.com/jamditis/rosen-frontend/issues/42');

  const create = ctx.fetchLog.find((c) => c.url.endsWith('/issues'));
  assert.ok(create, 'an issue was created');
  const body = JSON.parse(create.options.payload);
  assert.deepStrictEqual(body.labels, ['bug', 'user-report']);
  assert.match(body.title, /^\[bug\] /);
  assert.match(body.body, /What happened/);
  assert.match(body.body, /Expected/);
  assert.match(body.body, /Steps to reproduce/);
  // Posts to the default owner/repo.
  assert.ok(create.url.endsWith('/repos/jamditis/rosen-frontend/issues'));
});

test('doPost files a record-suggestion issue with its own labels', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const res = out(ctx.doPost(event(report({ intent: 'record', whatHappened: '', url: 'https://pressthink.org/x', title: 'A piece' }))));
  assert.strictEqual(res.ok, true);
  const create = ctx.fetchLog.find((c) => c.url.endsWith('/issues'));
  const body = JSON.parse(create.options.payload);
  assert.deepStrictEqual(body.labels, ['record-suggestion', 'user-report']);
  assert.match(body.title, /^\[record\] /);
  assert.match(body.body, /https:\/\/pressthink\.org\/x/);
});

test('doPost neutralizes @-mentions in user text so no one is pinged', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  out(ctx.doPost(event(report({ whatHappened: 'ping @rosen-team and @jay please' }))));
  const create = ctx.fetchLog.find((c) => c.url.endsWith('/issues'));
  const body = JSON.parse(create.options.payload);
  // The raw mention must not survive; a zero-width space is inserted after @.
  assert.ok(!/@rosen-team/.test(body.body), 'raw @rosen-team must not appear');
  const zwsp = String.fromCharCode(0x200B);
  assert.ok(body.body.includes('@' + zwsp + 'rosen-team'), 'zero-width space inserted after @');
});

test('doPost enforces the global daily cap and files nothing when full', () => {
  const ctx = loadAppsScript({ props: { ...GOOD_PROPS, 'report_count_2026-07-02': '50' } });
  const res = out(ctx.doPost(event(report())));
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /lot of reports/i);
  assert.strictEqual(ctx.fetchLog.length, 0);
});

test('doPost counts a filed report against the daily cap', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  assert.strictEqual(ctx.props['report_count_2026-07-02'], undefined);
  out(ctx.doPost(event(report())));
  assert.strictEqual(ctx.props['report_count_2026-07-02'], '1');
});

test('doPost releases the reserved slot when GitHub rejects the issue', () => {
  const ctx = loadAppsScript({
    props: GOOD_PROPS,
    fetch: (url) => {
      if (url.indexOf('/access_tokens') !== -1) return fakeResponse(201, JSON.stringify({ token: 't' }));
      return fakeResponse(422, '{"message":"validation failed"}');
    },
  });
  const res = out(ctx.doPost(event(report())));
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /HTTP 422/);
  // Reserved (1) then released (0) on the rejection, so nothing net-counted.
  assert.strictEqual(ctx.props['report_count_2026-07-02'], '0');
});

test('doPost surfaces a GitHub auth failure as a soft error', () => {
  const ctx = loadAppsScript({
    props: GOOD_PROPS,
    fetch: () => fakeResponse(401, '{"message":"bad jwt"}'),
  });
  const res = out(ctx.doPost(event(report())));
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /Could not reach GitHub/i);
  // The slot reserved before auth must be released when auth fails.
  assert.strictEqual(ctx.props['report_count_2026-07-02'], '0');
});

test('doPost releases against the reserved day key across a UTC midnight rollover', () => {
  // formatDate advances from day A (at reserve) to day B (a later release), so
  // the release must target the reserved key, not recompute the current day.
  let calls = 0;
  const ctx = loadAppsScript({
    props: GOOD_PROPS,
    formatDate: () => (calls++ === 0 ? '2026-07-02' : '2026-07-03'),
    fetch: (url) => {
      if (url.indexOf('/access_tokens') !== -1) return fakeResponse(201, JSON.stringify({ token: 't' }));
      return fakeResponse(422, '{"message":"nope"}');
    },
  });
  const res = out(ctx.doPost(event(report())));
  assert.strictEqual(res.ok, false);
  // Day A was reserved (1) then released (0); the next day is never touched.
  assert.strictEqual(ctx.props['report_count_2026-07-02'], '0');
  assert.strictEqual(ctx.props['report_count_2026-07-03'], undefined);
});
