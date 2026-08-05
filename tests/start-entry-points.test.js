import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

describe('Start here entry points', () => {
  it('offers a non-blocking, dismissible guided invitation without obscuring the archive', () => {
    const source = read('frontend/components/WelcomeModal.js');

    assert.match(source, /const WelcomeModal = \(\{ onStart \}\)/);
    assert.match(source, /onStart\?\.\(\)/);
    assert.match(source, />Start here</);
    assert.match(source, /<aside/);
    assert.doesNotMatch(source, /fixed inset-0/);
    assert.doesNotMatch(source, /aria-modal="true"/);
    assert.match(source, /aria-label="Dismiss Start here invitation"/);
    assert.match(source, /aria-describedby="welcome-description"/);
    assert.match(source, /Find your way in/);
    assert.match(source, /landmark work/);
    assert.match(source, />Start here</);
    assert.match(source, /Maybe later/);
    assert.match(source, /onClick=\$\{handleDismiss\}[\s\S]*?>\s*Maybe later/);

    const buttons = [...source.matchAll(/<button[\s\S]*?<\/button>/g)].map(([button]) => button);
    const closeButton = buttons.find((button) => button.includes('aria-label="Dismiss Start here invitation"'));
    const startButton = buttons.find((button) => button.includes('onClick=${handleStart}'));
    const browseButton = buttons.find((button) => button.includes('Maybe later'));
    assert.ok(closeButton && startButton && browseButton, 'all three invitation actions exist');
    assert.match(closeButton, /\bp-3\b/);
    assert.match(closeButton, /className="w-5 h-5" aria-hidden="true"/);
    assert.match(startButton, /\bpy-3\b/);
    assert.match(browseButton, /\bpy-3\b/);
    assert.match(source, /readTourState\(getStorage\(\)\)/);
    assert.match(source, /shouldShowTourEntry/);
    assert.match(source, /recordTourOutcome\(getStorage\(\), outcome\)/);
    assert.match(source, /TOUR_OUTCOMES\.dismissed/);
    assert.match(source, /TOUR_OUTCOMES\.completed/);
  });

  it('defers the availability banner while the first-visit invitation is showing', () => {
    const source = read('frontend/components/WorkInProgressBanner.js');

    assert.match(source, /readTourState/);
    assert.match(source, /shouldShowTourEntry/);
    assert.match(source, /if \(shouldShowTourEntry\(readTourState\(storage\)\)\) return/);
    assert.ok(
      source.indexOf('shouldShowTourEntry(readTourState(storage))')
        < source.indexOf('setDismissed(false)'),
      'the onboarding decision is made before the announcement is revealed',
    );
    assert.match(source, /getStorage\(\)/);
    assert.match(source, /getStorage\(\)\?\.setItem/);
  });

  it('primes the current tour outcome in every live audit that suppresses onboarding', () => {
    for (const path of [
      'docs/feature-audit/harness/test-main.mjs',
      'docs/feature-audit/harness/test-modals.mjs',
      'docs/feature-audit/harness/test-svc.mjs',
    ]) {
      const source = read(path);
      assert.doesNotMatch(source, /setItem\('jrda_visited'/,
        `${path} must not use the retired welcome-modal key`);
      assert.match(source, /setItem\('rosen:tour:v1',\s*'dismissed'\)/,
        `${path} should suppress onboarding through the current tour-state contract`);
    }
  });

  it('pairs the welcome invitation with a compact, non-consent privacy note and permanent details', () => {
    const welcome = read('frontend/components/WelcomeModal.js');
    const about = read('frontend/components/AboutPage.js');
    const app = read('frontend/App.js');
    const recordModal = read('frontend/components/RecordModal.js');
    const networkEffect = read('dissertation/network-effect/index.html');
    const dissertationToolsAudit = read('docs/feature-audit/harness/test-distools.mjs');
    const tailwind = read('frontend/dist/tailwind.css');
    const styles = read('frontend/index.css');

    assert.match(welcome, /archive-welcome-panel__privacy/);
    assert.match(welcome, /No tracking cookies/);
    assert.match(welcome, /local preferences\./);
    assert.match(welcome, /href=\$\{getPrivacyDetailsHref\(\)\}/,
      'the welcome link should start from a clean site-root URL, not preserve record query state');
    assert.doesNotMatch(welcome, /preventDefault\(\)/,
      'privacy details should retain copy-link and new-tab browser behavior');
    assert.match(welcome, />\s*Details\s*</);
    assert.doesNotMatch(welcome, /Accept all|Reject all|Allow cookies|Cookie settings/,
      'a disclosure-only site must not imitate a consent manager');
    assert.match(styles, /\.archive-panel\.archive-welcome-panel\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 2rem\)[\s\S]*?overflow-y:\s*auto/,
      'the fixed invitation must remain internally scrollable in short or highly zoomed viewports');
    assert.match(styles, /\.archive-welcome-panel__privacy a\s*\{[\s\S]*?min-height:\s*var\(--archive-target-min\)/,
      'the privacy details link must retain the design-system touch target');

    assert.match(about, /id="privacy-and-browser-storage"/);
    for (const disclosure of [
      'local storage', 'session storage', 'IndexedDB', 'cache storage',
      'Google Fonts', 'esm.sh', 'Unsplash', 'privacy-enhanced mode',
    ]) {
      assert.match(about, new RegExp(disclosure));
    }
    assert.match(app, />Privacy and browser storage</,
      'privacy details must remain reachable after the first-visit card is dismissed');
    assert.match(app, /ABOUT_PRIVACY_HASH/,
      'the shell should recognize the routable nested About destination');
    assert.match(app, /setCurrentHash\(window\.location\.hash\)/,
      'hash navigation should trigger disclosure focus on direct and history navigation');
    assert.match(app, /getElementById\('privacy-and-browser-storage'\)/);
    assert.match(app, /privacyTarget\.scrollIntoView\(\{ block: 'start' \}\)/);
    assert.match(app, /privacyTarget\.focus\(\{ preventScroll: true \}\)/);
    assert.match(about, /id="privacy-and-browser-storage"[\s\S]*aria-labelledby="privacy-and-browser-storage-title"[\s\S]*tabIndex="-1"/,
      'the disclosure should be a programmatically focusable, named destination');
    assert.match(app, /href=\$\{getPrivacyDetailsHref\(\)\}[\s\S]*>Privacy and browser storage</,
      'the permanent footer entry should be a copyable native link that clears stale record state');
    assert.match(about, /className="mb-12 scroll-mt-24"/,
      'the privacy target should use the shipped offset large enough for the sticky header');
    assert.match(tailwind, /\.scroll-mt-24\{scroll-margin-top:6rem\}/);
    assert.match(recordModal, /https:\/\/www\.youtube-nocookie\.com\/embed\//);
    assert.doesNotMatch(recordModal, /https:\/\/www\.youtube\.com\/embed\//);
    assert.match(networkEffect, /https:\/\/www\.youtube-nocookie\.com\/embed\//);
    assert.doesNotMatch(networkEffect, /https:\/\/www\.youtube\.com\/embed\//);
    assert.match(dissertationToolsAudit, /youtube-nocookie\\\.com\\\/embed/,
      'the dissertation tools audit must verify the privacy-enhanced embed host');
    assert.doesNotMatch(dissertationToolsAudit, /youtube\\\.com\\\/embed\\\/_RujOFCHsxo/,
      'the dissertation tools audit must not require the retired embed host');
  });

  it('offers Start here from the About page', () => {
    const source = read('frontend/components/AboutPage.js');

    assert.match(source, /const AboutPage = \(\{ onBack, onStart, onParticipate, records \}\)/);
    assert.match(source, /onClick=\$\{onStart\}/);
    assert.match(source, /Start here/);
  });

  it('routes the Tools modal Start here card through onSelectTool', () => {
    const source = read('frontend/components/ToolsModal.js');

    assert.match(source, /id: 'start'/);
    assert.match(source, /action: 'start'/);
    assert.match(source, /onSelectTool\(tool\.action\)/);
  });

  it('audits the Start here route at every configured viewport', () => {
    const source = read('scripts/preview-audit.js');

    assert.match(source, /slug: 'start-here',\s+url: '\/#start'/);
    assert.match(source, /name: 'mobile'/);
    assert.match(source, /name: 'desktop'/);
  });
});
