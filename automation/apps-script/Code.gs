/**
 * Rosen Archive — sheet-driven submission trigger (Pillar 3a).
 *
 * Jay (or Hali, or Joe) pastes a URL into the queue sheet, optionally adds a
 * title or note, then ticks the "Ready?" checkbox in column E. This onEdit
 * handler validates the row and dispatches a GitHub Action that scrapes,
 * categorizes, appends the archive CSV, regenerates JSON, runs the test suite,
 * pushes to main, and SFTPs the result to pressthink.org.
 *
 * Pillar 3a replaces the Pillar 3 houseofjawn Flask server: instead of POSTing
 * to a self-hosted endpoint, this script authenticates to GitHub as a GitHub
 * App and fires the `submit-record.yml` workflow directly. Nothing on Joe's
 * machines stays in the critical path, so the flow survives him stepping back.
 * Design: docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md
 *
 * Auth flow per submit (no token caching — ~10 submits/day is far inside the
 * GitHub rate limit):
 *   1. Mint an RS256 JWT signed with the App private key (10-min expiry).
 *   2. Exchange it for a 1-hour installation token.
 *   3. POST workflow_dispatch with that token.
 * The Action itself writes processing/live/error back to columns F/G/H via the
 * service account, so this script's job ends at 'submitted'.
 *
 * Sheet layout (1-indexed columns) — unchanged from Pillar 3:
 *   A  Submitted at      auto-stamped on submit
 *   B  URL               Jay types here
 *   C  Suggested title   optional, Jay types here
 *   D  Notes             optional, Jay types here — PUBLIC (see note below)
 *   E  Ready?            checkbox — Jay ticks when ready (the trigger)
 *   F  Status            written back: submitted / processing / live / archived / error
 *   G  Record ID         written back: e.g. RECORD-00933
 *   H  Error             written back: short reason on failure
 *
 * The notes column ends up in the workflow_dispatch inputs, which are visible
 * in the PUBLIC repo's Action run history. Never paste a story tip, contact
 * name, or unpublished source there. See JAY_ADDING_RECORDS.md.
 *
 * One-time setup (run setup() from the Apps Script editor once):
 *   1. Project Settings → Script Properties → set:
 *        GITHUB_APP_ID            numeric App ID (or the App's Client ID)
 *        GITHUB_APP_INSTALL_ID    installation id for the rosen-frontend repo
 *        GITHUB_APP_PRIVATE_KEY   PEM private key, PKCS#8 format (see SETUP.md —
 *                                 GitHub hands you PKCS#1; you MUST convert it)
 *      Optional (default to the current repo; override only on handoff to a
 *      transferred repo or a new org):
 *        GITHUB_OWNER             default 'jamditis'
 *        GITHUB_REPO              default 'rosen-frontend'
 *        GITHUB_WORKFLOW_FILE     default 'submit-record.yml'
 *   2. Run setup() from the editor. Authorize when prompted (the script needs
 *      script.external_request for the GitHub POSTs and spreadsheets.currentonly
 *      to write status back). This installs the onEdit trigger.
 */

const COL_SUBMITTED_AT = 1; // A
const COL_URL = 2;          // B
const COL_TITLE = 3;        // C
const COL_NOTES = 4;        // D
const COL_READY = 5;        // E — checkbox; this is the trigger column
const COL_STATUS = 6;       // F
const COL_RECORD_ID = 7;    // G
const COL_ERROR = 8;        // H

const STATUS_SUBMITTED = 'submitted';
const STATUS_ERROR = 'error';
const STATUS_INVALID = 'invalid URL';
const STATUS_NO_URL = 'no URL';

// Defaults for the optional repo-routing properties. Keeping owner/repo/workflow
// configurable means the handoff (repo transfer to Jay/Hali or a new org) is a
// script-property edit, not a code edit.
const DEFAULT_OWNER = 'jamditis';
const DEFAULT_REPO = 'rosen-frontend';
const DEFAULT_WORKFLOW_FILE = 'submit-record.yml';

const GITHUB_API = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';

/**
 * Installable onEdit trigger. Set up via setup().
 * Simple onEdit triggers can't make UrlFetchApp calls, so this MUST be
 * installed via ScriptApp.newTrigger to get the full auth scope.
 */
