// Tests for frontend/utils/reportSubmit.js: the branded report form's
// submission client (#509). Pure logic, no DOM: payload shape, client-side
// validation, and the fetch contract (text/plain simple request, result
// mapping, endpoint-empty fallback, and network/abort handling).

import test from 'node:test';
import assert from 'node:assert';
import {
  buildReportPayload,
  validateReport,
  submitReport,
  newReportKey,
  REPORT_KIND,
  LIMITS,
} from '../frontend/utils/reportSubmit.js';

test('buildReportPayload normalizes intent, trims, and carries the honeypot + context', () => {
  const p = buildReportPayload({
    intent: 'gibberish', // anything but "record" collapses to "problem"
    fields: { whatHappened: '  broke  ', email: ' me@x.io ' },
    context: { page: ' https://p/ ', version: '3.4.9', browser: ' UA ' },
    honeypot: '  spam  ',
  });
  assert.strictEqual(p.kind, REPORT_KIND);
  assert.strictEqual(p.intent, 'problem');
  assert.strictEqual(p.whatHappened, 'broke');
  assert.strictEqual(p.email, 'me@x.io');
  assert.strictEqual(p.website, 'spam'); // honeypot travels as `website`
  assert.strictEqual(p.page, 'https://p/');
  assert.strictEqual(p.browser, 'UA');
});

test('buildReportPayload keeps a record intent', () => {
  const p = buildReportPayload({ intent: 'record', fields: { url: 'https://x' } });
  assert.strictEqual(p.intent, 'record');
  assert.strictEqual(p.url, 'https://x');
});

test('buildReportPayload carries the idempotency key (trimmed)', () => {
  const p = buildReportPayload({ intent: 'problem', fields: { whatHappened: 'x' }, idempotencyKey: '  key-123  ' });
  assert.strictEqual(p.idempotencyKey, 'key-123');
});

test('newReportKey returns a non-empty string that differs per call', () => {
  // Stable within one report (reused across retries so the server dedupes) but
  // unique per report, so two fresh keys must differ.
  const a = newReportKey();
  const b = newReportKey();
  assert.strictEqual(typeof a, 'string');
  assert.ok(a.length >= 8);
  assert.notStrictEqual(a, b);
});

test('validateReport requires a problem description', () => {
  const r = validateReport(buildReportPayload({ intent: 'problem', fields: {} }));
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /what happened/i);
});

test('validateReport requires an http(s) link for a record suggestion', () => {
  assert.strictEqual(validateReport(buildReportPayload({ intent: 'record', fields: {} })).valid, false);
  const nonHttp = validateReport(buildReportPayload({ intent: 'record', fields: { url: 'ftp://x' } }));
  assert.strictEqual(nonHttp.valid, false);
  assert.match(nonHttp.error, /http/i);
  assert.strictEqual(validateReport(buildReportPayload({ intent: 'record', fields: { url: 'https://ok' } })).valid, true);
});

test('validateReport rejects a malformed email but allows blank', () => {
  const bad = validateReport(buildReportPayload({ intent: 'problem', fields: { whatHappened: 'x', email: 'nope' } }));
  assert.strictEqual(bad.valid, false);
  const blank = validateReport(buildReportPayload({ intent: 'problem', fields: { whatHappened: 'x' } }));
  assert.strictEqual(blank.valid, true);
});

test('validateReport enforces the length caps', () => {
  const long = 'a'.repeat(LIMITS.whatHappened + 1);
  const r = validateReport(buildReportPayload({ intent: 'problem', fields: { whatHappened: long } }));
  assert.strictEqual(r.valid, false);
  assert.match(r.error, /too long/i);
});

test('submitReport returns a fallback signal when no endpoint is configured', async () => {
  const r = await submitReport({ endpoint: '', payload: {}, fetchImpl: async () => { throw new Error('should not fetch'); } });
  assert.deepStrictEqual(r, { ok: false, fallback: true });
});

test('submitReport POSTs a text/plain simple request and returns the issue URL', async () => {
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, text: async () => JSON.stringify({ ok: true, issueUrl: 'https://gh/issues/7' }) };
  };
  const payload = buildReportPayload({ intent: 'problem', fields: { whatHappened: 'x' } });
  const r = await submitReport({ endpoint: 'https://exec', payload, fetchImpl });
  assert.deepStrictEqual(r, { ok: true, issueUrl: 'https://gh/issues/7' });
  assert.strictEqual(captured.url, 'https://exec');
  assert.strictEqual(captured.opts.method, 'POST');
  // text/plain avoids a CORS preflight Apps Script cannot answer.
  assert.match(captured.opts.headers['Content-Type'], /text\/plain/);
  assert.strictEqual(JSON.parse(captured.opts.body).whatHappened, 'x');
});

test('submitReport surfaces a server ok:false as an error', async () => {
  const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify({ ok: false, error: 'nope' }) });
  const r = await submitReport({ endpoint: 'https://exec', payload: {}, fetchImpl });
  assert.deepStrictEqual(r, { ok: false, error: 'nope' });
});

test('submitReport routes a honeypot drop to the fallback, not a false success', async () => {
  // The server drops a honeypot hit as { ok: true, dropped: true } so a bot gets
  // no retry signal. A real user whose autofill tripped the hidden field must
  // not see a false success with nothing filed: route them to the GitHub
  // fallback, where their report is preserved. Bots POST without this client and
  // stay silently dropped server-side.
  const fetchImpl = async () => ({ ok: true, text: async () => JSON.stringify({ ok: true, dropped: true }) });
  const r = await submitReport({ endpoint: 'https://exec', payload: {}, fetchImpl });
  assert.deepStrictEqual(r, { ok: false, fallback: true });
});

test('submitReport treats a non-2xx as an error', async () => {
  const fetchImpl = async () => ({ ok: false, text: async () => JSON.stringify({ error: 'boom' }) });
  const r = await submitReport({ endpoint: 'https://exec', payload: {}, fetchImpl });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'boom');
});

test('submitReport maps a network failure to a friendly error', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const r = await submitReport({ endpoint: 'https://exec', payload: {}, fetchImpl });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /reach the archive/i);
});

test('submitReport maps an abort/timeout to a distinct message', async () => {
  const fetchImpl = async () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    throw e;
  };
  const r = await submitReport({ endpoint: 'https://exec', payload: {}, fetchImpl, timeoutMs: 5 });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /too long/i);
});

test('submitReport treats an opaque/non-JSON 2xx as a failure, not a silent success', async () => {
  // A misconfigured endpoint that returns HTML/empty with a 200 must not read as
  // filed. That would turn misconfiguration into silent data loss.
  const fetchImpl = async () => ({ ok: true, text: async () => '<html>oops</html>' });
  const r = await submitReport({ endpoint: 'https://exec', payload: {}, fetchImpl });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /unexpected response/i);
});
