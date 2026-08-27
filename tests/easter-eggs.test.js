/**
 * Hidden extras (#754).
 *
 * Joe promised Jay a second Easter egg on the 2026-07-22 call and approved six
 * of them on 2026-08-27. These tests lock the trigger logic and the house
 * rules that keep the extras from costing anyone anything: no sound, no focus
 * traps, dismissible notes, one console line per load, and motion that a
 * reduced-motion visitor never has to see.
 *
 * The trigger helpers are pure and imported directly. The wiring lives in
 * files that pull in browser-only ?v= imports, so those are checked as source
 * patterns, the same way the other App.js structure tests work. The tests name
 * the mechanics; no public-facing page does.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  BROKEN_RECORD_CLICKS,
  BROKEN_RECORD_WINDOW_MS,
  DISSERTATION_YEAR,
  IDLE_LINE,
  IDLE_REVEAL_MS,
  NOWHERE_LINE,
  NOWHERE_RECORD_ID,
  TYPEWRITER_SEQUENCE,
  brokenRecordLine,
  createRapidRepeatCounter,
  createSequenceMatcher,
  isDissertationYearQuery,
  isTypingTarget,
  summarizeBrokenRecord,
} from '../frontend/utils/easterEggs.js';
import {
  WATCHDOG_ART,
  WATCHDOG_MESSAGE,
  logWatchdog,
} from '../frontend/utils/consoleWatchdog.js';
import {
  TYPEWRITER_CLASS,
  installTypewriterEgg,
} from '../frontend/services/typewriterEgg.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

const appSrc = read('frontend', 'App.js');
const indexSrc = read('frontend', 'index.js');
const cssSrc = read('frontend', 'index.css');
const sidebarSrc = read('frontend', 'components', 'Sidebar.js');
const resultsSrc = read('frontend', 'components', 'ArchiveResults.js');
const aboutSrc = read('frontend', 'components', 'AboutPage.js');
const noteSrc = read('frontend', 'components', 'EasterEggNote.js');
const nowhereSrc = read('frontend', 'components', 'NowherePage.js');
const typewriterSrc = read('frontend', 'services', 'typewriterEgg.js');
const watchdogSrc = read('frontend', 'utils', 'consoleWatchdog.js');
const eggUtilsSrc = read('frontend', 'utils', 'easterEggs.js');

describe('the typewriter sequence', () => {
  it('fires on the full sequence and not before', () => {
    const matcher = createSequenceMatcher(TYPEWRITER_SEQUENCE);
    const typed = TYPEWRITER_SEQUENCE.split('');
    const last = typed.pop();

    for (const character of typed) {
      assert.equal(matcher.push(character), false);
    }
    assert.equal(matcher.push(last), true);
  });

  it('survives a false start and ignores case', () => {
    const matcher = createSequenceMatcher('press');
    for (const character of 'PPRES'.split('')) matcher.push(character);
    assert.equal(matcher.push('s'), true);
  });

  it('starts over after firing, so one run is one effect', () => {
    const matcher = createSequenceMatcher('ab');
    assert.equal(matcher.push('a'), false);
    assert.equal(matcher.push('b'), true);
    assert.equal(matcher.push('b'), false);
  });

  it('ignores anything that is not a single character', () => {
    const matcher = createSequenceMatcher('ab');
    matcher.push('a');
    assert.equal(matcher.push('Shift'), false);
    assert.equal(matcher.push('b'), true);
  });

  it('leaves a person typing in a form field alone', () => {
    assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
    assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
    assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
    assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
    assert.equal(isTypingTarget({ tagName: 'DIV' }), false);
    assert.equal(isTypingTarget(null), false);
  });
});

describe('the typewriter treatment', () => {
  const delay = (ms) => new Promise(resolve => { setTimeout(resolve, ms); });

  // A stand-in for the document: it holds one handler per event type and the
  // set of classes on the body, which is all this module touches.
  const makeDoc = () => {
    const handlers = new Map();
    const classes = new Set();
    return {
      body: {
        classList: {
          add: (name) => classes.add(name),
          remove: (name) => classes.delete(name),
        },
      },
      addEventListener: (type, handler) => handlers.set(type, handler),
      removeEventListener: (type) => handlers.delete(type),
      fire: (type, event = {}) => handlers.get(type)?.(event),
      wearing: () => classes.has(TYPEWRITER_CLASS),
    };
  };

  const typeSequence = (doc, target = { tagName: 'BODY' }) => {
    for (const character of TYPEWRITER_SEQUENCE.split('')) {
      doc.fire('keydown', { key: character, target });
    }
  };

  // Always remove the listener and the pending timer, even when a check
  // fails, so one bad assertion cannot hold the test run open.
  const withEgg = async (durationMs, run) => {
    const doc = makeDoc();
    const teardown = installTypewriterEgg({ doc, durationMs });
    try {
      await run(doc, teardown);
    } finally {
      teardown();
    }
  };

  it('waits for the visitor before it puts the page back', async () => {
    await withEgg(5, async (doc) => {
      typeSequence(doc);
      assert.equal(doc.wearing(), true);

      await delay(40);
      // The timer only marks the treatment as spent. Swapping the font back
      // reflows the page, so it never happens on its own while someone is
      // reading. An unasked-for reflow counts against the page's layout-shift
      // score; one that follows a key or a click does not.
      assert.equal(doc.wearing(), true);

      doc.fire('pointerdown', {});
      assert.equal(doc.wearing(), false);
    });
  });

  it('lets Escape end it from inside a form field', async () => {
    await withEgg(200, async (doc) => {
      typeSequence(doc);
      assert.equal(doc.wearing(), true);

      doc.fire('keydown', { key: 'Escape', target: { tagName: 'INPUT' } });
      assert.equal(doc.wearing(), false);
    });
  });

  it('ignores the sequence typed into the search box', async () => {
    await withEgg(200, async (doc) => {
      typeSequence(doc, { tagName: 'INPUT' });
      assert.equal(doc.wearing(), false);
    });
  });

  it('takes the treatment off when it is removed', async () => {
    await withEgg(200, async (doc, teardown) => {
      typeSequence(doc);
      teardown();
      assert.equal(doc.wearing(), false);
    });
  });
});

describe('the broken-record streak', () => {
  it('fires on the fifth quick click and then starts over', () => {
    const counter = createRapidRepeatCounter();
    for (let click = 1; click < BROKEN_RECORD_CLICKS; click += 1) {
      assert.equal(counter.register('Press criticism', click * 100), false);
    }
    assert.equal(counter.register('Press criticism', BROKEN_RECORD_CLICKS * 100), true);
    assert.equal(counter.register('Press criticism', BROKEN_RECORD_CLICKS * 100 + 100), false);
  });

  it('restarts when the clicks are slow', () => {
    const counter = createRapidRepeatCounter({ threshold: 2, windowMs: 100 });
    assert.equal(counter.register('Ethics', 0), false);
    assert.equal(counter.register('Ethics', 1000), false);
    assert.equal(counter.register('Ethics', 1050), true);
  });

  it('restarts when a different category is clicked', () => {
    const counter = createRapidRepeatCounter({ threshold: 2, windowMs: BROKEN_RECORD_WINDOW_MS });
    assert.equal(counter.register('Ethics', 0), false);
    assert.equal(counter.register('Media theory', 50), false);
    assert.equal(counter.register('Media theory', 100), true);
  });

  it('summarises how long a category has been repeating itself', () => {
    const records = [
      { id: 'a', year: '1994', categories: ['Press criticism'] },
      { id: 'b', year: '2011', categories: ['Press criticism', 'Ethics'] },
      { id: 'c', year: '2024', categories: ['Ethics'] },
    ];

    const summary = summarizeBrokenRecord('Press criticism', records);
    assert.deepEqual(summary, {
      category: 'Press criticism',
      count: 2,
      firstYear: '1994',
      lastYear: '2011',
    });
    assert.match(brokenRecordLine(summary), /^Broken record: 2 records filed under Press criticism, 1994 to 2011\./);
  });

  it('says nothing about a category with a single record', () => {
    const records = [{ id: 'a', year: '1994', categories: ['Odd one out'] }];
    assert.equal(summarizeBrokenRecord('Odd one out', records), null);
    assert.equal(brokenRecordLine(null), '');
  });
});

describe('the class of 1986 search', () => {
  it('matches the year on its own, with or without stray spaces', () => {
    assert.equal(isDissertationYearQuery(DISSERTATION_YEAR), true);
    assert.equal(isDissertationYearQuery('  1986  '), true);
  });

  it('leaves every other search alone', () => {
    for (const query of ['1986 press', 'in 1986', '19861', '', null, undefined]) {
      assert.equal(isDissertationYearQuery(query), false);
    }
  });
});

describe('the console watchdog', () => {
  it('barks once per load and never again', () => {
    const lines = [];
    const fakeConsole = { log: (...args) => lines.push(args) };

    assert.equal(logWatchdog(fakeConsole), true);
    assert.equal(logWatchdog(fakeConsole), false);
    assert.equal(lines.length, 1);
    assert.ok(lines[0][0].includes(WATCHDOG_MESSAGE));
    assert.ok(lines[0][0].includes(WATCHDOG_ART.split('\n')[1]));
  });

  it('keeps its module state itself, with no page storage', () => {
    assert.doesNotMatch(watchdogSrc, /localStorage|sessionStorage|indexedDB/);
  });
});

describe('the hidden route', () => {
  it('is part of the route vocabulary and parses from the hash', async () => {
    const viewStatePath = path.join(rootDir, 'frontend', 'services', 'viewState.js');
    const query = read('frontend', 'services', 'router.js')
      .match(/from\s+['"]\.\/viewState\.js(\?v=[^'"]+)?['"]/)?.[1] || '';
    const viewState = await import(pathToFileURL(viewStatePath).href + query);

    assert.equal(viewState.ROUTES.nowhere, 'nowhere');
    assert.equal(
      viewState.parseViewState('https://pressthink.org/j/rosen-archive/#nowhere').route,
      'nowhere',
    );
    assert.ok(
      viewState.viewStateToUrl(
        { route: viewState.ROUTES.nowhere },
        'https://pressthink.org/j/rosen-archive/',
      ).endsWith('#nowhere'),
    );
  });

  it('renders its own page and skips the core data load', () => {
    assert.match(appSrc, /NON_RECORD_ROUTES\s*=\s*new Set\(\[[\s\S]*ROUTES\.nowhere/);
    assert.match(appSrc, /currentRoute === ROUTES\.nowhere[\s\S]*<\$\{NowherePage\}/);
  });

  it('stays out of the site navigation', () => {
    assert.doesNotMatch(appSrc, /goTo\(ROUTES\.nowhere\)|navigateTo\(ROUTES\.nowhere\)/);
    for (const source of [sidebarSrc, read('frontend', 'components', 'ToolsModal.js')]) {
      assert.doesNotMatch(source, /nowhere/i);
    }
  });

  it('carries one line, a way onward, and a way back', () => {
    assert.match(nowhereSrc, /NOWHERE_LINE/);
    assert.match(nowhereSrc, /data-route-entry-focus[\s\S]*tabIndex="-1"/);
    assert.match(nowhereSrc, /Read the essay/);
    assert.match(nowhereSrc, /Return to the archive/);
    assert.equal(NOWHERE_LINE, 'There is no view from nowhere.');
    assert.match(appSrc, new RegExp(`canonicalRecordUrl\\(window\\.location\\.href, NOWHERE_RECORD_ID\\)`));
    assert.match(NOWHERE_RECORD_ID, /^RECORD-\d{5}$/);
  });

  it('fills the page shell without outgrowing it', () => {
    // The page sits inside a min-h-screen flex column. A viewport-height rule
    // here pushed the column past the viewport whenever the update notice was
    // showing, so an empty one-line page picked up a scrollbar.
    const block = cssSrc.match(/\.archive-nowhere \{[^}]*\}/)?.[0] || '';
    assert.match(block, /flex: 1 1 auto/);
    assert.doesNotMatch(block, /min-height:\s*100(vh|dvh)/);
  });
});

describe('the notes above the results', () => {
  it('are dismissible, with a full-size close target', () => {
    assert.match(noteSrc, /aria-label="Dismiss note"/);
    assert.match(noteSrc, /p-3/);
    assert.match(noteSrc, /onClick=\$\{onDismiss\}/);
  });

  it('are notes, not dialogs or landmarks, so nothing traps focus', () => {
    assert.match(noteSrc, /role="note"/);
    assert.doesNotMatch(noteSrc, /role="dialog"|aria-modal|<aside/);
  });

  it('surface the dissertation year and the broken record from App', () => {
    assert.match(appSrc, /showYearNote[\s\S]*<\$\{EasterEggNote\}[\s\S]*DISSERTATION_YEAR_NOTE/);
    assert.match(appSrc, /Read the dissertation/);
    assert.match(appSrc, /showBrokenRecordNote[\s\S]*<\$\{EasterEggNote\}[\s\S]*brokenRecordLine\(brokenRecord\)/);
  });

  it('come back for the next visitor who searches the year again', () => {
    assert.match(appSrc, /if \(!dissertationYearSearch\) setYearNoteDismissed\(false\)/);
  });
});

describe('the wiring in the archive shell', () => {
  it('counts category streaks without changing how the filter behaves', () => {
    assert.match(sidebarSrc, /onCategoryStreak = null/);
    // The counter is built on first use, not on every render.
    assert.match(sidebarSrc, /categoryStreak = useRef\(null\)/);
    assert.match(sidebarSrc, /categoryStreak\.current = createRapidRepeatCounter\(\)/);
    assert.match(sidebarSrc, /if \(onCategoryStreak && countCategoryClick\(cat\)\)/);
    assert.match(appSrc, /onCategoryStreak=\$\{handleCategoryStreak\}/);
  });

  it('keeps the broken-record note on screen once it lands', () => {
    // The note used to be cleared by an effect watching filters.categories.
    // Five clicks on one chip flip it back to unselected, so that effect ran
    // in the same commit that set the note and the line was gone before anyone
    // could read it. The note now leaves only when the visitor dismisses it.
    const clears = appSrc.match(/setBrokenRecord\(null\)/g) || [];
    assert.equal(clears.length, 1);
    assert.match(appSrc, /onDismiss=\$\{\(\) => setBrokenRecord\(null\)\}/);
    assert.doesNotMatch(appSrc, /filters\.categories\.includes\(brokenRecord\.category\)/);
  });

  it('keeps the skip off by default and ends it on a timer', () => {
    assert.match(resultsSrc, /skipping = false/);
    assert.match(resultsSrc, /archive-results--skipping/);
    assert.match(appSrc, /setTimeout\(\(\) => setRecordsSkipping\(false\), BROKEN_RECORD_SKIP_MS\)/);
  });

  it('reveals the About line after two quiet minutes, with no interruption', () => {
    assert.equal(IDLE_REVEAL_MS, 120000);
    assert.match(aboutSrc, /IDLE_REVEAL_MS/);
    assert.match(aboutSrc, /idleLineShown && html`[\s\S]*IDLE_LINE/);
    assert.doesNotMatch(aboutSrc, /aria-live|\.focus\(/);
    assert.equal(IDLE_LINE, "Still here? Then you're no longer the audience.");
  });

  it('starts the console watchdog and the typewriter once, at mount', () => {
    assert.equal((indexSrc.match(/logWatchdog\(\)/g) || []).length, 1);
    assert.equal((indexSrc.match(/installTypewriterEgg\(\)/g) || []).length, 1);
    assert.match(indexSrc, /try \{[\s\S]*?installTypewriterEgg\(\);[\s\S]*?\} catch/);
  });

  it('leaves the search box and the forms alone', () => {
    assert.match(typewriterSrc, /isTypingTarget\(event\.target\)\) return/);
  });
});

describe('the house rules', () => {
  const eggSources = [
    eggUtilsSrc,
    watchdogSrc,
    typewriterSrc,
    noteSrc,
    nowhereSrc,
  ];

  it('play no sound anywhere', () => {
    for (const source of eggSources) {
      assert.doesNotMatch(source, /new Audio\(|AudioContext|\.play\(/);
    }
  });

  it('drop the movement under reduced motion and keep the words', () => {
    assert.match(
      cssSrc,
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.archive-results--skipping \{\s*animation: none;/,
    );
    assert.match(
      cssSrc,
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.archive-idle-line \{\s*animation: archive-idle-fade/,
    );
    // The typewriter is a font swap, so there is no motion to reduce.
    assert.doesNotMatch(
      cssSrc,
      /\.archive-typewriter-egg[^{]*\{[^}]*animation:/,
    );
  });
});