function onEditTrigger(e) {
  if (!e || !e.range) return;
  const range = e.range;

  // Only react to checkbox flips in column E.
  if (range.getColumn() !== COL_READY) return;
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;

  const newValue = e.value;
  // Checkbox ticked TRUE — booleans serialize to 'TRUE' / 'FALSE' as e.value.
  // Anything else (untick, paste, edit) is a no-op.
  if (newValue !== 'TRUE' && newValue !== true) return;

  const sheet = range.getSheet();
  const row = range.getRow();
  const sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const sheetTab = sheet.getName();

  submitRow_(sheet, row, sheetId, sheetTab);
}

/**
 * Read row data, dispatch the GitHub Action, write back submitted/error status.
 * Underscore suffix marks as private to the Apps Script project.
 */
function submitRow_(sheet, row, sheetId, sheetTab) {
  const url = String(sheet.getRange(row, COL_URL).getValue() || '').trim();

  if (!url) {
    writeStatus_(sheet, row, STATUS_NO_URL, '', 'Column B is empty');
    return;
  }
  // Defense in depth: the workflow re-validates the scheme too.
  if (!/^https?:\/\//i.test(url)) {
    writeStatus_(sheet, row, STATUS_INVALID, '',
                 'URL must start with http:// or https://');
    return;
  }

  const title = String(sheet.getRange(row, COL_TITLE).getValue() || '').trim();
  const notes = String(sheet.getRange(row, COL_NOTES).getValue() || '').trim();

  let config;
  try {
    config = readConfig_();
  } catch (err) {
    writeStatus_(sheet, row, STATUS_ERROR, '', String(err.message || err).slice(0, 300));
    return;
  }

  // Stamp "submitted at" before the dispatch so even a failed attempt leaves a
  // recent timestamp. Status is written after GitHub confirms the dispatch.
  sheet.getRange(row, COL_SUBMITTED_AT).setValue(new Date());

  const inputs = {
    url: url,
    title: title,
    notes: notes,
    sheet_id: sheetId,
    sheet_tab: sheetTab,
    sheet_row: String(row),
  };

  let token;
  try {
    const jwt = makeAppJwt_(config.appId, config.privateKey);
    token = getInstallationToken_(jwt, config.installId);
  } catch (err) {
    writeStatus_(sheet, row, STATUS_ERROR, '',
                 'GitHub auth: ' + String(err.message || err).slice(0, 280));
    return;
  }

  let response;
  try {
    response = dispatchWorkflow_(token, config, inputs);
  } catch (err) {
    writeStatus_(sheet, row, STATUS_ERROR, '',
                 'Could not reach GitHub: ' + String(err.message || err).slice(0, 270));
    return;
  }

  const code = response.getResponseCode();
  // workflow_dispatch returns 204 No Content on success. (A 2026 opt-in flag
  // can make it 200; we don't set it, but accept 200 defensively.)
  if (code === 204 || code === 200) {
    // GitHub accepted the dispatch. The Action promotes this to processing /
    // live / archived / error via the service-account writeback.
    writeStatus_(sheet, row, STATUS_SUBMITTED, '', '');
    return;
  }

  writeStatus_(sheet, row, STATUS_ERROR, '',
               'GitHub rejected the dispatch (HTTP ' + code + '): ' +
               response.getContentText().slice(0, 240));
}

/**
 * Read and validate the script properties needed to talk to GitHub.
 * Throws with an operator-readable message if a required property is missing.
 */
function readConfig_() {
  const props = PropertiesService.getScriptProperties();
  const appId = String(props.getProperty('GITHUB_APP_ID') || '').trim();
  const installId = String(props.getProperty('GITHUB_APP_INSTALL_ID') || '').trim();
  const privateKeyRaw = props.getProperty('GITHUB_APP_PRIVATE_KEY') || '';

  if (!appId) {
    throw new Error('Script property GITHUB_APP_ID not set — run setup() after configuring it.');
  }
  if (!installId) {
    throw new Error('Script property GITHUB_APP_INSTALL_ID not set — run setup() after configuring it.');
  }
  if (!privateKeyRaw.trim()) {
    throw new Error('Script property GITHUB_APP_PRIVATE_KEY not set — run setup() after configuring it.');
  }

  return {
    appId: appId,
    installId: installId,
    privateKey: normalizePem_(privateKeyRaw),
    owner: String(props.getProperty('GITHUB_OWNER') || DEFAULT_OWNER).trim(),
    repo: String(props.getProperty('GITHUB_REPO') || DEFAULT_REPO).trim(),
    workflowFile: String(props.getProperty('GITHUB_WORKFLOW_FILE') || DEFAULT_WORKFLOW_FILE).trim(),
  };
}

