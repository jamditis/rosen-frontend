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
