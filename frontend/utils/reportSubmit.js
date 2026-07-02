// Submission client for the branded in-archive report form (#509).
//
// The archive is a static site with no server of its own, so a reader's report
// is POSTed to the Apps Script web app (automation/apps-script/Code.gs), which
// authenticates to GitHub as a GitHub App and files the issue. The reader never
// needs a GitHub account and never leaves the site. This module owns the
// request/response contract shared with that handler and is kept DOM-free so it
// unit-tests without a browser.
//
// CORS note: Apps Script web apps answer simple cross-origin requests and set
// Access-Control-Allow-Origin: *, but they cannot answer a CORS preflight (there
// is no doOptions). So the POST MUST stay a "simple request": text/plain body,
// no custom headers. Sending application/json would trigger a preflight the
// endpoint cannot satisfy, and the submit would fail in the browser.

// Discriminator the doPost router keys off to tell a report from any other
// future POST kind. MUST match KIND_REPORT in Code.gs.
export const REPORT_KIND = 'report';

// Field length caps. These are UX hints enforced authoritatively server-side;
// keeping them here lets the form warn before a wasted round-trip.
export const LIMITS = {
  whatHappened: 5000,
  expected: 2000,
  steps: 3000,
  url: 2000,
  title: 300,
  why: 3000,
  email: 254,
};

const trim = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * A per-report idempotency key: unique per report, stable across the reader's
 * retries of it (the modal regenerates it only when it reopens). The server
 * dedupes on this key, so a retry after a slow-but-successful submit that the
 * browser aborted does not file a second issue. crypto.randomUUID is available
 * in every browser the archive targets (secure context, and localhost counts);
 * the fallback keeps tests and any non-secure context working.
 * @returns {string}
 */
export const newReportKey = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'r-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

/**
 * Build the JSON payload sent to the endpoint. `context` carries the
 * auto-captured page/version/browser so the reporter never types them.
 * `honeypot` is the hidden anti-spam field: real users leave it empty.
 * `idempotencyKey` lets the server dedupe a retried report; see newReportKey.
 * @returns {Object} the wire payload
 */
export const buildReportPayload = ({ intent, fields = {}, context = {}, honeypot = '', idempotencyKey = '' } = {}) => ({
  kind: REPORT_KIND,
  intent: intent === 'record' ? 'record' : 'problem',
  whatHappened: trim(fields.whatHappened),
  expected: trim(fields.expected),
  steps: trim(fields.steps),
  url: trim(fields.url),
  title: trim(fields.title),
  why: trim(fields.why),
  email: trim(fields.email),
  // Honeypot travels under an innocuous name a bot is likely to autofill.
  website: trim(honeypot),
  page: trim(context.page),
  version: trim(context.version),
  browser: trim(context.browser),
  idempotencyKey: trim(idempotencyKey),
});

/**
 * Client-side validation so the form can show a message before submitting.
 * The server re-validates; this only saves an obviously-bad round-trip.
 * @returns {{valid: boolean, error: string}}
 */
export const validateReport = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Something went wrong. Please try again.' };
  }
  if (payload.intent === 'record') {
    if (!payload.url) {
      return { valid: false, error: 'Please paste the link to the work you want to suggest.' };
    }
    if (!/^https?:\/\//i.test(payload.url)) {
      return { valid: false, error: 'That link needs to start with http:// or https://.' };
    }
  } else if (!payload.whatHappened) {
    return { valid: false, error: 'Please describe what happened so we can look into it.' };
  }
  if (payload.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(payload.email)) {
    return { valid: false, error: 'That email address does not look right. You can also leave it blank.' };
  }
  for (const [field, cap] of Object.entries(LIMITS)) {
    if (typeof payload[field] === 'string' && payload[field].length > cap) {
      return { valid: false, error: `That ${field === 'whatHappened' ? 'description' : field} is too long (max ${cap} characters).` };
    }
  }
  return { valid: true, error: '' };
};

/**
 * POST a report to the endpoint. Returns a plain result the modal renders:
 *   { ok: true, issueUrl }         filed; link to the created issue
 *   { ok: true, issueUrl: '' }     accepted, but the URL was not readable
 *   { ok: false, fallback: true }  no endpoint configured, or the submission was
 *                                  honeypot-dropped; caller should fall back to
 *                                  the GitHub deep link so nothing is lost
 *   { ok: false, error }           validation/network/server failure
 *
 * A missing/blank `endpoint` is not an error: it is the pre-deploy state, where
 * the form degrades to the existing GitHub issue deep link so nothing breaks
 * before the Apps Script web app is live.
 */
export const submitReport = async ({ endpoint, payload, fetchImpl, timeoutMs = 15000 } = {}) => {
  if (!endpoint) return { ok: false, fallback: true };

  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!doFetch) return { ok: false, error: 'No network available.' };

  // Abort a hung request so the form never spins forever. AbortController exists
  // in every browser the archive targets and in Node 18+ (test env).
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await doFetch(endpoint, {
      method: 'POST',
      // text/plain keeps this a simple request (no preflight); see CORS note.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined,
    });

    const raw = await res.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }

    if (!res.ok) {
      const error = (body && body.error) || 'The server could not accept your report. Please try again later.';
      return { ok: false, error };
    }
    // Success requires a positive ok:true. A 2xx with an empty or non-JSON body
    // (e.g. a misconfigured endpoint URL that returns HTML) must NOT read as
    // filed, or endpoint misconfiguration becomes silent data loss.
    if (!body || typeof body.ok === 'undefined') {
      return { ok: false, error: 'The archive sent an unexpected response. Please try again later.' };
    }
    if (body.ok === false) {
      return { ok: false, error: body.error || 'Your report could not be filed.' };
    }
    // The server drops a honeypot hit as ok:true (no dropped issue is filed) so a
    // bot gets no retry signal. A real user whose autofill populated the hidden
    // field would otherwise see a false success with nothing filed, so route them
    // to the GitHub fallback where their report survives. Bots POST without this
    // client and stay silently dropped server-side, so the anti-spam value holds.
    if (body.dropped) {
      return { ok: false, fallback: true };
    }
    return { ok: true, issueUrl: body.issueUrl || '' };
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? 'That took too long. Please check your connection and try again.'
        : 'Could not reach the archive to send your report. Please try again later.',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};