/**
 * Some Script Properties editors collapse a pasted PEM onto one line with
 * literal "\n" sequences. Restore real newlines so the PEM parses.
 */
function normalizePem_(raw) {
  const key = raw.indexOf('\\n') >= 0 ? raw.replace(/\\n/g, '\n') : raw;
  return key.trim() + '\n';
}

/**
 * Build an RS256 JWT for the GitHub App. Signs the unpadded base64url
 * `header.payload` with the App private key (which MUST be PKCS#8 — Apps
 * Script's computeRsaSha256Signature rejects GitHub's default PKCS#1 PEM).
 */
function makeAppJwt_(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60,   // backdate for clock drift
    exp: now + 540,  // 9 min — inside GitHub's 10-min cap
    iss: appId,      // App ID or Client ID; GitHub accepts either
  };

  const signingInput = jwtSegment_(JSON.stringify(header)) + '.' +
                       jwtSegment_(JSON.stringify(payload));
  const signature = Utilities.computeRsaSha256Signature(signingInput, privateKeyPem);
  return signingInput + '.' + jwtSegment_(signature);
}

/**
 * base64url-encode a String or Byte[]. base64EncodeWebSafe uses the URL-safe
 * alphabet but keeps "=" padding, which is invalid in a JWT — strip it.
 */
function jwtSegment_(data) {
  return Utilities.base64EncodeWebSafe(data).replace(/=+$/, '');
}

/**
 * Exchange an App JWT for a 1-hour installation access token.
 */
function getInstallationToken_(jwt, installId) {
  const url = GITHUB_API + '/app/installations/' +
              encodeURIComponent(installId) + '/access_tokens';
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      Authorization: 'Bearer ' + jwt,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code !== 201) {
    throw new Error('token exchange failed (HTTP ' + code + '): ' +
                    response.getContentText().slice(0, 200));
  }
  const token = JSON.parse(response.getContentText()).token;
  if (!token) {
    throw new Error('token exchange returned no token');
  }
  return token;
}

/**
 * Fire submit-record.yml via the workflow_dispatch REST endpoint. Returns the
 * HTTPResponse so the caller can branch on the status code.
 */
function dispatchWorkflow_(token, config, inputs) {
  const url = GITHUB_API + '/repos/' + config.owner + '/' + config.repo +
              '/actions/workflows/' + encodeURIComponent(config.workflowFile) +
              '/dispatches';
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    payload: JSON.stringify({ ref: 'main', inputs: inputs }),
    muteHttpExceptions: true,
  });
}

/**
 * Write status, record_id, and error to F/G/H of the given row in one batch.
 */
function writeStatus_(sheet, row, status, recordId, error) {
  sheet.getRange(row, COL_STATUS, 1, 3)
       .setValues([[status, recordId, error]]);
}

// ===========================================================================
// Web app: branded in-archive report form (#509)
//
// The static archive has no server of its own, so its "Report a bug" / "Suggest
// a record" form POSTs a JSON report to this web app, which files a GitHub issue
// via the SAME GitHub App used for record submissions. The reader needs no
// GitHub account and never leaves pressthink.org.
//
// Deploy: Editor -> Deploy -> New deployment -> Web app, "Execute as: me",
// "Who has access: Anyone". Paste the /exec URL into frontend REPORT_CONFIG.
// The GitHub App must have Issues: write (Actions-only is not enough to create
// issues). Grant it in the App's permissions, then re-authorize the install.
//
// Browser CORS: Apps Script answers a simple cross-origin POST (text/plain body,
// no custom headers) and sets Access-Control-Allow-Origin: *, but it cannot
// answer a preflight. The frontend therefore POSTs text/plain: do not require
// a JSON content type here.
//
// Rate limiting: Apps Script does not expose the caller IP, so per-IP limiting
// is impossible in this ingress. Defense is a honeypot plus a GLOBAL per-day
// issue cap (bounds total abuse volume, not per-sender). If that proves too
// weak, move the endpoint to a Cloudflare Worker or add Turnstile.
// ===========================================================================

