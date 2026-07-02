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

  it('opens the themed modal from the header button, not the GitHub deep link', () => {
    // The button must flip modal state. If it ever reverts to onClick=openBugReport
    // the reader gets dropped on github.com again, which is the regression #509 fixes.
    assert.match(appSrc, /onClick=\$\{\(\)\s*=>\s*setBugReportOpen\(true\)\}/);
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
    assert.match(modalSrc, /openReportFallback\(\{ intent, fields, context: captureContext\(\) \}\)/);
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

  it('routes submissions through the shared submit client', () => {
    assert.match(modalSrc, /import \{ buildReportPayload, validateReport, submitReport \} from '\.\.\/utils\/reportSubmit\.js\?v=/);
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

  it('exposes a configurable, default-empty report endpoint', () => {
    assert.match(constSrc, /export const REPORT_CONFIG = \{[\s\S]*endpoint:\s*''/);
  });
});
