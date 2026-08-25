/**
 * Static composition contracts for the branded report form (#509, #587).
 *
 * User-controlled report data, fallback URLs, validation, submission failures,
 * idempotency, and submit races have direct unit coverage in report-submit,
 * bug-report-url, apps-script-report, and submit-gate tests. The component uses
 * the browser import map for React, HTM, and icons, while the standard CI job
 * does not install Chromium. Keep only the browser composition boundaries here,
 * and bind every positive check to the declaration or render branch that owns it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sourceSection } from './helpers/source-section.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

describe('branded report form static composition', () => {
  const appSrc = read('frontend', 'App.js');
  const modalSrc = read('frontend', 'components', 'BugReportModal.js');
  const constSrc = read('frontend', 'constants.js');
  const indexCss = read('frontend', 'index.css');

  const modalImports = sourceSection(
    modalSrc,
    "import { useEffect",
    'const EMPTY_FIELDS',
    'report modal imports',
  );
  const resetEffect = sourceSection(
    modalSrc,
    '// Reset to a clean form each time',
    '// Focus the first field on open',
    'report modal reset effect',
  );
  const closeGuard = sourceSection(
    modalSrc,
    'const requestClose',
    '// ESC closes.',
    'report modal close guard',
  );
  const keyboardEffect = sourceSection(
    modalSrc,
    '// ESC closes.',
    "  useEffect(() => {\n    if (!isOpen) return undefined;",
    'report modal keyboard effect',
  );
  const returnFocusEffect = sourceSection(
    modalSrc,
    '// Remember the exact trigger',
    '// A submit in flight is the single source of truth',
    'report modal return-focus effect',
  );
  const interactionHandlers = sourceSection(
    modalSrc,
    'const setField',
    '// Open the intent-aware GitHub fallback',
    'report modal interaction handlers',
  );
  const fallbackHandler = sourceSection(
    modalSrc,
    'const openFallback',
    'const handleSubmit',
    'report modal fallback handler',
  );
  const submitHandler = sourceSection(
    modalSrc,
    'const handleSubmit',
    'if (!isOpen) return null;',
    'report modal submit handler',
  );
  const intentTab = sourceSection(
    modalSrc,
    'const intentTab',
    'const labelledTextarea',
    'report modal intent tab',
  );
  const fieldRenderers = sourceSection(
    modalSrc,
    'const labelledTextarea',
    'const body',
    'report modal field renderers',
  );
  const fallbackView = sourceSection(
    modalSrc,
    "if (phase === 'fallback')",
    "if (phase === 'error')",
    'report modal fallback view',
  );
  const errorView = sourceSection(
    modalSrc,
    "if (phase === 'error')",
    "// phase === 'form' | 'submitting'",
    'report modal error view',
  );
  const formView = sourceSection(
    modalSrc,
    "// phase === 'form' | 'submitting'",
    '  };\n\n  return html`',
    'report modal form view',
  );
  const dialogView = sourceSection(
    modalSrc,
    '  return html`\n    <div\n      className="archive-report-dialog',
    '\n};\n\nexport default',
    'report modal dialog view',
  );

  it('opens the themed modal through one state setter and renders it on both app shells', () => {
    const modalState = sourceSection(
      appSrc,
      'const [bugReportOpen',
      'const [showBackToTop',
      'report modal state',
    );
    const openHandler = sourceSection(
      appSrc,
      'const openBugReport',
      'const handleRecordProblemReport',
      'report modal open handler',
    );
    const fullPageOverlay = sourceSection(
      appSrc,
      'const renderFullPage',
      '// Full-page routes:',
      'full-page report overlay',
    );
    const archiveOverlays = sourceSection(
      appSrc,
      '<${ToolsModal}',
      '${recordView}',
      'archive report overlay',
    );
    const archiveHeader = sourceSection(
      appSrc,
      '<header className=${`archive-site-header',
      '<a href="https://github.com/jamditis"',
      'archive header report trigger',
    );

    assert.match(modalState, /const \[bugReportOpen, setBugReportOpen\] = useState\(false\)/);
    assert.match(openHandler, /setBugReportOpen\(true\)/);
    assert.match(archiveHeader, /onClick=\$\{\(\) => openBugReport\('problem'\)\}/);
    assert.match(archiveHeader, /aria-label="Report a bug"/);
    for (const section of [fullPageOverlay, archiveOverlays]) {
      assert.match(section, /<\$\{BugReportModal\}/);
      assert.match(section, /endpoint=\$\{REPORT_CONFIG\.endpoint\}/);
    }
  });

  it('keeps intent-aware fallback state inside the modal', () => {
    assert.match(modalImports, /ARCHIVE_VERSION, openReportFallback/);
    assert.match(resetEffect, /reportContextRef\.current = captureContext\(\)/);
    assert.match(fallbackHandler, /openReportFallback\(\{ intent, fields, context: reportContextRef\.current \}\)/);
    assert.match(submitHandler, /if \(result\.fallback\)[\s\S]*setPhase\('fallback'\)/);
    assert.match(fallbackView, /Finish on GitHub/);
    assert.match(fallbackView, /onClick=\$\{\(\) => \{ openFallback\(\); onClose\(\); \}\}/);
  });

  it('locks editing and every dismissal path during submission', () => {
    assert.match(closeGuard, /if \(phase === 'submitting'\) return/);
    assert.match(keyboardEffect, /e\.key === 'Escape'[\s\S]*requestClose\(\)/);
    assert.match(interactionHandlers, /e\.target === e\.currentTarget[\s\S]*requestClose\(\)/);
    assert.match(intentTab, /disabled=\$\{submitting\}/);

    const fieldGuards = fieldRenderers.match(/disabled=\$\{submitting\}/g) || [];
    assert.equal(fieldGuards.length, 2, 'textarea and input factories must lock during submit');
    const formButtonGuards = formView.match(/disabled=\$\{submitting\}/g) || [];
    assert.equal(formButtonGuards.length, 2, 'fallback and submit buttons must lock during submit');

    assert.match(dialogView, /onClick=\$\{handleBackdrop\}/);
    assert.match(dialogView, /onClick=\$\{requestClose\}[\s\S]*disabled=\$\{submitting\}/);
  });

  it('keeps ambiguous-error recovery on the idempotent submit path', () => {
    assert.match(errorView, /That did not go through/);
    assert.match(errorView, /setPhase\('form'\)[\s\S]*Try again/);
    assert.doesNotMatch(errorView, /Open the issue form|onClick=\$\{\(\) => \{ openFallback/);
  });

  it('connects one report key and one tested submit gate to the submit handler', () => {
    assert.match(modalImports, /createSubmitGate/);
    assert.match(modalImports, /buildReportPayload, validateReport, submitReport, newReportKey/);
    assert.match(resetEffect, /gateRef\.current\.reset\(\)/);
    assert.match(resetEffect, /setReportKey\(newReportKey\(\)\)/);
    assert.match(submitHandler, /idempotencyKey: reportKey/);
    assert.match(submitHandler, /gateRef\.current\.begin\(\)/);
    assert.match(submitHandler, /gateRef\.current\.isCurrent\(seq\)/);
    assert.match(submitHandler, /submitReport\(\{ endpoint, payload \}\)/);
    assert.match(submitHandler, /gateRef\.current\.end\(seq\)/);
  });

  it('retains the accessible dialog, intents, honeypot, and focus loop', () => {
    assert.match(formView, /intentTab\('problem', Bug, 'Report a problem'\)/);
    assert.match(formView, /intentTab\('record', Lightbulb, 'Suggest a record'\)/);
    assert.match(intentTab, /setIntent\(value\); setFormError\(''\);/);
    const fieldBindings = fieldRenderers.match(/onInput=\$\{\(e\) => setField\(name, e\.target\.value\)\}/g) || [];
    assert.equal(fieldBindings.length, 2, 'textarea and input factories must update their owned field');
    assert.match(formView, /aria-hidden="true"[\s\S]*tabindex="-1"[\s\S]*autocomplete="off"/);
    assert.match(formView, /left-\[-9999px\]/);
    assert.match(dialogView, /role="dialog"/);
    assert.match(dialogView, /aria-modal="true"/);
    assert.match(dialogView, /aria-labelledby="bug-report-title"/);
    assert.match(keyboardEffect, /if \(e\.key !== 'Tab'\) return/);
    assert.match(keyboardEffect, /focusOutside[\s\S]*last\.focus\(\)[\s\S]*first\.focus\(\)/);
    assert.match(returnFocusEffect, /returnFocusRef\.current = document\.activeElement/);
    assert.match(returnFocusEffect, /target\.focus\(\{ preventScroll: true \}\)/);
  });

  it('versions every local modal import', () => {
    const localImports = [...modalImports.matchAll(/from '(\.\.?\/[^']+)'/g)]
      .map((match) => match[1]);
    assert.ok(localImports.length > 0);
    for (const specifier of localImports) {
      assert.match(specifier, /\.js\?v=\d+\.\d+\.\d+$/, `unversioned import: ${specifier}`);
    }
  });

  it('keeps a valid public report endpoint', () => {
    const reportConfig = sourceSection(
      constSrc,
      'export const REPORT_CONFIG',
      'export const ITEMS_PER_PAGE',
      'report endpoint config',
    );
    const endpoint = reportConfig.match(/endpoint:\s*'([^']*)'/)?.[1];
    assert.notEqual(endpoint, undefined);
    assert.ok(
      endpoint === '' || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(endpoint),
      `endpoint must be empty or an Apps Script /exec URL, got: ${endpoint}`,
    );
  });

  it('keeps the header fixed and the form body as the only scroll region', () => {
    const touchTargets = sourceSection(
      indexCss,
      '.archive-report-dialog button,',
      '/* Settings sidebar slide-in animation */',
      'report dialog touch targets',
    );
    const panelRule = sourceSection(
      indexCss,
      '.archive-dialog.archive-report-dialog__panel',
      '/* Archive discovery and result surfaces.',
      'report dialog panel rule',
    );

    assert.match(dialogView, /archive-report-dialog__header flex-shrink-0/);
    assert.match(dialogView, /archive-report-dialog__panel flex flex-col overflow-hidden/);
    assert.match(dialogView, /className="flex-1 overflow-y-auto" style=\$\{\{ minHeight: 0 \}\}/);
    assert.match(panelRule, /max-height:\s*calc\(100dvh - 2rem\)/);
    assert.match(touchTargets, /min-height:\s*44px/);
    assert.match(touchTargets, /archive-report-dialog-close[\s\S]*min-width:\s*44px/);
  });
});