const KIND_REPORT = 'report';

// Authoritative field caps (mirrors frontend LIMITS in reportSubmit.js).
const REPORT_LIMITS = {
  whatHappened: 5000,
  expected: 2000,
  steps: 3000,
  url: 2000,
  title: 300,
  why: 3000,
  email: 254,
};

// Caps for the auto-captured context fields. These are not user-typed, so
// validateReportPayload_ does not gate them, but a direct POST can forge them.
// Bound them before they reach an issue body so a forged request cannot create
// an oversized issue.
const REPORT_CONTEXT_LIMITS = {
  page: 2048,
  version: 64,
  browser: 512,
};

// Global cap on issues this web app will file per UTC day.
const REPORT_DAILY_CAP = 50;

/**
 * Health check: GET the /exec URL to confirm the web app is deployed and live.
 */
function doGet() {
  return jsonOutput_({ ok: true, service: 'rosen-report' });
}

/**
 * Web-app POST entry for reader reports. Always returns HTTP 200 with a JSON
 * body (Apps Script cannot set other status codes); success/failure is carried
 * in `ok`, which the frontend keys off.
 */
function doPost(e) {
  try {
    const payload = parseJsonBody_(e);
    if (!payload || payload.kind !== KIND_REPORT) {
      return jsonOutput_({ ok: false, error: 'Unrecognized request.' });
    }
    return handleReport_(payload);
  } catch (err) {
    // Log server-side (visible in the Apps Script execution log) without
    // leaking internals to the caller.
    Logger.log('report doPost error: ' + (err && err.stack ? err.stack : err));
    return jsonOutput_({ ok: false, error: 'Server error.' });
  }
}

function parseJsonBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return null;
  }
}

function handleReport_(payload) {
  // Honeypot: a real form never fills `website`. Return success without filing
  // so a bot gets no signal to retry, and no issue is created.
  if (reportField_(payload.website) !== '') {
    return jsonOutput_({ ok: true, dropped: true });
  }

  const intent = payload.intent === 'record' ? 'record' : 'problem';

  const check = validateReportPayload_(payload, intent);
  if (!check.valid) {
    return jsonOutput_({ ok: false, error: check.error });
  }

  // Dedupe a retried report before spending a daily slot or a GitHub round-trip.
  // Sanitize the client-supplied key to safe characters and a bounded length so
  // a forged value cannot bloat or collide the cache key.
  const idemKey = reportField_(payload.idempotencyKey).replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
  const idem = reserveIdempotencyKey_(idemKey);
  if (idem.status === 'duplicate') {
    return jsonOutput_({ ok: true, issueUrl: idem.url, duplicate: true });
  }
  if (idem.status === 'pending') {
    return jsonOutput_({ ok: false, error: 'This report is already being filed. Please check GitHub in a moment.' });
  }
  if (idem.status === 'unavailable') {
    return jsonOutput_({ ok: false, error: 'The archive is busy right now. Please try again in a moment.' });
  }

  // Atomically reserve a daily slot BEFORE filing. Reading the counter and
  // filing separately would let a concurrent burst near the cap each pass a
  // stale read and overflow it: the exact bursty case the cap defends against.
  // The reserved slot is released on any failure path below.
  const reservedKey = reserveDailySlot_();
  if (!reservedKey) {
    releaseIdempotencyKey_(idemKey);
    return jsonOutput_({
      ok: false,
      error: 'The archive is receiving a lot of reports right now. Please try again later.',
    });
  }

  let config;
  let token;
  try {
    config = readConfig_();
    const jwt = makeAppJwt_(config.appId, config.privateKey);
    token = getInstallationToken_(jwt, config.installId);
  } catch (err) {
    releaseDailySlot_(reservedKey);
    releaseIdempotencyKey_(idemKey);
    Logger.log('report auth error: ' + (err && err.message ? err.message : err));
    return jsonOutput_({ ok: false, error: 'Could not reach GitHub. Please try again later.' });
  }

  const issue = buildIssueFromReport_(payload, intent);

  let response;
  try {
    response = createIssue_(token, config, issue);
  } catch (err) {
    releaseDailySlot_(reservedKey);
    releaseIdempotencyKey_(idemKey);
    Logger.log('report createIssue error: ' + (err && err.message ? err.message : err));
    return jsonOutput_({ ok: false, error: 'Could not reach GitHub. Please try again later.' });
  }

  if (response.getResponseCode() === 201) {
    // Slot already counted at reservation; nothing more to do on success.
    let issueUrl = '';
    try {
      issueUrl = JSON.parse(response.getContentText()).html_url || '';
    } catch (err) {
      issueUrl = '';
    }
    // Record the filed url so a retry with the same key returns it, not a dup.
    finishIdempotencyKey_(idemKey, issueUrl);
    return jsonOutput_({ ok: true, issueUrl: issueUrl });
  }

  releaseDailySlot_(reservedKey);
  releaseIdempotencyKey_(idemKey);
  Logger.log('report issue rejected (HTTP ' + response.getResponseCode() + '): ' +
             response.getContentText().slice(0, 240));
  return jsonOutput_({
    ok: false,
    error: 'GitHub could not accept the report (HTTP ' + response.getResponseCode() + ').',
  });
}

