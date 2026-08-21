// BugReportModal.js: the branded, in-archive report form (#509).
//
// This is the themed layer that sits between the header "Report a bug" button
// and GitHub. Instead of dropping the reader on github.com's new-issue form
// (which needs an account most readers do not have), it collects the report in
// the archive's own look and POSTs it to the Apps Script web app, which files
// the GitHub issue on the reader's behalf. The reader never leaves the site.
//
// Two intents share the form: report a problem, or suggest a record to add.
// If no endpoint is configured yet (pre-deploy), submit falls back to the
// existing GitHub deep link so the button always does something useful.
//
// Styling follows the archive design system (Special Elite display, Roboto Mono
// body, paper background, stone palette, sky focus rings) and deliberately
// avoids the AI-frontend tells: no eyebrow labels, no accent-sliver cards, no
// decorative italics, one primary action.

import { useEffect, useState, useRef, useCallback } from 'react';
import { html } from '../html.js?v=3.8.27';
import { X, Bug, Lightbulb, Send, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { ARCHIVE_VERSION, openReportFallback } from '../utils/bugReport.js?v=3.8.27';
import { createSubmitGate } from '../utils/submitGate.js?v=3.8.27';
import { buildReportPayload, validateReport, submitReport, newReportKey } from '../utils/reportSubmit.js?v=3.8.27';
import { acquireBodyScrollLock } from '../services/bodyScrollLock.js?v=3.8.27';

const EMPTY_FIELDS = {
  whatHappened: '',
  expected: '',
  steps: '',
  url: '',
  title: '',
  why: '',
  email: '',
};

const NO_INITIAL_FIELDS = Object.freeze({});

// Read the debug context the reporter should not have to type. The modal
// snapshots this once per opening so later history navigation cannot erase the
// record or route the reader was reporting from.
const captureContext = () => ({
  page: typeof window !== 'undefined' ? window.location.href : '',
  version: ARCHIVE_VERSION,
  browser: typeof navigator !== 'undefined' ? navigator.userAgent : '',
});

const BugReportModal = ({ isOpen, onClose, endpoint = '', initialIntent = 'problem', initialFields = NO_INITIAL_FIELDS }) => {
  const [intent, setIntent] = useState('problem');
  const [fields, setFields] = useState({ ...EMPTY_FIELDS });
  const [honeypot, setHoneypot] = useState('');
  const [phase, setPhase] = useState('form'); // form | submitting | success | error | fallback
  const [issueUrl, setIssueUrl] = useState('');
  const [formError, setFormError] = useState('');
  // One idempotency key per opened report, reused across retries so the server
  // dedupes them; regenerated on each open (see the reset effect below).
  const [reportKey, setReportKey] = useState('');

  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const firstFieldRef = useRef(null);
  const returnFocusRef = useRef(null);
  const wasOpenRef = useRef(false);
  const reportContextRef = useRef(captureContext());
  // Owns the submit lifecycle: blocks a synchronous double-submit, allows a fresh
  // submit after reopen, and drops a stale in-flight result. Pure + unit-tested
  // in submitGate.js so these races cannot silently regress. useRef with an
  // initializer function so the gate is created once per mount, not per render.
  const gateRef = useRef(null);
  if (gateRef.current === null) gateRef.current = createSubmitGate();

  // Reset to a clean form each time the modal opens so a prior submission's
  // state never leaks into a new report.
  useEffect(() => {
    if (isOpen) {
      gateRef.current.reset();
      reportContextRef.current = captureContext();
      setIntent(initialIntent === 'record' ? 'record' : 'problem');
      setFields({ ...EMPTY_FIELDS, ...initialFields });
      setHoneypot('');
      setPhase('form');
      setIssueUrl('');
      setFormError('');
      // Fresh idempotency key per report: retries of this report reuse it (so
      // the server dedupes), but a new report gets a new key.
      setReportKey(newReportKey());
    }
  }, [isOpen, initialIntent, initialFields]);

  // Focus the first field on open (or the close button on the result screens).
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      if (phase === 'form' && firstFieldRef.current) firstFieldRef.current.focus();
      else if (closeButtonRef.current) closeButtonRef.current.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [isOpen, phase, intent]);

  // Remember the exact trigger so every close path returns keyboard focus,
  // whether the report opened from the archive header, Start here, or a
  // desktop shortcut/menu item.
  useEffect(() => {
    let frame = null;
    if (isOpen && !wasOpenRef.current) {
      returnFocusRef.current = document.activeElement;
    } else if (!isOpen && wasOpenRef.current) {
      const target = returnFocusRef.current;
      frame = requestAnimationFrame(() => {
        if (target?.isConnected && typeof target.focus === 'function') {
          target.focus({ preventScroll: true });
        }
      });
      returnFocusRef.current = null;
    }
    wasOpenRef.current = isOpen;
    return () => { if (frame !== null) cancelAnimationFrame(frame); };
  }, [isOpen]);

  // A submit in flight is the single source of truth: block every dismissal path
  // (Escape, backdrop click, the close button) until it settles. Otherwise a
  // reader could close mid-request, reopen to a fresh form, and file the same
  // report a second time while the first POST is still completing server-side.
  // submitReport's own timeout guarantees this lock releases (the phase leaves
  // 'submitting') within 15s, so the modal can never wedge shut.
  const requestClose = useCallback(() => {
    if (phase === 'submitting') return;
    onClose();
  }, [phase, onClose]);

  // ESC closes. Tab and Shift+Tab stay inside the modal instead of moving
  // focus into the visually obscured archive or desktop behind it.
  useEffect(() => {
    const onKey = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        // This modal can sit above an open record reader. Consume Escape here
        // so the same keystroke cannot bubble into and close the underlying
        // record dialog after this report unmounts.
        e.preventDefault();
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = [...(modalRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || [])].filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        e.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusOutside = !modalRef.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || focusOutside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || focusOutside)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, requestClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    return acquireBodyScrollLock();
  }, [isOpen]);

  const setField = useCallback((name, value) => {
    setFields((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError('');
  }, [formError]);

  const handleBackdrop = (e) => { if (e.target === e.currentTarget) requestClose(); };

  // Open the intent-aware GitHub fallback, carrying what the reader entered so
  // a record suggestion does not land on the bug form and lose its url/title/why.
  const openFallback = useCallback(
    () => openReportFallback({ intent, fields, context: reportContextRef.current }),
    [intent, fields],
  );

  const handleSubmit = useCallback(async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const payload = buildReportPayload({ intent, fields, context: reportContextRef.current, honeypot, idempotencyKey: reportKey });

    const check = validateReport(payload);
    if (!check.valid) { setFormError(check.error); return; }

    // Claim the submit slot. begin() returns 0 if one is already in flight (a
    // double-click before the disabled button renders), blocking a duplicate
    // file. The gate also allows a fresh submit after reopen; see submitGate.js.
    const seq = gateRef.current.begin();
    if (!seq) return;
    setPhase('submitting');
    try {
      const result = await submitReport({ endpoint, payload });

      // The modal was closed/reopened while this was in flight: drop the stale
      // result so it cannot overwrite the current session's state.
      if (!gateRef.current.isCurrent(seq)) return;

      if (result.fallback) {
        // Do not window.open() here: the await above may have outlived the click
        // gesture (a honeypot false-positive routes here after a round-trip), so
        // a popup would be blocked and the report lost. Show a screen whose button
        // opens GitHub from a fresh user gesture. Fires pre-deploy (no endpoint
        // set) and on a honeypot false-positive.
        setPhase('fallback');
        return;
      }
      if (result.ok) {
        setIssueUrl(result.issueUrl || '');
        setPhase('success');
        return;
      }
      setFormError(result.error || 'Your report could not be sent.');
      setPhase('error');
    } finally {
      gateRef.current.end(seq);
    }
  }, [intent, fields, honeypot, endpoint, reportKey, openFallback, onClose]);

  if (!isOpen) return null;

  const isProblem = intent === 'problem';
  const submitting = phase === 'submitting';

  const intentTab = (value, Icon, label) => html`
    <button
      type="button"
      onClick=${() => { setIntent(value); setFormError(''); }}
      disabled=${submitting}
      aria-pressed=${intent === value}
      className=${`archive-action flex-1 ${
        intent === value
          ? 'archive-action--primary'
          : 'archive-action--secondary'
      }`}
    >
      <${Icon} className="w-4 h-4" aria-hidden="true" />
      ${label}
    </button>
  `;

  const labelledTextarea = (name, label, placeholder, rows, refEl) => html`
    <label className="block">
      <span className="block text-xs font-bold text-stone-700 mb-1">${label}</span>
      <textarea
        ref=${refEl || null}
        value=${fields[name]}
        onInput=${(e) => setField(name, e.target.value)}
        disabled=${submitting}
        rows=${rows}
        placeholder=${placeholder}
        className="archive-control"
      ></textarea>
    </label>
  `;

  const labelledInput = (name, label, placeholder, type = 'text', refEl) => html`
    <label className="block">
      <span className="block text-xs font-bold text-stone-700 mb-1">${label}</span>
      <input
        ref=${refEl || null}
        type=${type}
        value=${fields[name]}
        onInput=${(e) => setField(name, e.target.value)}
        disabled=${submitting}
        placeholder=${placeholder}
        className="archive-control"
      />
    </label>
  `;

  const body = () => {
    if (phase === 'success') {
      return html`
        <div className="px-6 py-10 text-center">
          <${CheckCircle2} className="w-10 h-10 text-green-600 mx-auto mb-4" aria-hidden="true" />
          <h3 className="font-display text-xl text-stone-900 mb-2">Thank you</h3>
          <p className="text-sm text-stone-600 max-w-sm mx-auto mb-6">
            Your ${isProblem ? 'report' : 'suggestion'} reached the archive. We read every one.
          </p>
          ${issueUrl && html`
            <a
              href=${issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-700 hover:text-stone-900 underline"
            >
              View it on GitHub <${ExternalLink} className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          `}
          <div className="mt-8">
            <button
              type="button"
              onClick=${onClose}
              className="archive-action archive-action--primary"
            >
              Done
            </button>
          </div>
        </div>
      `;
    }

    if (phase === 'fallback') {
      // Reached when the archive backend could not file the report (pre-deploy,
      // or a honeypot false-positive). The reader's data is preserved in the
      // prefilled GitHub link; the button opens it on a real click so the popup
      // is not blocked.
      return html`
        <div className="px-6 py-10 text-center">
          <${ExternalLink} className="w-10 h-10 text-stone-700 mx-auto mb-4" aria-hidden="true" />
          <h3 className="font-display text-xl text-stone-900 mb-2">Finish on GitHub</h3>
          <p className="text-sm text-stone-600 max-w-sm mx-auto mb-6">
            We could not send this from here, so we filled in a GitHub issue with
            what you entered. Open it to post your ${isProblem ? 'report' : 'suggestion'}.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick=${() => { openFallback(); onClose(); }}
              className="archive-action archive-action--primary"
            >
              Open the issue form <${ExternalLink} className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick=${onClose}
              className="archive-action archive-action--quiet"
            >
              Cancel
            </button>
          </div>
        </div>
      `;
    }

    if (phase === 'error') {
      // A failed send is ambiguous: the request may have timed out or lost its
      // response yet still filed the issue server-side (or a concurrent retry is
      // filing it right now). "Try again" is the only safe recovery here because it
      // reuses the idempotency key, so the server returns the existing issue rather
      // than filing a duplicate. We deliberately do NOT offer a direct GitHub deep
      // link on this screen: that path bypasses the key and would open a second
      // public issue for the same report. Try again returns to the form, which
      // still carries the pre-submit "Prefer GitHub?" fallback for a genuine
      // outage — where nothing was filed, so GitHub is safe.
      return html`
        <div className="px-6 py-10 text-center">
          <${AlertCircle} className="w-10 h-10 text-red-600 mx-auto mb-4" aria-hidden="true" />
          <h3 className="font-display text-xl text-stone-900 mb-2">That did not go through</h3>
          <p className="text-sm text-stone-600 max-w-sm mx-auto mb-6">${formError}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick=${() => setPhase('form')}
              className="archive-action archive-action--primary"
            >
              Try again
            </button>
          </div>
        </div>
      `;
    }

    // phase === 'form' | 'submitting'
    return html`
      <form onSubmit=${handleSubmit} className="px-6 py-6 space-y-4">
        <div className="flex gap-2">
          ${intentTab('problem', Bug, 'Report a problem')}
          ${intentTab('record', Lightbulb, 'Suggest a record')}
        </div>

        ${isProblem ? html`
          ${labelledTextarea('whatHappened', 'What happened?', 'I opened a record and the page went blank.', 3, firstFieldRef)}
          ${labelledTextarea('expected', 'What did you expect? (optional)', 'The record details should have opened.', 2)}
          ${labelledTextarea('steps', 'Steps to reproduce (optional)', '1. Go to ...\n2. Click ...\n3. See ...', 3)}
        ` : html`
          ${labelledInput('url', 'Link to the work', 'https://pressthink.org/...', 'url', firstFieldRef)}
          ${labelledInput('title', 'Suggested title (optional)', 'e.g. He Said, She Said journalism')}
          ${labelledTextarea('why', 'Why it belongs in the archive (optional)', 'A short note on what this is.', 3)}
        `}

        ${labelledInput('email', 'Your email (optional, shown publicly)', 'So we can follow up if we need to.', 'email')}

        <!-- Honeypot: off-screen, not announced, not tabbable. Real people never
             fill this; naive bots do, and the server drops those silently. -->
        <div aria-hidden="true" className="absolute left-[-9999px] top-auto w-px h-px overflow-hidden">
          <label>
            Website
            <input
              type="text"
              tabindex="-1"
              autocomplete="off"
              value=${honeypot}
              onInput=${(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        <p className="text-xs text-stone-500 leading-relaxed">
          ${isProblem
            ? 'We automatically attach the page you are on, the archive version, and your browser so we can reproduce the problem. Your report is posted as a public GitHub issue, so please leave out anything private. No account needed.'
            : 'We automatically attach the page you are on and the archive version. Your suggestion is posted as a public GitHub issue, so please leave out anything private. No account needed.'}
        </p>

        ${formError && html`
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2">
            ${formError}
          </p>
        `}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick=${() => { openFallback(); onClose(); }}
            disabled=${submitting}
            className="archive-action archive-action--quiet"
          >
            Prefer GitHub? Open the issue form
          </button>
          <button
            type="submit"
            disabled=${submitting}
            className="archive-action archive-action--primary"
          >
            <${Send} className="w-4 h-4" aria-hidden="true" />
            ${submitting ? 'Sending...' : 'Send report'}
          </button>
        </div>
      </form>
    `;
  };

  return html`
    <div
      className="archive-report-dialog archive-dialog-backdrop z-[100]"
      onClick=${handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
    >
      <div ref=${modalRef} className="archive-dialog archive-report-dialog__panel flex flex-col overflow-hidden">
        <div className="archive-report-dialog__header flex-shrink-0 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <${Bug} className="w-5 h-5 text-stone-700 flex-shrink-0" aria-hidden="true" />
            <h2 id="bug-report-title" className="font-display text-xl text-stone-800">
              Report a problem or suggest a record
            </h2>
          </div>
          <button
            ref=${closeButtonRef}
            onClick=${requestClose}
            disabled=${submitting}
            className="archive-action archive-action--quiet archive-report-dialog-close flex-shrink-0"
            aria-label="Close report form"
          >
            <${X} className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <!-- Inline minHeight:0 (not a Tailwind min-h-0 class): the pre-built,
             zero-build stylesheet has no min-h-0 rule, and a flex child defaults
             to min-height:auto, which refuses to shrink below its content and
             defeats overflow-y-auto. This is the body's own scroll region. -->
        <div className="flex-1 overflow-y-auto" style=${{ minHeight: 0 }}>
          ${body()}
        </div>
      </div>
    </div>
  `;
};

export default BugReportModal;
