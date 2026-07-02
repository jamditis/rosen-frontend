// Prefilled GitHub-issue link for the on-site "Report a bug" button (#450).
//
// The archive is a static site, so a bug report is a deep link into GitHub's
// new-issue form (.github/ISSUE_TEMPLATE/bug_report.yml). We prefill the form's
// page, archive-version, and browser fields by their field ids so each report
// carries the debug context the reporter would otherwise have to type (and
// usually can't — most people don't know their user-agent string).
//
// The `page-context`, `archive-version`, and `browser` query keys below MUST
// match the `id:` values in bug_report.yml; GitHub maps query parameters onto
// issue-form fields by id. The build step is kept pure (context passed in) so it
// unit-tests without a browser.

const NEW_ISSUE_URL = 'https://github.com/jamditis/rosen-frontend/issues/new';
const TEMPLATE = 'bug_report.yml';
const LABELS = 'bug,user-report';

// The archive version is the ?v= cache-buster this module was imported with, so
// it always matches the deployed build with no fetch and no separate constant
// to keep in sync. Falls back to 'unknown' when loaded without the query (tests,
// direct file access).
export const ARCHIVE_VERSION =
  new URL(import.meta.url).searchParams.get('v') || 'unknown';

/**
 * Build the prefilled new-issue URL.
 * @param {Object} ctx
 * @param {string} [ctx.page]    full page URL the reporter was on
 * @param {string} [ctx.version] archive version string
 * @param {string} [ctx.browser] navigator.userAgent
 * @returns {string} an absolute github.com new-issue URL
 */
export const buildBugReportUrl = ({ page = '', version = '', browser = '' } = {}) => {
  const params = new URLSearchParams({
    template: TEMPLATE,
    labels: LABELS,
    'page-context': page,
    'archive-version': version,
    browser,
  });
  return `${NEW_ISSUE_URL}?${params.toString()}`;
};

/**
 * Open a prefilled bug report in a new tab, reading the live page context at
 * click time so the URL reflects the route and any open record (?record=).
 */
export const openBugReport = () => {
  const url = buildBugReportUrl({
    page: window.location.href,
    version: ARCHIVE_VERSION,
    browser: navigator.userAgent,
  });
  window.open(url, '_blank', 'noopener,noreferrer');
};

const RECORD_LABELS = 'record-suggestion,user-report';

const trimField = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Build a prefilled new-issue URL for a report the branded modal could not send
 * to the backend (pre-deploy state, or an endpoint outage). Intent-aware and
 * data-preserving: a "suggest a record" report goes to a record issue carrying
 * its url/title/why, not the bug template (which would drop that data), and a
 * "report a problem" report carries the typed what-happened/expected/steps into
 * the bug form so the reader never has to retype what they just entered.
 *
 * @param {Object} opts
 * @param {'problem'|'record'} [opts.intent]
 * @param {Object} [opts.fields]   the entered form fields
 * @param {Object} [opts.context]  { page, version, browser }
 * @returns {string} an absolute github.com new-issue URL
 */
export const buildReportFallbackUrl = ({ intent = 'problem', fields = {}, context = {} } = {}) => {
  const page = trimField(context.page);
  const version = trimField(context.version);
  const browser = trimField(context.browser);

  if (intent === 'record') {
    const url = trimField(fields.url);
    const title = trimField(fields.title);
    const why = trimField(fields.why);
    const email = trimField(fields.email);
    const body = ['Suggested by a reader via the in-archive form.', '', `Link: ${url}`];
    if (title) body.push(`Suggested title: ${title}`);
    if (why) body.push('', 'Why it belongs:', why);
    if (email) body.push('', `Contact: ${email}`);
    body.push('', `Page: ${page}`, `Archive version: ${version}`);
    const params = new URLSearchParams({
      title: `[record] ${title || url}`,
      labels: RECORD_LABELS,
      body: body.join('\n'),
    });
    return `${NEW_ISSUE_URL}?${params.toString()}`;
  }

  const params = new URLSearchParams({
    template: TEMPLATE,
    labels: LABELS,
    'what-happened': trimField(fields.whatHappened),
    expected: trimField(fields.expected),
    steps: trimField(fields.steps),
    'page-context': page,
    'archive-version': version,
    browser,
  });
  return `${NEW_ISSUE_URL}?${params.toString()}`;
};

/**
 * Open the intent-aware fallback issue in a new tab. The modal calls this when
 * the backend submit is unavailable, passing the reader's entered fields.
 */
export const openReportFallback = ({ intent, fields, context } = {}) => {
  const url = buildReportFallbackUrl({ intent, fields, context });
  window.open(url, '_blank', 'noopener,noreferrer');
};
