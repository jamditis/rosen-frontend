// Tests for automation/apps-script/Code.gs (Pillar 3a curator bridge).
//
// A .gs file is plain JavaScript that runs against Google-injected globals
// (Utilities, UrlFetchApp, PropertiesService, ...). There's no local Apps
// Script runtime, so we load the source into a node:vm sandbox with faithful
// stubs and exercise the load-bearing logic:
//   - base64url segments strip "=" padding (a JWT fails to verify otherwise)
//   - the JWT carries RS256 header + iat/exp/iss claims within GitHub's cap
//   - submitRow_ maps sheet columns B/C/D + coords into workflow_dispatch
//     inputs, and writes submitted on 204 / error on a rejection / the
//     validation statuses on a bad or empty URL
//
// The base64EncodeWebSafe stub intentionally RETAINS padding (matching Apps
// Script) so dropping the strip would fail these tests. computeRsaSha256Signature
// returns fixed bytes — we test JWT assembly, not the RSA math.

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

// Minimal stand-in for an Apps Script HTTPResponse.
function fakeResponse(code, body) {
  return {
    getResponseCode: () => code,
    getContentText: () => (body === undefined ? '' : body),
  };
}

// Default fetch responder: 201 + token for the token exchange, 204 for the
// dispatch. Override per-test for failure paths.
function defaultFetch(url) {
  if (url.indexOf('/access_tokens') !== -1) {
    return fakeResponse(201, JSON.stringify({ token: 'ghs_test_token' }));
  }
  if (url.indexOf('/dispatches') !== -1) {
    return fakeResponse(204, '');
  }
  return fakeResponse(404, 'unexpected url');
}

// A fake sheet backed by a sparse cell map keyed "row,col" (1-indexed).
function fakeSheet(name = 'Queue') {
  const cells = new Map();
  const key = (r, c) => r + ',' + c;
  return {
    name,
    cells,
    getName: () => name,
    getRange(row, col, numRows, numCols) {
      return {
        getValue: () => cells.get(key(row, col)) ?? '',
        setValue: (v) => cells.set(key(row, col), v),
        setValues: (rows) => {
          // Only the 1xN writeStatus_ shape is used.
          rows[0].forEach((v, i) => cells.set(key(row, col + i), v));
        },
      };
    },
  };
}

function loadAppsScript(overrides = {}) {
  const fetchLog = [];
  const props = overrides.props || {};
  const context = {
    JSON,
    Date,
    Math,
    encodeURIComponent,
    Utilities: {
      // URL-safe alphabet, padding RETAINED — exactly like Apps Script.
      base64EncodeWebSafe(data) {
        const buf = Array.isArray(data)
          ? Buffer.from(data)
          : Buffer.from(String(data), 'utf8');
        return buf
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      },
      computeRsaSha256Signature() {
        return [1, 2, 3, 4, 5];
      },
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
      }),
    },
    Logger: { log() {} },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger() {},
      newTrigger: () => ({
        forSpreadsheet: () => ({ onEdit: () => ({ create() {} }) }),
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getId: () => 'SHEET_ABC' }),
      getActiveSheet: () => fakeSheet(),
    },
  };
  context.fetchLog = fetchLog;
  vm.createContext(context);
  vm.runInContext(SRC, context);
  return context;
}

const GOOD_PROPS = {
  GITHUB_APP_ID: '123456',
  GITHUB_APP_INSTALL_ID: '99887766',
  GITHUB_APP_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIIfake\\n-----END PRIVATE KEY-----',
};

function decodeSegment(seg) {
  // base64url -> JSON
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

test('jwtSegment_ strips base64 padding', () => {
  const ctx = loadAppsScript();
  // "any" base64-encodes to "YW55" (no padding); "a" -> "YQ==" (padded).
  assert.strictEqual(ctx.jwtSegment_('a').endsWith('='), false);
  assert.strictEqual(ctx.jwtSegment_('aa').includes('='), false);
  assert.strictEqual(ctx.jwtSegment_('any'), 'YW55');
});

test('makeAppJwt_ builds an RS256 JWT with iat/exp/iss inside the 10-min cap', () => {
  const ctx = loadAppsScript();
  const jwt = ctx.makeAppJwt_('123456', 'PEM');
  const parts = jwt.split('.');
  assert.strictEqual(parts.length, 3);
  parts.forEach((p) => assert.strictEqual(p.includes('='), false));

  const header = decodeSegment(parts[0]);
  assert.deepStrictEqual(header, { alg: 'RS256', typ: 'JWT' });

  const payload = decodeSegment(parts[1]);
  assert.strictEqual(payload.iss, '123456');
  assert.ok(payload.exp - payload.iat <= 600, 'expiry within GitHub 10-min cap');
  assert.ok(payload.iat < payload.exp);
});

test('normalizePem_ restores literal \\n to real newlines', () => {
  const ctx = loadAppsScript();
  const out = ctx.normalizePem_('a\\nb\\nc');
  assert.strictEqual(out, 'a\nb\nc\n');
});

test('getInstallationToken_ returns the token on 201', () => {
  const ctx = loadAppsScript();
  const token = ctx.getInstallationToken_('jwt', '99887766');
  assert.strictEqual(token, 'ghs_test_token');
  const call = ctx.fetchLog[0];
  assert.ok(call.url.endsWith('/app/installations/99887766/access_tokens'));
  assert.strictEqual(call.options.headers.Authorization, 'Bearer jwt');
});

test('getInstallationToken_ throws on a non-201', () => {
  const ctx = loadAppsScript({
    fetch: () => fakeResponse(401, '{"message":"bad creds"}'),
  });
  assert.throws(() => ctx.getInstallationToken_('jwt', 'x'), /HTTP 401/);
});

test('submitRow_ dispatches and writes submitted on 204', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const sheet = fakeSheet('Queue');
  sheet.getRange(5, 2).setValue('https://example.com/post');
  sheet.getRange(5, 3).setValue('A title');
  sheet.getRange(5, 4).setValue('A note');

  ctx.submitRow_(sheet, 5, 'SHEET_ABC', 'Queue');

  assert.strictEqual(sheet.getRange(5, 6).getValue(), 'submitted');
  assert.strictEqual(sheet.getRange(5, 8).getValue(), ''); // no error

  // The dispatch POST carries the mapped inputs.
  const dispatch = ctx.fetchLog.find((c) => c.url.includes('/dispatches'));
  assert.ok(dispatch, 'a dispatch call was made');
  const body = JSON.parse(dispatch.options.payload);
  assert.strictEqual(body.ref, 'main');
  assert.deepStrictEqual(body.inputs, {
    url: 'https://example.com/post',
    title: 'A title',
    notes: 'A note',
    sheet_id: 'SHEET_ABC',
    sheet_tab: 'Queue',
    sheet_row: '5',
  });
  // Routes at the default owner/repo/workflow.
  assert.ok(
    dispatch.url.endsWith(
      '/repos/jamditis/rosen-frontend/actions/workflows/submit-record.yml/dispatches',
    ),
  );
});

