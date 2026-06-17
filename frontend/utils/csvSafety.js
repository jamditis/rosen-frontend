// CSV-cell escaping for the in-browser data export (#289).
//
// exportAsCSV builds a downloadable CSV from archive fields (title, summary,
// url, publication, author) that originate in scraped page content and curator
// submissions -- both untrusted. A cell whose first character is a spreadsheet
// formula trigger is executed when the CSV is opened in Excel/Sheets/Numbers,
// enabling =HYPERLINK(...) data exfiltration or =cmd|'/c ...'!A1 DDE attacks.
//
// The trigger set mirrors the canonical server-side neutraliser
// (backend/src/rosen_scraper/csv_safety.py CSV_INJECTION_PREFIXES) so the
// in-browser export and the canonical CSV neutralise the same characters:
// the four OWASP formula prefixes plus the leading control characters
// (tab/CR/LF) that importers strip or treat as formula starts.

const CSV_FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r', '\n']);

/**
 * Escape one value for a CSV cell: neutralise formula injection, then apply
 * RFC 4180 quoting.
 *
 * A leading formula trigger is prefixed with a single quote so spreadsheets
 * treat the cell as text. A value already escaped on disk (e.g. "'@handle")
 * begins with an apostrophe -- not itself a trigger -- so it is not
 * double-escaped. The cell is then wrapped in double quotes (and any embedded
 * quote doubled) when it contains a comma, quote, or newline.
 *
 * @param {*} value - raw cell value (coerced to string; null/undefined -> '')
 * @returns {string} the escaped cell ready to join into a CSV row
 */
export const escapeCsvCell = (value) => {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (str && CSV_FORMULA_TRIGGERS.has(str[0])) {
    str = "'" + str;
  }
  // Quote on any character that can break CSV structure. Both \n and a bare \r
  // are record terminators in RFC 4180, so a cell like "'\r=HYPERLINK(...)"
  // must be wrapped — otherwise the \r starts a new row and the neutralised
  // formula text leads the next line, defeating the leading-apostrophe escape.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};
