import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const app = read('frontend/App.js');
const bugReport = read('frontend/components/BugReportModal.js');
const bodyScrollLock = read('frontend/services/bodyScrollLock.js');
const archiveService = read('frontend/services/archiveService.js');
const claudeGuide = read('CLAUDE.md');
const detailPanel = read('frontend/components/DetailPanel.js');
const recordModal = read('frontend/components/RecordModal.js');
const recordView = read('frontend/components/RecordView.js');
const threadModal = read('frontend/components/ThreadModal.js');
const styles = read('frontend/index.css');
const audit = read('scripts/preview-audit.js');

describe('archival record-reading surfaces', () => {
  it('renders the canonical record as a structured paper document', () => {
    for (const className of [
      'archive-record-sheet',
      'archive-record-utility',
      'archive-record-document',
      'archive-record-source',
      'archive-record-quotation',
      'archive-record-metadata',
      'archive-record-related',
      'archive-record-navigation',
    ]) {
      assert.match(recordModal, new RegExp(className));
      assert.match(styles, new RegExp(`\\.${className}`));
    }
    assert.match(recordModal, /aria-label="Close record"/);
    assert.match(recordModal, />\s*Report a problem with this record\s*</);
    assert.match(recordModal, /Read on \$\{sourceName\}/);
    assert.match(recordModal, /Source unavailable in this archive/);
  });

  it('keeps the record dialog modal, focused, and keyboard-contained', () => {
    assert.match(recordModal, /role="dialog" aria-modal="true" aria-labelledby="record-modal-title"/);
    assert.match(recordModal, /element\.inert = true/);
    assert.match(recordModal, /element\.setAttribute\('aria-hidden', 'true'\)/);
    assert.match(
      recordModal,
      /!element\.matches\('\[role="dialog"\]\[aria-modal="true"\]'\)/,
      'an already-open topmost dialog must not be hidden when the record mounts beneath it',
    );
    assert.match(recordModal, /closeButtonRef\.current\?\.focus/);
    assert.match(recordModal, /if \(!hasRecord \|\| nestedDialogOpen\) return undefined/);
    assert.match(recordModal, /if \(openerRef\.current\) return undefined/);
    assert.match(recordModal, /e\.key === 'Tab'/);
    assert.match(recordModal, /document\.activeElement !== document\.body/);
    assert.match(recordModal, /blocksRecordNavigation\(e\.target\)/);
    assert.match(recordModal, /\.archive-record-source/);
    assert.match(styles, /\.archive-record-dialog[^}]*overscroll-behavior:\s*contain/);
  });

  it('shows deliberate loading, incomplete, and error states', () => {
    assert.match(recordModal, /detailsError/);
    assert.match(recordModal, /role="status"[^>]*archive-record-loading|archive-record-loading[^>]*role="status"/);
    assert.match(recordModal, /role="alert"[^>]*archive-record-error|archive-record-error[^>]*role="alert"/);
    assert.match(recordModal, />\s*Retry details\s*</);
    assert.match(recordModal, /!loadingDetails && !detailsError \? html`/);
    assert.match(styles, /\.archive-record-loading/);
    assert.match(styles, /\.archive-record-error/);
    assert.match(styles, /@media \(max-width: 639px\)[\s\S]*\.archive-record-error \{[\s\S]*display: grid;[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);/);
    assert.match(styles, /@media \(max-width: 639px\)[\s\S]*\.archive-record-error button \{[\s\S]*grid-column: 2;[\s\S]*margin-left: 0;/);
  });

  it('prefills the nearby record-problem report with the record id', () => {
    assert.match(recordView, /onReportProblem/);
    assert.match(app, /onReportProblem=\$\{handleRecordProblemReport\}/);
    assert.match(app, /whatHappened:\s*`Problem with archive record \$\{recordId\}: `/);
    assert.match(app, /initialFields=\$\{bugReportInitialFields\}/);
    assert.match(bugReport, /initialFields\s*=\s*NO_INITIAL_FIELDS/);
    assert.match(bugReport, /\{ \.\.\.EMPTY_FIELDS, \.\.\.initialFields \}/);
  });

  it('coordinates nested modal body scroll locks through one ref-counted owner', () => {
    assert.match(bodyScrollLock, /let activeLocks = 0/);
    assert.match(bodyScrollLock, /activeLocks \+= 1/);
    assert.match(bodyScrollLock, /activeLocks -= 1/);
    assert.match(recordModal, /acquireBodyScrollLock\(\)/);
    assert.match(bugReport, /acquireBodyScrollLock\(\)/);
    assert.doesNotMatch(recordModal, /document\.body\.style\.overflow/);
    assert.doesNotMatch(bugReport, /document\.body\.style\.overflow/);
    assert.match(audit, /Record reader lost its body scroll lock after the report dialog closed/);
    assert.match(audit, /Nested report restored a stale body scroll lock after browser Back/);
  });

  it('makes detail-load failures retryable without unhandled warmup rejections', () => {
    assert.match(archiveService, /detailsCache = null;[\s\S]{0,120}throw error;/);
    assert.match(archiveService, /loadDetailsCache\(\)\.catch\(\(\) => \{\}\)/);
    assert.match(audit, /slug: 'record-error'[\s\S]*mockDetailsFailure: true/);
    assert.match(audit, /verifyRecordReading === 'error'/);
    assert.match(audit, /route\.mockDetailsFailure\s*\?\s*archiveDetailsRequests\.length < 1/);
    assert.match(audit, /message\.location\(\)\.url/);
    assert.match(audit, /Failed to load resource:[\s\S]{0,240}archive-details\.json/);
    assert.match(
      recordModal,
      /currentFullRecord \|\| \(detailsError \? record : null\)/,
      'a failed social detail fetch must fall back to a shareable canonical archive record',
    );
    assert.match(recordModal, /const sharePending = record\?\.type === 'social' && !shareRecord/);
    assert.match(recordModal, /const shareUsesSource = shareRecord\?\.type === 'social' && hasPublicSourceUrl\(shareRecord\)/);
    assert.match(audit, /record=BSKY-03169&report=problem&source=participate/);
    assert.match(audit, /Report-first record deep link hid its topmost dialog/);
    assert.match(audit, /Social record detail failure left its canonical share fallback disabled/);
  });

  it('keeps BugReportModal defaults stable when a caller omits initial fields', () => {
    assert.match(bugReport, /const NO_INITIAL_FIELDS = Object\.freeze\(\{\}\)/);
    assert.match(bugReport, /initialFields = NO_INITIAL_FIELDS/);
  });

  it('uses one document language for thread and dissertation detail reading', () => {
    assert.match(threadModal, /archive-thread/);
    assert.match(threadModal, /archive-thread-post/);
    assert.match(threadModal, /--thread-depth/);
    assert.match(threadModal, /Thread unavailable/);
    assert.match(detailPanel, /archive-reading-panel/);
    assert.match(detailPanel, /archive-reading-panel__header/);
    assert.match(detailPanel, /archive-reading-panel__document/);
    assert.match(detailPanel, /No additional detail for this item/);
    assert.match(styles, /\.archive-thread-post/);
    assert.match(styles, /\.archive-reading-panel/);
  });

  it('captures article, social, thread, media, and incomplete reading states', () => {
    assert.match(audit, /slug: 'record-article'[\s\S]*record=RECORD-00802/);
    assert.match(audit, /slug: 'record-social'[\s\S]*record=BSKY-03169/);
    assert.match(audit, /slug: 'record-thread'[\s\S]*record=THREAD-00001/);
    assert.match(audit, /slug: 'record-media'[\s\S]*record=RECORD-00581/);
    assert.match(audit, /slug: 'record-incomplete'[\s\S]*mockIncompleteRecord/);
    assert.match(audit, /route\.mockIncompleteRecord/);
    assert.match(audit, /\.nth\(19\)\.waitFor\(\)/);
    assert.match(claudeGuide, /walks 40 route states at mobile, tablet, and desktop/);
  });
});
