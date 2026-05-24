/**
 * Rosen Archive — sheet-driven submission trigger.
 *
 * Pillar 3 authoring workflow: Jay (or Hali, or Joe) pastes a URL into the
 * queue sheet, optionally adds a title or note, then ticks the "Ready?"
 * checkbox in column E. This onEdit handler validates the row and POSTs it
 * to the submission server, which scrapes, categorizes, appends to the
 * archive CSV, regenerates JSON, and SFTPs the JSON to pressthink.org.
 *
 * Sheet layout (1-indexed columns):
 *   A  Submitted at      auto-stamped on submit
 *   B  URL               Jay types here
 *   C  Suggested title   optional, Jay types here
 *   D  Notes             optional, Jay types here
 *   E  Ready?            checkbox — Jay ticks when ready (the trigger)
 *   F  Status            written back: submitted / live / archived / error
 *   G  Record ID         written back: e.g. RECORD-00933
 *   H  Error             written back: short reason on failure
 *
 * One-time setup (run setup() from the Apps Script editor once):
 *   1. File → Project properties → Script properties → set:
 *        SUBMISSION_URL = https://rosen-submit.amditis.tech/submit
 *        SUBMISSION_TOKEN = <token matching server's SUBMISSION_AUTH_TOKEN>
 *   2. Run setup() from the editor. Authorize when prompted. This installs
 *      the onEdit trigger and verifies the script properties are present.
 */

const COL_URL = 2;          // B
const COL_TITLE = 3;        // C
const COL_NOTES = 4;        // D
const COL_READY = 5;        // E — checkbox; this is the trigger column
const COL_STATUS = 6;       // F
const COL_RECORD_ID = 7;    // G
const COL_ERROR = 8;        // H
const COL_SUBMITTED_AT = 1; // A

const STATUS_SUBMITTED = 'submitted';
const STATUS_ERROR = 'error';
const STATUS_INVALID = 'invalid URL';
const STATUS_NO_URL = 'no URL';

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
 * Read row data, POST to server, write back submitted/error status.
 * Underscore suffix marks as private to the Apps Script project.
 */
function submitRow_(sheet, row, sheetId, sheetTab) {
  const url = String(sheet.getRange(row, COL_URL).getValue() || '').trim();

  if (!url) {
    writeStatus_(sheet, row, STATUS_NO_URL, '', 'Column B is empty');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    writeStatus_(sheet, row, STATUS_INVALID, '',
                 'URL must start with http:// or https://');
    return;
  }

  const title = String(sheet.getRange(row, COL_TITLE).getValue() || '').trim();
  const notes = String(sheet.getRange(row, COL_NOTES).getValue() || '').trim();

  const props = PropertiesService.getScriptProperties();
  const serverUrl = props.getProperty('SUBMISSION_URL');
  const authToken = props.getProperty('SUBMISSION_TOKEN');

  if (!serverUrl) {
    writeStatus_(sheet, row, STATUS_ERROR, '',
                 'Script property SUBMISSION_URL not set — run setup()');
    return;
  }

  const payload = {
    url: url,
    title: title,
    notes: notes,
    sheet_id: sheetId,
    sheet_tab: sheetTab,
    sheet_row: row,
  };

  // Stamp "submitted at" before the POST so even a network failure shows a
  // recent attempt. Status starts at 'submitted'; the server will overwrite
  // it via sheets_callback after processing.
  sheet.getRange(row, COL_SUBMITTED_AT).setValue(new Date());
  writeStatus_(sheet, row, STATUS_SUBMITTED, '', '');

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['X-Auth-Token'] = authToken;

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  let response;
  try {
    response = UrlFetchApp.fetch(serverUrl, options);
  } catch (err) {
    writeStatus_(sheet, row, STATUS_ERROR, '',
                 'Network: ' + String(err).slice(0, 200));
    return;
  }

  const code = response.getResponseCode();
  const bodyText = response.getContentText();

  if (code === 200 || code === 201) {
    // Server accepted. Status will be promoted to 'live' (or 'archived') by
    // sheets_callback after the background processor runs. Leave it at
    // 'submitted' for now — the writeback is the authoritative source.
    return;
  }

  let serverError = '';
  try {
    const parsed = JSON.parse(bodyText);
    serverError = parsed.error || String(parsed).slice(0, 200);
  } catch (_e) {
    serverError = ('HTTP ' + code + ': ' + bodyText.slice(0, 200));
  }
  writeStatus_(sheet, row, STATUS_ERROR, '', serverError);
}

/**
 * Write status, record_id, and error to F/G/H of the given row in one batch.
 */
function writeStatus_(sheet, row, status, recordId, error) {
  sheet.getRange(row, COL_STATUS, 1, 3)
       .setValues([[status, recordId, error]]);
}

/**
 * Run once from the editor: installs the onEdit trigger and validates
 * script properties are present. Idempotent — re-running won't duplicate.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  const serverUrl = props.getProperty('SUBMISSION_URL');
  const authToken = props.getProperty('SUBMISSION_TOKEN');

  if (!serverUrl) {
    throw new Error(
      'Missing script property SUBMISSION_URL. Set it in ' +
      'Project Settings → Script Properties before running setup().');
  }
  if (!authToken) {
    Logger.log('Warning: SUBMISSION_TOKEN not set — server will reject ' +
               'requests if it has SUBMISSION_AUTH_TOKEN configured.');
  }

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
  Logger.log('Submission URL: ' + serverUrl);
}

/**
 * Manual resubmit for a specific row (e.g. after a network error). Run from
 * the editor with the active selection on the row to retry.
 */
function resubmitActiveRow() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  const sheetId = SpreadsheetApp.getActiveSpreadsheet().getId();
  submitRow_(sheet, row, sheetId, sheet.getName());
}