function reportField_(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function validateReportPayload_(payload, intent) {
  if (intent === 'record') {
    const url = reportField_(payload.url);
    if (!url) return { valid: false, error: 'A link to the work is required.' };
    if (!/^https?:\/\//i.test(url)) {
      return { valid: false, error: 'The link must start with http:// or https://.' };
    }
  } else if (!reportField_(payload.whatHappened)) {
    return { valid: false, error: 'A description of the problem is required.' };
  }

  const email = reportField_(payload.email);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { valid: false, error: 'That email address is not valid.' };
  }

  const names = Object.keys(REPORT_LIMITS);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (reportField_(payload[name]).length > REPORT_LIMITS[name]) {
      return { valid: false, error: 'One of the fields is too long.' };
    }
  }
  return { valid: true, error: '' };
}

/**
 * Blunt @-mention so a report body cannot ping a GitHub user or team. Issue
 * bodies are markdown and GitHub strips raw HTML, so this is the practical
 * abuse vector; a zero-width space after @ keeps the text readable while
 * breaking mention parsing.
 */
function neutralizeMentions_(text) {
  // Insert a zero-width space after each @ so GitHub does not parse it as a
  // mention. Built with String.fromCharCode so no invisible character sits
  // in source (it would be unreadable in review and easy to strip).
  const zwsp = String.fromCharCode(0x200B);
  return String(text || '').replace(/@/g, '@' + zwsp);
}

function truncateReport_(text, max) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Render a structured or auto-captured field (URL, email, page, version,
 * browser) as an inline code span. neutralizeMentions_ is wrong for these: it
 * would corrupt a legitimate handle URL like https://host/@user, which the
 * curator has to click or copy. A code span is inert to @-mentions and keeps
 * the value byte-exact. Strip backticks and newlines first so the value cannot
 * break out of the span, and cap the length so a forged POST cannot bloat the
 * issue. Returns '' for an empty field so the caller can omit the line.
 */
