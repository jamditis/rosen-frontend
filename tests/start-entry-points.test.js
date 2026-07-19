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