test('submitRow_ honours owner/repo/workflow overrides', () => {
  const ctx = loadAppsScript({
    props: {
      ...GOOD_PROPS,
      GITHUB_OWNER: 'rosen-org',
      GITHUB_REPO: 'archive',
      GITHUB_WORKFLOW_FILE: 'other.yml',
    },
  });
  const sheet = fakeSheet('Queue');
  sheet.getRange(2, 2).setValue('https://example.com/x');
  ctx.submitRow_(sheet, 2, 'SHEET_ABC', 'Queue');
  const dispatch = ctx.fetchLog.find((c) => c.url.includes('/dispatches'));
  assert.ok(
    dispatch.url.endsWith(
      '/repos/rosen-org/archive/actions/workflows/other.yml/dispatches',
    ),
  );
});

test('submitRow_ writes "no URL" when column B is empty', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const sheet = fakeSheet('Queue');
  ctx.submitRow_(sheet, 3, 'SHEET_ABC', 'Queue');
  assert.strictEqual(sheet.getRange(3, 6).getValue(), 'no URL');
  assert.strictEqual(ctx.fetchLog.length, 0); // nothing dispatched
});

test('submitRow_ writes "invalid URL" for a non-http scheme', () => {
  const ctx = loadAppsScript({ props: GOOD_PROPS });
  const sheet = fakeSheet('Queue');
  sheet.getRange(4, 2).setValue('ftp://example.com/x');
  ctx.submitRow_(sheet, 4, 'SHEET_ABC', 'Queue');
  assert.strictEqual(sheet.getRange(4, 6).getValue(), 'invalid URL');
  assert.strictEqual(ctx.fetchLog.length, 0);
});

test('submitRow_ writes error when GitHub rejects the dispatch', () => {
  const ctx = loadAppsScript({
    props: GOOD_PROPS,
    fetch: (url) => {
      if (url.includes('/access_tokens')) {
        return fakeResponse(201, JSON.stringify({ token: 't' }));
      }
      return fakeResponse(403, '{"message":"forbidden"}');
    },
  });
  const sheet = fakeSheet('Queue');
  sheet.getRange(6, 2).setValue('https://example.com/x');
  ctx.submitRow_(sheet, 6, 'SHEET_ABC', 'Queue');
  assert.strictEqual(sheet.getRange(6, 6).getValue(), 'error');
  assert.match(sheet.getRange(6, 8).getValue(), /HTTP 403/);
});

test('submitRow_ writes error when a required property is missing', () => {
  const ctx = loadAppsScript({ props: { GITHUB_APP_ID: '1' } }); // no install id / key
  const sheet = fakeSheet('Queue');
  sheet.getRange(7, 2).setValue('https://example.com/x');
  ctx.submitRow_(sheet, 7, 'SHEET_ABC', 'Queue');
  assert.strictEqual(sheet.getRange(7, 6).getValue(), 'error');
  assert.match(sheet.getRange(7, 8).getValue(), /GITHUB_APP_INSTALL_ID/);
  assert.strictEqual(ctx.fetchLog.length, 0);
});

test('submitRow_ surfaces a token-exchange failure as error', () => {
  const ctx = loadAppsScript({
    props: GOOD_PROPS,
    fetch: () => fakeResponse(401, '{"message":"bad jwt"}'),
  });
  const sheet = fakeSheet('Queue');
  sheet.getRange(8, 2).setValue('https://example.com/x');
  ctx.submitRow_(sheet, 8, 'SHEET_ABC', 'Queue');
  assert.strictEqual(sheet.getRange(8, 6).getValue(), 'error');
  assert.match(sheet.getRange(8, 8).getValue(), /GitHub auth/);
});