function reportInline_(text, max) {
  const s = String(text || '').replace(/[`\r\n]+/g, ' ').trim();
  if (!s) return '';
  return '`' + truncateReport_(s, max) + '`';
}

function reportBlockquote_(text) {
  return String(text || '')
    .split('\n')
    .map(function (line) { return '> ' + line; })
    .join('\n');
}

function buildIssueFromReport_(payload, intent) {
  const lines = [];
  let labels;
  let title;

  // Issue titles do not render markdown or @-mentions, so they need truncation
  // but not mention-blunting: blunting only corrupts a URL-derived title.
  if (intent === 'record') {
    labels = ['record-suggestion', 'user-report'];
    // First line only: a multiline title would look broken in the title bar.
    const recTitle = reportField_(payload.title).split('\n')[0] || reportField_(payload.url);
    title = '[record] ' + truncateReport_(recTitle, 120);
    lines.push('Suggested by a reader via the in-archive form.', '');
    // The link is structured: keep it exact and copy-safe, do not blunt its @.
    lines.push('**Link:** ' + reportInline_(reportField_(payload.url), REPORT_LIMITS.url));
    if (reportField_(payload.title)) {
      // Inline-code the suggested title too: a forged multiline or markdown-heavy
      // title must not inject a heading, quote, or fake field into the body.
      lines.push('**Suggested title:** ' + reportInline_(reportField_(payload.title), REPORT_LIMITS.title));
    }
    if (reportField_(payload.why)) {
      lines.push('', '**Why it belongs:**', '', reportBlockquote_(neutralizeMentions_(reportField_(payload.why))));
    }
  } else {
    labels = ['bug', 'user-report'];
    const firstLine = reportField_(payload.whatHappened).split('\n')[0];
    title = '[bug] ' + truncateReport_(firstLine, 120);
    lines.push('Reported by a reader via the in-archive form.', '');
    lines.push('**What happened:**', '', reportBlockquote_(neutralizeMentions_(reportField_(payload.whatHappened))));
    if (reportField_(payload.expected)) {
      lines.push('', '**Expected:**', '', reportBlockquote_(neutralizeMentions_(reportField_(payload.expected))));
    }
    if (reportField_(payload.steps)) {
      lines.push('', '**Steps to reproduce:**', '', reportBlockquote_(neutralizeMentions_(reportField_(payload.steps))));
    }
  }

  // Structured and auto-captured context: rendered as inline code so URLs and
  // emails stay copy-safe and mention-inert, and forged context is length-capped.
  lines.push('', '---', '');
  if (reportField_(payload.email)) {
    lines.push('**Contact:** ' + reportInline_(reportField_(payload.email), REPORT_LIMITS.email));
  }
  lines.push('**Page:** ' + reportInline_(reportField_(payload.page), REPORT_CONTEXT_LIMITS.page));
  lines.push('**Archive version:** ' + reportInline_(reportField_(payload.version), REPORT_CONTEXT_LIMITS.version));
  // The browser is disclosed only on the bug form, so attach it only to bug
  // reports; record suggestions must not publish it.
  if (intent !== 'record') {
    lines.push('**Browser:** ' + reportInline_(reportField_(payload.browser), REPORT_CONTEXT_LIMITS.browser));
  }

  return { title: title, body: lines.join('\n'), labels: labels };
}

/**
 * Create a GitHub issue via the REST API. Returns the HTTPResponse so the
 * caller can branch on the status code (201 on success).
 */
function createIssue_(token, config, issue) {
  const url = GITHUB_API + '/repos/' + config.owner + '/' + config.repo + '/issues';
  return UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
    payload: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels }),
    muteHttpExceptions: true,
  });
}

function reportDailyKey_() {
  return 'report_count_' + Utilities.formatDate(new Date(), 'Etc/UTC', 'yyyy-MM-dd');
}

/**
 * Atomically check-and-reserve one slot in today's counter under a script lock.
 * Returns the reserved day key (truthy) if a slot was taken (caller may file),
 * or null if the cap is full or the lock could not be acquired. Failing closed
 * on a lock timeout keeps the cap from being bypassed under the contention it
 * exists to bound. The returned key MUST be passed to releaseDailySlot_ so a
 * rollback near UTC midnight targets the day that was actually reserved.
 */
function reserveDailySlot_() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (err) {
    return null;
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const key = reportDailyKey_();
    const n = parseInt(props.getProperty(key) || '0', 10);
    if (n >= REPORT_DAILY_CAP) return null;
    props.setProperty(key, String(n + 1));
    return key;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Give back a slot reserved under `key` when filing fails after reserving.
 * Decrements the SAME day key that reserveDailySlot_ returned, so a failure that
 * crosses UTC midnight does not decrement the new day. Best-effort: a missed
 * release only tightens the cap slightly, never over-relaxes it.
 */
function releaseDailySlot_(key) {
  if (!key) return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (err) {
    return;
  }
  try {
    const props = PropertiesService.getScriptProperties();
    const n = parseInt(props.getProperty(key) || '0', 10);
    if (n > 0) props.setProperty(key, String(n - 1));
  } finally {
    lock.releaseLock();
  }
}

// Idempotency: a report carries a client-generated key that is stable across
// the reader's retries of one report and unique per report. If the browser
// aborts a slow-but-successful request and the reader retries, both requests
// reach here with the same key; this dedupes them so only one issue is filed.
// CacheService (not PropertiesService) because these keys must self-expire and
// never need manual cleanup. 6h is comfortably longer than any retry window.
var REPORT_IDEM_TTL_SECONDS = 21600;
// The pending marker must outlive the longest possible filing, or a retry could
// re-reserve a key whose first request is still running and file a duplicate.
// Apps Script web-app executions are capped at ~6 minutes, so 10 minutes leaves
// margin; a filing that dies at the cap without finishing frees the key by TTL.
var REPORT_IDEM_PENDING_TTL_SECONDS = 600;
var REPORT_IDEM_PENDING = 'pending';

function reportIdemCacheKey_(key) {
  return 'report_idem_' + key;
}

/**
 * Atomically reserve an idempotency key for filing, under the same short script
 * lock the daily counter uses so the check-and-mark cannot race a concurrent
 * same-key retry. Returns one of:
 *   { status: 'reserved' }        caller should file, then finish/release the key
 *   { status: 'duplicate', url }  already filed; return this url, do not file
 *   { status: 'pending' }         a concurrent request is filing it right now
 *   { status: 'unavailable' }     lock contention; caller should fail closed
 * An empty key (a legacy client) cannot be deduped, so it always reserves.
 */
function reserveIdempotencyKey_(key) {
  if (!key) return { status: 'reserved' };
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (err) {
    return { status: 'unavailable' };
  }
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = reportIdemCacheKey_(key);
    const existing = cache.get(cacheKey);
    // Absent (null) means unreserved. Any stored value that is not the pending
    // marker means already filed, INCLUDING an empty string: a 201 whose body
    // had no parseable url still filed the issue, so a retry must dedupe on it
    // rather than treat '' as unreserved and file a second time.
    if (existing != null && existing !== REPORT_IDEM_PENDING) {
      return { status: 'duplicate', url: existing };
    }
    if (existing === REPORT_IDEM_PENDING) {
      return { status: 'pending' };
    }
    // A failure path clears this eagerly (releaseIdempotencyKey_); the TTL is the
    // backstop for a filing killed at the execution cap, so it must exceed that
    // cap or a still-running filing could lose its marker to a retry.
    cache.put(cacheKey, REPORT_IDEM_PENDING, REPORT_IDEM_PENDING_TTL_SECONDS);
    return { status: 'reserved' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Record the filed issue url against the key so a later retry returns it instead
 * of filing again. Longer TTL than the pending marker.
 */
function finishIdempotencyKey_(key, url) {
  if (!key) return;
  CacheService.getScriptCache().put(reportIdemCacheKey_(key), url || '', REPORT_IDEM_TTL_SECONDS);
}

/**
 * Clear the pending marker when filing fails after reserving, so the reader can
 * retry instead of being blocked by a key that will never resolve.
 */
function releaseIdempotencyKey_(key) {
  if (!key) return;
  CacheService.getScriptCache().remove(reportIdemCacheKey_(key));
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once from the editor: installs the onEdit trigger and validates the
 * required script properties are present. Idempotent — re-running won't
 * duplicate the trigger.
 */
function setup() {
  // readConfig_ throws a clear message if a required property is missing.
  const config = readConfig_();

  // Remove any prior onEdit trigger we installed, so re-running setup is safe.
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log('Installed onEdit trigger for spreadsheet ' +
             SpreadsheetApp.getActiveSpreadsheet().getId());
  Logger.log('Dispatch target: ' + config.owner + '/' + config.repo +
             ' workflow ' + config.workflowFile);
}

/**
 * Sanity check from the editor: mints a JWT and exchanges it for an
 * installation token WITHOUT dispatching anything. Run this after setup() to
 * confirm the App credentials work before relying on a live checkbox tick.
 * Logs success or the GitHub error — never touches the sheet.
 */
function verifyAuth() {
  const config = readConfig_();
  const jwt = makeAppJwt_(config.appId, config.privateKey);
  getInstallationToken_(jwt, config.installId);
  Logger.log('Auth OK — minted a JWT and got an installation token for ' +
             config.owner + '/' + config.repo + '.');
}

/**
 * Manual resubmit for a specific row (e.g. after a transient GitHub error).
 * Run from the editor with the active selection on the row to retry.
 */
function resubmitActiveRow() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  const sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  submitRow_(sheet, row, sheetId, sheet.getName());
}
