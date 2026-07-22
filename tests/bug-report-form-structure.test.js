// Structure guards for the branded report form wiring (#509). These are cheap
// source-regex checks (same style as wiki-ui-structure.test.js) that lock the
// pieces most likely to silently regress: the header button must open the
// themed modal (not jump straight to GitHub), the honeypot must stay present
// and hidden, both intents must exist, and the endpoint config must be wired.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

describe('branded report form wiring', () => {
  const appSrc = read('frontend', 'App.js');
  const modalSrc = read('frontend', 'components', 'BugReportModal.js');
  const constSrc = read('frontend', 'constants.js');
  const indexCss = read('frontend', 'index.css');

  it('opens the themed modal from the header button, not the GitHub deep link', () => {
    // The in-app helper must flip modal state; the header must not navigate to
    // GitHub directly. The modal still owns its explicit fallback path.
    assert.match(appSrc, /const openBugReport = useCallback[\s\S]*setBugReportOpen\(true\)/);
    assert.match(appSrc, /onClick=\$\{\(\) => openBugReport\('problem'\)\}/);
    assert.match(appSrc, /aria-label="Report a bug"/);
    assert.match(appSrc, /const \[bugReportOpen, setBugReportOpen\] = useState\(false\)/);
  });

  it('renders the modal with the endpoint from config', () => {
    assert.match(appSrc, /<\$\{BugReportModal\}/);
    assert.match(appSrc, /endpoint=\$\{REPORT_CONFIG\.endpoint\}/);
  });

  it('owns its intent-aware GitHub fallback inside the modal', () => {
    // The fallback lives in the modal, not App, because only the modal knows the
    // chosen intent and entered fields. A record suggestion must not fall back to
    // the bug template (which would drop its url/title/why), so the modal calls
    // the intent-aware openReportFallback rather than a bug-only deep link.
    assert.match(modalSrc, /import \{ ARCHIVE_VERSION, openReportFallback \} from '\.\.\/utils\/bugReport\.js\?v=/);
    assert.match(modalSrc, /reportContextRef\.current = captureContext\(\)/);
    assert.match(modalSrc, /openReportFallback\(\{ intent, fields, context: reportContextRef\.current \}\)/);
  });

  it('routes a backend fallback to a user-clicked screen, not an auto popup', () => {
    // window.open() after the submit await is popup-blocked once the click
    // gesture is gone (a honeypot false-positive routes here after a round-trip),
    // which would lose the report. The fallback result must set a phase whose
    // button opens GitHub from a fresh user gesture instead of auto-opening.
    assert.match(modalSrc, /setPhase\('fallback'\)/);
    assert.match(modalSrc, /phase === 'fallback'/);
  });

  it('disables the GitHub fallback button while a submit is in flight', () => {
    // Otherwise a reader can click Send, then the "Prefer GitHub?" link before the
    // POST settles, filing the report twice: once server-side, once via the GitHub
    // form. Both the submit and the fallback button must gate on `submitting`.
    const guarded = modalSrc.match(/disabled=\$\{submitting\}/g) || [];
    assert.ok(guarded.length >= 2, `expected submit + fallback to gate on submitting, found ${guarded.length}`);
  });

  it('freezes the intent tabs and text fields while a submit is in flight', () => {
    // handleSubmit snapshots the payload before awaiting, so if the tabs or inputs
    // stayed live during 'submitting' a reader could edit the text or switch intent
    // mid-request, then see success (or a fallback link) for content that no longer
    // matches what was sent. The tabs and every field must gate on `submitting`.
    assert.match(modalSrc, /setIntent\(value\); setFormError\(''\); \}\}\s*disabled=\$\{submitting\}/);
    const fieldGuards = modalSrc.match(/onInput=\$\{\(e\) => setField\(name, e\.target\.value\)\}\s*disabled=\$\{submitting\}/g) || [];
    assert.ok(fieldGuards.length >= 2, `both textarea and input must gate on submitting, found ${fieldGuards.length}`);
  });

  it('does not offer a non-idempotent GitHub fallback on the error screen', () => {
    // A failed send is ambiguous: the request may have filed the issue server-side
    // anyway. The error screen must not offer a raw GitHub deep link, which bypasses
    // the idempotency key and files a duplicate. Recovery is the idempotent "Try
    // again"; the GitHub escape lives on the form (pre-submit) where nothing has
    // been filed yet.
    assert.match(modalSrc, /That did not go through/);
    assert.match(modalSrc, /setPhase\('form'\)[\s\S]{0,400}Try again/);
    assert.doesNotMatch(modalSrc, /Use the GitHub form instead/);
  });

  it('locks every dismissal path while a submit is in flight', () => {
    // The in-flight submit is the single source of truth. If Escape, the backdrop,
    // or the close button could dismiss mid-request, a reader could close, reopen to
    // a fresh form, and file the same report twice while the first POST completes.
    // One guard (requestClose) that no-ops during 'submitting' covers all three.
    assert.match(modalSrc, /const requestClose = useCallback\(\(\) => \{\s*if \(phase === 'submitting'\) return;/);
    assert.match(modalSrc, /if \(e\.key === 'Escape'\) \{[\s\S]{0,400}e\.stopPropagation\(\);[\s\S]{0,120}requestClose\(\)/);
    assert.match(modalSrc, /e\.currentTarget\) requestClose\(\)/);
    assert.match(modalSrc, /ref=\$\{closeButtonRef\}\s*onClick=\$\{requestClose\}\s*disabled=\$\{submitting\}/);
  });

  it('generates one idempotency key per report and sends it for dedupe', () => {
    // A stable per-report key lets the server dedupe a retried submit into a
    // single issue. It is regenerated on open (reset effect), reused across
    // retries within that open, and sent in the payload.
    assert.match(modalSrc, /import \{[^}]*newReportKey[^}]*\} from '\.\.\/utils\/reportSubmit\.js\?v=/);
    assert.match(modalSrc, /setReportKey\(newReportKey\(\)\)/);
    assert.match(modalSrc, /idempotencyKey: reportKey/);
  });

  it('keeps a hidden, non-tabbable honeypot in the modal', () => {
    assert.match(modalSrc, /left-\[-9999px\]/);
    assert.match(modalSrc, /tabindex="-1"/);
    assert.match(modalSrc, /autocomplete="off"/);
    // The honeypot value flows into the payload as `honeypot`/`website`.
    assert.match(modalSrc, /honeypot/);
  });

  it('offers both intents and is an accessible dialog', () => {
    assert.match(modalSrc, /Report a problem/);
    assert.match(modalSrc, /Suggest a record/);
    assert.match(modalSrc, /role="dialog"/);
    assert.match(modalSrc, /aria-modal="true"/);
  });

  it('traps focus, returns it to the trigger, and keeps touch targets large enough', () => {
    assert.match(modalSrc, /returnFocusRef\.current = document\.activeElement/);
    assert.match(modalSrc, /if \(e\.key !== 'Tab'\) return/);
    assert.match(modalSrc, /modalRef\.current\?\.contains\(document\.activeElement\)/);
    assert.match(modalSrc, /archive-report-dialog-close/);
    assert.match(indexCss, /archive-report-dialog[\s\S]*min-height:\s*44px/);
    assert.match(indexCss, /archive-report-dialog-close[\s\S]*min-width:\s*44px/);
  });

  it('routes submissions through the shared submit client', () => {
    const submitImport = modalSrc.match(/import \{([^}]*)\} from '\.\.\/utils\/reportSubmit\.js\?v=/);
    assert.ok(submitImport, 'imports from reportSubmit.js');
    for (const name of ['buildReportPayload', 'validateReport', 'submitReport']) {
      assert.match(submitImport[1], new RegExp(`\\b${name}\\b`));
    }
    assert.match(modalSrc, /submitReport\(/);
  });

  it('guards the submit lifecycle through the tested gate, not ad-hoc refs', () => {
    // The double-submit / reopen races live in submitGate.js so they stay tested.
    // Reverting to a bare boolean ref would drop that coverage silently.
    assert.match(modalSrc, /import \{ createSubmitGate \} from '\.\.\/utils\/submitGate\.js\?v=/);
    assert.match(modalSrc, /gateRef\.current\.begin\(\)/);
    assert.match(modalSrc, /gateRef\.current\.end\(seq\)/);
    assert.doesNotMatch(modalSrc, /submittingRef/);
  });

  it('versions every modal import for cache busting', () => {
    // No bare local import may skip the ?v= query the zero-build site relies on.
    const bareImport = /from '(\.\.?\/[^']*\.js)'/g;
    let m;
    while ((m = bareImport.exec(modalSrc)) !== null) {
      assert.fail(`unversioned import: ${m[1]}`);
    }
  });

  it('wires a valid report endpoint (empty for fallback, or an Apps Script /exec URL)', () => {
    // Empty keeps the GitHub deep-link fallback; a real value must be the public
    // Apps Script web-app /exec URL that files the issue server-side (#509). This
    // guards against a typo'd or hardcoded-wrong endpoint in either state.
    const m = constSrc.match(/export const REPORT_CONFIG = \{[\s\S]*?endpoint:\s*'([^']*)'/);
    assert.ok(m, 'REPORT_CONFIG.endpoint must be a single-quoted string literal');
    const endpoint = m[1];
    assert.ok(
      endpoint === '' || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint),
      `endpoint must be empty or an Apps Script /exec URL, got: ${endpoint}`,
    );
  });

  it('scrolls the body inside a fixed frame, not the whole card', () => {
    // The card is a flex column that clips its rounded corners (overflow-hidden);
    // the header is a non-shrinking child and the body is the only scroll region.
    // If the whole card scrolled again (overflow-y-auto on the outer div), a long
    // form would drag the header out of view and the scrollbar would run the
    // rounded corners. The scroll region needs min-height:0 so a flex child can
    // shrink below its content and overflow-y-auto engages. This site is
    // zero-build (pre-built Tailwind) and has no min-h-0 class, so minHeight is
    // set inline; asserting the inline style guards against a revert to the
    // inert class that silently breaks scrolling.
    assert.match(modalSrc, /archive-report-dialog__panel flex flex-col overflow-hidden/);
    assert.match(indexCss, /\.archive-report-dialog__panel\s*\{[\s\S]*max-height:\s*calc\(100dvh - 2rem\)/);
    assert.match(modalSrc, /flex-shrink-0[^"]*px-6 py-4/);
    assert.match(modalSrc, /className="flex-1 overflow-y-auto" style=\$\{\{ minHeight: 0 \}\}>\s*\$\{body\(\)\}/);
  });
});
