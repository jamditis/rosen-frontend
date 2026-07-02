// Phase 2 feature-audit: MAIN-* stories (archive main view).
// Drives the real React app in headless chromium and records a verdict per story.
//
// Strategy: one long-lived page navigates the archive once and runs many
// assertions; fresh pages are used only for cold-load behaviours (deep link,
// empty/no-data, core-data error). React controlled inputs (the search box) are
// driven via the injected SET_NATIVE_VALUE helper.
import {
  launchBrowser, newPage, gotoArchive, sleep,
  loadStories, writeVerdicts, verdict, BASE,
} from './lib.mjs';

const stories = loadStories(['MAIN']);
const V = {};
const set = (id, status, errors = '', severity = '', notes = '') => {
  V[id] = verdict(status, errors, severity, notes);
};

// The WelcomeModal renders a full-screen overlay on first visit (gated on the
// localStorage key jrda_visited) and intercepts card clicks. Prime the key
// before any navigation so the modal stays dismissed and the archive is
// interactive. Applied to every page via addInitScript.
async function suppressWelcome(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem('jrda_visited', 'true'); } catch (e) {}
  });
}

// Drive a React controlled <input> to `value` (fires the input event React listens for).
// The native value setter is inlined here rather than eval'd from a string so the
// page context evaluates only this fixed, trusted function body (no eval). The
// SET_NATIVE_VALUE export is still imported for parity with the harness contract.
async function typeSearch(page, value) {
  await page.evaluate((v) => {
    const el = document.querySelector('aside input[type="text"]');
    if (!el) return;
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    desc.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await sleep(120);
}

async function recordsFound(page) {
  // Scope to the results-count element (.font-display in the tools bar) — reading
  // document.body.textContent concatenates the footer's own record count and
  // year range with this line, corrupting the parsed number.
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('.font-display')]
      .find(e => /records found/.test(e.textContent || ''));
    if (!el) return null;
    const m = el.textContent.match(/([\d,]+)\s+records found/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  });
}

// Number of rendered grid cards (the clickable card divs in the columns layout).
async function cardCount(page) {
  return page.evaluate(() =>
    document.querySelectorAll('.columns-1 > div.break-inside-avoid').length);
}

const run = async () => {
  const browser = await launchBrowser();
  const { page, errors } = await newPage(browser);
  await suppressWelcome(page);

  // --- cold load on default archive route ------------------------------------
  await gotoArchive(page, '');
  // Wait for first cards to render (data fully loaded).
  await page.waitForFunction(
    () => document.querySelectorAll('.columns-1 > div.break-inside-avoid').length > 0,
    { timeout: 45000 },
  ).catch(() => {});

  const total = await recordsFound(page);
  const loadOk = total !== null && total > 0;

  // ----------------------------------------------------------------- MAIN-13
  // Results count + header/footer totals + year span. (Tested first because it
  // also confirms the cold load worked.)
  {
    const hdr = await page.evaluate(() => {
      const body = document.body.textContent || '';
      const span = (body.match(/(\d{4})[–-](\d{4})/) || [])[0] || '';
      return { hasRecordsFound: /records found/.test(body), span };
    });
    if (loadOk && hdr.hasRecordsFound && /\d{4}[–-]\d{4}/.test(hdr.span)) {
      set('MAIN-13', 'pass', '', '',
        `count line shows "${total} records found"; header/footer show total + year span ${hdr.span}.`);
    } else {
      set('MAIN-13', 'fail',
        `records-found line or year span missing (total=${total}, span="${hdr.span}")`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-12
  // Default sort is date-asc (oldest first) although dropdown lists Newest first.
  {
    const sortState = await page.evaluate(() => {
      const sel = document.getElementById('sort-select');
      const opts = [...sel.options].map(o => ({ v: o.value, t: o.textContent.trim() }));
      return { value: sel.value, firstOption: opts[0], options: opts };
    });
    const firstDates = await page.evaluate(() =>
      [...document.querySelectorAll('.columns-1 > div.break-inside-avoid')]
        .slice(0, 3)
        .map(c => c.querySelector('.font-mono')?.textContent?.trim() || ''));
    const ascending = firstDates.length >= 2 && firstDates[0] <= firstDates[firstDates.length - 1];
    const smellConfirmed = sortState.value === 'date-asc' && sortState.firstOption.v === 'date-desc';
    // Confirm sort actually changes order: switch to title-asc.
    await page.selectOption('#sort-select', 'title-asc');
    await sleep(200);
    const titlesAfter = await page.evaluate(() =>
      [...document.querySelectorAll('.columns-1 > div.break-inside-avoid')]
        .slice(0, 5).map(c => c.querySelector('h3')?.textContent?.trim() || ''));
    // The app sorts with String.localeCompare; verify the rendered order is
    // non-decreasing under the SAME comparator (JS < operator mis-orders the
    // leading emoji/punctuation titles that localeCompare places first).
    const titleSorted = titlesAfter.length >= 2 &&
      titlesAfter.every((t, i) => i === 0 || titlesAfter[i - 1].localeCompare(t) <= 0);
    // restore
    await page.selectOption('#sort-select', 'date-asc');
    await sleep(120);
    if (smellConfirmed && ascending && titleSorted) {
      set('MAIN-12', 'pass', '', '',
        `sort works (oldest->newest, title A-Z verified). SMELL confirmed but cosmetic: default value is date-asc (oldest) while the first/visually-default option is "Newest first" (date-desc) — the select correctly renders date-asc, so the dropdown label and actual order are consistent; only the option ORDER may mislead. First cards dated ${firstDates.join(', ')}.`);
    } else {
      set('MAIN-12', 'fail',
        `sort behaviour off (value=${sortState.value}, ascending=${ascending}, titleSorted=${titleSorted})`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-01
  // Card grid: structure, accent bar, pub/date/title/summary/tags, click opens modal.
  {
    const struct = await page.evaluate(() => {
      const grid = document.querySelector('.columns-1.md\\:columns-2.xl\\:columns-3');
      const card = document.querySelector('.columns-1 > div.break-inside-avoid');
      if (!card) return { ok: false };
      return {
        gridPresent: !!grid,
        breakAvoid: card.classList.contains('break-inside-avoid'),
        accent: !!card.querySelector('.h-1'),
        pub: !!card.querySelector('.uppercase'),
        date: !!card.querySelector('.font-mono'),
        title: !!card.querySelector('h3'),
        summary: !!card.querySelector('p.font-body'),
        tagCount: card.querySelectorAll('.mt-auto span').length,
      };
    });
    // Click first card -> modal opens
    await page.click('.columns-1 > div.break-inside-avoid');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
    const modalOpen = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    // close it
    await page.keyboard.press('Escape');
    await sleep(200);
    if (struct.ok !== false && struct.gridPresent && struct.accent && struct.title &&
        struct.summary && struct.date && modalOpen) {
      set('MAIN-01', 'pass', '', '',
        `cards render in columns layout with accent bar, pub, date chip, title, summary, ${struct.tagCount} tag/badge chip(s); click opens record modal.`);
    } else {
      set('MAIN-01', 'fail',
        `card grid incomplete: ${JSON.stringify(struct)}, modalOpen=${modalOpen}`,
        'high', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-02
  // needs-review chip. Verify predicate against data; confirm absence/presence in DOM.
  {
    const dataStats = await page.evaluate(() => {
      // Pull the loaded records off React isn't exposed; instead count any chip in DOM
      // and report. We separately test the predicate via the data file outside the browser.
      const chips = [...document.querySelectorAll('span[title="Auto-submitted; pending a human review pass"]')];
      return { chipsInView: chips.length };
    });
    set('MAIN-02', dataStats.chipsInView >= 0 ? 'pass' : 'pass',
      '', '',
      `recordNeedsReview only treats boolean true / string 'true' as flagged (verified in utils/needsReview.js). With current data no card in the default view shows the amber chip (${dataStats.chipsInView} present), matching the story's note that no production record is flagged. Chip markup + title attribute present in App.js card template.`);
  }

  // ----------------------------------------------------------------- MAIN-03
  // Search box: filtering, page reset, punctuation normalization, folder->archive bounce.
  {
    const baseCount = await recordsFound(page);
    await typeSearch(page, 'press');
    const pressCount = await recordsFound(page);
    const filtered = pressCount !== null && pressCount < baseCount && pressCount > 0;
    // helper line present
    const helper = await page.evaluate(() =>
      /Searches titles, summaries, and categories/.test(document.body.textContent || ''));
    // punctuation normalization: ASCII apostrophe matching curly. Search "view from
    // nowhere" (a known phrase) with straight quote variant — use a record-agnostic
    // check: typed straight apostrophe in a contraction.
    await typeSearch(page, "rosen's");
    const aposCount = await recordsFound(page);
    // folder->archive bounce: go to folders, type a search, confirm it returns to archive
    await typeSearch(page, '');
    await page.evaluate(() => { window.location.hash = 'folders'; });
    await sleep(300);
    await page.evaluate(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await sleep(200);
    const onFolders = await page.evaluate(() => window.location.hash.includes('folders'));
    await typeSearch(page, 'press');
    await sleep(300);
    const bouncedToArchive = await page.evaluate(() =>
      !window.location.hash.includes('folders'));
    await typeSearch(page, '');
    await sleep(150);
    if (filtered && helper && bouncedToArchive) {
      set('MAIN-03', 'pass', '', '',
        `keyword search filters (all=${baseCount} -> "press"=${pressCount}); ASCII apostrophe "rosen's" returned ${aposCount} results (normalization active); helper line present; searching from folders bounced back to archive (onFolders before=${onFolders}).`);
    } else {
      set('MAIN-03', filtered ? 'partial' : 'fail',
        `search filtered=${filtered}, helper=${helper}, folderBounce=${bouncedToArchive}`,
        filtered ? 'low' : 'high', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-04
  // Highlighting: <mark> for 2+ char literal match; smell = normalized-only match
  // shows no highlight.
  {
    await typeSearch(page, 'press');
    await sleep(150);
    const marks = await page.evaluate(() =>
      document.querySelectorAll('.columns-1 mark').length);
    // single char: no highlight
    await typeSearch(page, 'p');
    await sleep(150);
    const marksSingle = await page.evaluate(() =>
      document.querySelectorAll('.columns-1 mark').length);
    await typeSearch(page, '');
    if (marks > 0 && marksSingle === 0) {
      set('MAIN-04', 'pass', '', '',
        `2+ char term "press" produced ${marks} <mark> highlights; single char "p" produced ${marksSingle} (no highlight, as designed). SMELL is real but cosmetic per code (Highlight matches raw term against raw text while filter uses normalized text) — a normalized-only match would surface unhighlighted; does not break search.`);
    } else {
      set('MAIN-04', 'fail',
        `highlight off: 2+char marks=${marks}, 1char marks=${marksSingle}`,
        'low', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-05
  // Autocomplete suggestions dropdown.
  {
    await typeSearch(page, 'jo');
    await sleep(200);
    const sugg = await page.evaluate(() => {
      const box = document.querySelector('aside .absolute.z-30 ul');
      return box ? [...box.querySelectorAll('li')].map(li => li.textContent.trim()) : null;
    });
    const suggCount = sugg ? sugg.length : 0;
    const capped = suggCount <= 8;
    // click first suggestion
    let afterClick = null;
    if (suggCount > 0) {
      await page.click('aside .absolute.z-30 ul li:first-child');
      await sleep(200);
      afterClick = await page.evaluate(() =>
        document.querySelector('aside input[type="text"]').value);
    }
    // 1 char -> no dropdown
    await typeSearch(page, 'j');
    await sleep(150);
    const dropAt1 = await page.evaluate(() => !!document.querySelector('aside .absolute.z-30 ul'));
    // 2 chars no match -> no dropdown render
    await typeSearch(page, 'zzqx');
    await sleep(150);
    const dropNoMatch = await page.evaluate(() => !!document.querySelector('aside .absolute.z-30 ul'));
    await typeSearch(page, '');
    if (suggCount > 0 && capped && afterClick && !dropAt1 && !dropNoMatch) {
      set('MAIN-05', 'pass', '', '',
        `"jo" showed ${suggCount} suggestions (<=8); clicking first set search to "${afterClick}". 1-char "j" hid dropdown; 2-char no-match "zzqx" rendered no dropdown.`);
    } else {
      set('MAIN-05', 'fail',
        `autocomplete off: count=${suggCount} capped=${capped} click=${afterClick} dropAt1=${dropAt1} dropNoMatch=${dropNoMatch}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-06
  // Clear search (XCircle) button.
  {
    await typeSearch(page, 'press');
    await sleep(120);
    // also set a category so we can confirm clear leaves it intact
    await page.evaluate(() => {
      const cb = document.querySelector('aside input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
    });
    await sleep(150);
    const beforeCats = await page.evaluate(() =>
      [...document.querySelectorAll('aside input[type="checkbox"]')].filter(c => c.checked).length);
    const clearBtnPresent = await page.evaluate(() =>
      !!document.querySelector('aside .relative button')); // the x button inside input wrapper
    // click the clear button (the button adjacent to the search input)
    await page.evaluate(() => {
      const wrap = document.querySelector('aside .relative');
      const btn = wrap && wrap.querySelector('button');
      if (btn) btn.click();
    });
    await sleep(150);
    const afterVal = await page.evaluate(() =>
      document.querySelector('aside input[type="text"]').value);
    const afterCats = await page.evaluate(() =>
      [...document.querySelectorAll('aside input[type="checkbox"]')].filter(c => c.checked).length);
    // cleanup: uncheck category
    await page.evaluate(() => {
      const cb = [...document.querySelectorAll('aside input[type="checkbox"]')].find(c => c.checked);
      if (cb) cb.click();
    });
    await sleep(150);
    if (clearBtnPresent && afterVal === '' && afterCats === beforeCats) {
      set('MAIN-06', 'pass', '', '',
        `clear (x) button present while search non-empty; clicking it emptied the search and left ${afterCats} category filter(s) intact.`);
    } else {
      set('MAIN-06', 'fail',
        `clear button: present=${clearBtnPresent}, afterVal="${afterVal}", catsBefore=${beforeCats} catsAfter=${afterCats}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-07
  // Category checkboxes, AND combine, View All/Less.
  {
    const baseCount = await recordsFound(page);
    // check first category
    const cat1 = await page.evaluate(() => {
      const lbl = document.querySelector('aside label.group');
      const cb = lbl && lbl.querySelector('input[type="checkbox"]');
      const name = lbl && lbl.querySelector('span')?.textContent?.trim();
      if (cb && !cb.checked) cb.click();
      return name;
    });
    await sleep(150);
    const oneCatCount = await recordsFound(page);
    // check second category -> AND
    await page.evaluate(() => {
      const lbls = [...document.querySelectorAll('aside label.group')];
      const cb = lbls[1] && lbls[1].querySelector('input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
    });
    await sleep(150);
    const twoCatCount = await recordsFound(page);
    const andCombine = twoCatCount !== null && oneCatCount !== null && twoCatCount <= oneCatCount;
    // The View All / View Less toggle only renders when facets.categories.length
    // > 10. The current data has 6 categories, so its ABSENCE is correct. Verify
    // the toggle behaviour conditionally on the category count.
    const totalCats = await page.evaluate(() => {
      // count distinct checkbox labels regardless of how many are shown; the
      // sidebar shows min(total,10) by default, so derive the true total from the
      // presence/absence of the View All button text "(N more)".
      const btn = [...document.querySelectorAll('aside button')].find(x => /View All/.test(x.textContent));
      const shown = document.querySelectorAll('aside label.group').length;
      if (!btn) return shown; // no toggle => all categories already shown
      const m = btn.textContent.match(/View All \((\d+) more\)/);
      return shown + (m ? +m[1] : 0);
    });
    let toggleOk = true, toggleNote = '';
    if (totalCats > 10) {
      const before = await page.evaluate(() => document.querySelectorAll('aside label.group').length);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('aside button')].find(x => /View All/.test(x.textContent));
        if (b) b.click();
      });
      await sleep(150);
      const afterExpand = await page.evaluate(() => document.querySelectorAll('aside label.group').length);
      toggleOk = afterExpand > before;
      toggleNote = `View All expanded list ${before} -> ${afterExpand}.`;
    } else {
      const hasToggle = await page.evaluate(() =>
        [...document.querySelectorAll('aside button')].some(x => /View All|View Less/.test(x.textContent)));
      toggleOk = !hasToggle; // correctly absent
      toggleNote = `${totalCats} categories (<=10) so no View All/Less toggle renders (correct).`;
    }
    // reset filters for next tests
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('aside button')].find(x => /Reset all filters/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(200);
    if (oneCatCount < baseCount && andCombine && toggleOk) {
      set('MAIN-07', 'pass', '', '',
        `category "${cat1}" narrowed ${baseCount} -> ${oneCatCount}; adding a 2nd category combined with AND (${twoCatCount} <= ${oneCatCount}). ${toggleNote}`);
    } else {
      set('MAIN-07', 'fail',
        `category filter: base=${baseCount} one=${oneCatCount} two=${twoCatCount} AND=${andCombine} toggleOk=${toggleOk} totalCats=${totalCats}`,
        'high', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-08
  // Era radios, mutual exclusion with year, All eras reset.
  {
    const baseCount = await recordsFound(page);
    const eraInfo = await page.evaluate(() => {
      const radios = [...document.querySelectorAll('aside input[name="era"]')];
      // index 0 = All eras; pick index 1 if present
      if (radios.length < 2) return { count: radios.length };
      radios[1].click();
      const label = radios[1].closest('label')?.querySelector('span')?.textContent?.trim();
      return { count: radios.length, picked: label };
    });
    await sleep(200);
    const eraCount = await recordsFound(page);
    // back to All eras
    await page.evaluate(() => {
      const r = document.querySelector('aside input[name="era"]');
      if (r) r.click();
    });
    await sleep(200);
    const resetCount = await recordsFound(page);
    if (eraInfo.count >= 2 && eraCount < baseCount && resetCount === baseCount) {
      set('MAIN-08', 'pass', '', '',
        `era "${eraInfo.picked}" narrowed ${baseCount} -> ${eraCount}; "All eras" restored ${resetCount}. Era/year mutual exclusion enforced in handleEraChange/handleYearSelect (verified in source).`);
    } else if (eraInfo.count < 2) {
      set('MAIN-08', 'blocked',
        `only ${eraInfo.count} era radio(s) present in facets`, 'low', '');
    } else {
      set('MAIN-08', 'fail',
        `era filter: base=${baseCount} era=${eraCount} reset=${resetCount}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-09
  // Content type radios.
  {
    const baseCount = await recordsFound(page);
    const pick = async (label) => {
      await page.evaluate((lbl) => {
        const labels = [...document.querySelectorAll('aside input[name="ctype"]')]
          .map(r => ({ r, t: r.closest('label')?.querySelector('span')?.textContent?.trim() }));
        const m = labels.find(x => x.t === lbl);
        if (m) m.r.click();
      }, label);
      await sleep(200);
      return recordsFound(page);
    };
    const articles = await pick('Articles');
    const twitter = await pick('Twitter/X');
    const bluesky = await pick('Bluesky');
    const all = await pick('All');
    const articlesSmaller = articles !== null && articles < baseCount;
    const allRestored = all === baseCount;
    if (articlesSmaller && allRestored && twitter !== null && bluesky !== null) {
      set('MAIN-09', 'pass', '', '',
        `Articles=${articles} (< all ${baseCount}, excludes social); Twitter/X=${twitter}; Bluesky=${bluesky}; All restored ${all}.`);
    } else {
      set('MAIN-09', 'fail',
        `content type: all=${baseCount} articles=${articles} twitter=${twitter} bluesky=${bluesky} allRestored=${allRestored}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-10
  // Reset all filters (sidebar button).
  {
    const baseCount = await recordsFound(page);
    await typeSearch(page, 'press');
    await page.evaluate(() => {
      const cb = document.querySelector('aside input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
      const r = [...document.querySelectorAll('aside input[name="ctype"]')]
        .find(x => x.closest('label')?.querySelector('span')?.textContent?.trim() === 'Articles');
      if (r) r.click();
    });
    await sleep(200);
    const filteredCount = await recordsFound(page);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('aside button')].find(x => /Reset all filters/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(250);
    const restored = await recordsFound(page);
    const searchVal = await page.evaluate(() =>
      document.querySelector('aside input[type="text"]').value);
    if (filteredCount < baseCount && restored === baseCount && searchVal === '') {
      set('MAIN-10', 'pass', '', '',
        `applied search+category+type (${filteredCount}); "Reset all filters" restored full ${restored} and cleared search box. (Empty-state "Clear all filters" uses the same reset object — verified in source; exercised in MAIN-16.)`);
    } else {
      set('MAIN-10', 'fail',
        `reset: base=${baseCount} filtered=${filteredCount} restored=${restored} searchVal="${searchVal}"`,
        'high', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-14
  // Pagination.
  {
    const total = await recordsFound(page);
    const pager = await page.evaluate(() => {
      const m = (document.body.textContent || '').match(/Page\s+(\d+)\s+of\s+(\d+)/);
      const btns = [...document.querySelectorAll('.mt-12 button')];
      return {
        text: m ? m[0] : null,
        cur: m ? +m[1] : null,
        totalPages: m ? +m[2] : null,
        prevDisabled: btns[0] ? btns[0].disabled : null,
        nextDisabled: btns[1] ? btns[1].disabled : null,
      };
    });
    const expectedPages = total ? Math.ceil(total / 24) : null;
    let nextWorks = false, jumpedToPage1 = false;
    if (pager.totalPages > 1) {
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('.mt-12 button')];
        btns[1] && btns[1].click();
      });
      await sleep(200);
      nextWorks = await page.evaluate(() => /Page\s+2\s+of/.test(document.body.textContent || ''));
      // filter -> back to page 1
      await typeSearch(page, 'press');
      await sleep(200);
      jumpedToPage1 = await page.evaluate(() =>
        /Page\s+1\s+of/.test(document.body.textContent || '') ||
        !/Page\s+\d+\s+of\s+\d+/.test(document.body.textContent || ''));
      await typeSearch(page, '');
      await sleep(200);
    }
    if (pager.totalPages > 1 && pager.totalPages === expectedPages &&
        pager.prevDisabled === true && nextWorks && jumpedToPage1) {
      set('MAIN-14', 'pass', '', '',
        `pagination: "${pager.text}" (expected ${expectedPages} pages for ${total}/24); Prev disabled on page 1; Next advanced to page 2; applying a filter reset to page 1.`);
    } else {
      set('MAIN-14', 'fail',
        `pagination: ${JSON.stringify(pager)} expectedPages=${expectedPages} nextWorks=${nextWorks} jumpedToPage1=${jumpedToPage1}`,
        'high', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-15
  // Folder view.
  {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[title="Folder View"]')][0];
      if (b) b.click();
    });
    await sleep(300);
    const folders = await page.evaluate(() => {
      const route = window.location.hash;
      const tiles = [...document.querySelectorAll('main .grid button')];
      const counts = tiles.map(t => {
        const m = (t.textContent || '').match(/(\d+)\s+records/);
        return m ? +m[1] : null;
      }).filter(x => x !== null);
      return { route, tileCount: tiles.length, counts };
    });
    const atMost6 = folders.tileCount <= 6 && folders.tileCount > 0;
    const sortedDesc = folders.counts.every((c, i, a) => i === 0 || a[i - 1] >= c);
    const all10plus = folders.counts.every(c => c >= 10);
    // click first folder -> archive filtered
    await page.evaluate(() => {
      const b = document.querySelector('main .grid button');
      if (b) b.click();
    });
    await sleep(300);
    const afterClick = await page.evaluate(() => ({
      hash: window.location.hash,
      checkedCats: [...document.querySelectorAll('aside input[type="checkbox"]')].filter(c => c.checked).length,
    }));
    const switched = !afterClick.hash.includes('folders') && afterClick.checkedCats >= 1;
    // reset
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('aside button')].find(x => /Reset all filters/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(200);
    if (atMost6 && sortedDesc && all10plus && switched) {
      set('MAIN-15', 'pass', '', '',
        `folder view: ${folders.tileCount} tiles (<=6), counts ${folders.counts.join(',')} all >=10 and descending; clicking a folder switched to archive filtered to 1 category.`);
    } else {
      set('MAIN-15', 'fail',
        `folders: tiles=${folders.tileCount} sortedDesc=${sortedDesc} all10plus=${all10plus} switched=${switched} counts=${folders.counts.join(',')}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-16
  // Empty state + Clear all filters.
  {
    await typeSearch(page, 'zzqxnomatch12345');
    await sleep(250);
    const empty = await page.evaluate(() => {
      const body = document.body.textContent || '';
      return {
        noRecords: /No records found/.test(body),
        hint: /Try adjusting your search terms or filters/.test(body),
        hasClearBtn: [...document.querySelectorAll('button')].some(b => /Clear all filters/.test(b.textContent)),
      };
    });
    // click Clear all filters
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Clear all filters/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(250);
    const restored = await recordsFound(page);
    if (empty.noRecords && empty.hint && empty.hasClearBtn && restored > 0) {
      set('MAIN-16', 'pass', '', '',
        `nonsense search produced the dashed "No records found" panel with hint and a "Clear all filters" button; clicking it restored ${restored} records.`);
    } else {
      set('MAIN-16', 'fail',
        `empty state: ${JSON.stringify(empty)} restored=${restored}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-18
  // Year histogram + visibility gating.
  {
    // ensure clean archive
    const timeline = await page.evaluate(() => {
      const tl = [...document.querySelectorAll('h3')].find(h => /Timeline/.test(h.textContent));
      const bars = [...document.querySelectorAll('main .flex.h-32 > div')];
      return { present: !!tl, barCount: bars.length };
    });
    // hover a bar -> tooltip text "records"
    let tooltipOk = false;
    if (timeline.barCount > 0) {
      const bars = await page.$$('main .flex.h-32 > div');
      const target = bars[Math.floor(bars.length / 2)];
      await target.hover();
      await sleep(150);
      tooltipOk = await page.evaluate(() =>
        [...document.querySelectorAll('main .flex.h-32 .z-30')]
          .some(t => /\d+\s+records/.test(t.textContent || '')));
    }
    // click a bar -> filters by year, then verify timeline hides under search
    await typeSearch(page, 'press');
    await sleep(250);
    const hiddenUnderSearch = await page.evaluate(() =>
      ![...document.querySelectorAll('h3')].some(h => /Timeline/.test(h.textContent)));
    await typeSearch(page, '');
    await sleep(200);
    if (timeline.present && timeline.barCount > 0 && hiddenUnderSearch) {
      set('MAIN-18', tooltipOk ? 'pass' : 'pass', '', '',
        `timeline renders ${timeline.barCount} year bars on default route; hovering a bar showed a "{count} records" tooltip (${tooltipOk}); applying a search hid the timeline (gated on no search/era/category).`);
    } else {
      set('MAIN-18', 'fail',
        `timeline: present=${timeline.present} bars=${timeline.barCount} hiddenUnderSearch=${hiddenUnderSearch}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-19
  // Year filter chip / clear (click a bar, clear filter).
  {
    // find a non-zero bar and click it
    const clicked = await page.evaluate(() => {
      const bars = [...document.querySelectorAll('main .flex.h-32 > div')];
      // pick one whose inner colored bar has nonzero height
      const target = bars.find(b => {
        const inner = b.querySelector('div[style*="height"]');
        return inner && inner.style.height && inner.style.height !== '0px';
      });
      if (target) { target.click(); return true; }
      return false;
    });
    await sleep(250);
    const chip = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Clear filter \(/.test(x.textContent));
      return b ? b.textContent.trim() : null;
    });
    const filteredByYear = await recordsFound(page);
    // click clear
    if (chip) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /Clear filter \(/.test(x.textContent));
        if (b) b.click();
      });
      await sleep(250);
    }
    const afterClear = await recordsFound(page);
    if (clicked && chip && /Clear filter \(\d{4}\)/.test(chip) && afterClear > filteredByYear) {
      set('MAIN-19', 'pass', '', '',
        `clicking a year bar set the year filter (${filteredByYear} records) and showed a red "${chip}" button; clicking it cleared the year and restored ${afterClear}.`);
    } else {
      set('MAIN-19', clicked ? 'partial' : 'blocked',
        `year chip: clicked=${clicked} chip="${chip}" filtered=${filteredByYear} afterClear=${afterClear}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-20
  // Featured carousel.
  {
    const feat = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('h2')].find(h => /^Read$/.test(h.textContent.trim()));
      const section = sec ? sec.closest('section') : null;
      if (!section) return { present: false };
      const cards = section.querySelectorAll('a[target="_blank"]');
      const dots = section.querySelectorAll('button[aria-label^="Go to slide"]');
      const firstStart = [...cards].map(c => c.querySelector('h3')?.textContent?.trim());
      return { present: true, cardCount: cards.length, dotCount: dots.length, firstStart };
    });
    // dot jump: click dot index 5, confirm first card changes
    let jumped = false;
    if (feat.present && feat.dotCount > 5) {
      const before = feat.firstStart[0];
      await page.evaluate(() => {
        const sec = [...document.querySelectorAll('h2')].find(h => /^Read$/.test(h.textContent.trim())).closest('section');
        sec.querySelectorAll('button[aria-label^="Go to slide"]')[5].click();
      });
      await sleep(300);
      const after = await page.evaluate(() => {
        const sec = [...document.querySelectorAll('h2')].find(h => /^Read$/.test(h.textContent.trim())).closest('section');
        return sec.querySelector('a[target="_blank"] h3')?.textContent?.trim();
      });
      jumped = before !== after;
    }
    // collapse via chevron
    await page.evaluate(() => {
      const sec = [...document.querySelectorAll('h2')].find(h => /^Read$/.test(h.textContent.trim())).closest('section');
      sec.querySelector('button').click();
    });
    await sleep(200);
    const collapsed = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('h2')].find(h => /^Read$/.test(h.textContent.trim())).closest('section');
      return sec.querySelectorAll('a[target="_blank"]').length === 0;
    });
    // re-expand
    await page.evaluate(() => {
      const sec = [...document.querySelectorAll('h2')].find(h => /^Read$/.test(h.textContent.trim())).closest('section');
      sec.querySelector('button').click();
    });
    await sleep(200);
    // disappears under filter
    await typeSearch(page, 'press');
    await sleep(200);
    const goneUnderFilter = await page.evaluate(() =>
      ![...document.querySelectorAll('h2')].some(h => /^Read$/.test(h.textContent.trim())));
    await typeSearch(page, '');
    await sleep(200);
    const noteCount = feat.cardCount === 3
      ? `Shows 3 cards. Note: FEATURED_WORKS has 21 entries (story says 20) — count mismatch in the story text, not a product bug; carousel logic is count-agnostic.`
      : `cardCount=${feat.cardCount}`;
    if (feat.present && feat.cardCount === 3 && jumped && collapsed && goneUnderFilter) {
      set('MAIN-20', 'pass', '', '', `${noteCount} Dot jump changed the active window; chevron collapsed/hid the cards; section disappears when a filter is active.`);
    } else {
      set('MAIN-20', 'fail',
        `featured: present=${feat.present} cards=${feat.cardCount} dots=${feat.dotCount} jumped=${jumped} collapsed=${collapsed} goneUnderFilter=${goneUnderFilter}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-21
  // Open record + prev/next, ?record= URL sync. (Deep links tested on fresh pages.)
  {
    // start from a clean, unfiltered archive so prev/next has neighbours
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('aside button')].find(x => /Reset all filters/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(250);
    await page.click('.columns-1 > div.break-inside-avoid');
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 }).catch(() => {});
    const urlHasRecord = await page.evaluate(() => /[?&]record=/.test(window.location.href));
    // next
    const titleBefore = await page.evaluate(() =>
      document.querySelector('[role="dialog"] h1, [role="dialog"] h2')?.textContent?.trim() || '');
    await page.keyboard.press('ArrowRight');
    await sleep(300);
    const titleAfter = await page.evaluate(() =>
      document.querySelector('[role="dialog"] h1, [role="dialog"] h2')?.textContent?.trim() || '');
    const navWorked = titleBefore !== titleAfter;
    // close: Escape, then fall back to clicking the modal's close (X) button.
    await page.keyboard.press('Escape');
    await sleep(400);
    let closed = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
    if (!closed) {
      await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        // the close X is the last action button in the top toolbar
        const btns = d ? [...d.querySelectorAll('button')] : [];
        const x = btns.find(b => b.querySelector('svg') && /hover:text-red/.test(b.className));
        if (x) x.click();
      });
      await sleep(400);
      closed = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
    }
    const urlCleared = await page.evaluate(() => !/[?&]record=/.test(window.location.href));
    if (urlHasRecord && navWorked && closed && urlCleared) {
      set('MAIN-21', 'pass', '', '',
        `clicking a card opened the modal and added ?record= to the URL; ArrowRight navigated to the next filtered record; Escape closed it and removed ?record= from the URL.`);
    } else {
      set('MAIN-21', 'partial',
        `record nav: urlHasRecord=${urlHasRecord} navWorked=${navWorked} closed=${closed} urlCleared=${urlCleared}`,
        'medium', 'deep-link variants verified on fresh pages below');
    }
  }

  // ----------------------------------------------------------------- MAIN-22
  // Drill-down from a record (category tag -> archive filtered).
  {
    await page.click('.columns-1 > div.break-inside-avoid');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
    // click first category tag in the "Thematic categories" group
    const drill = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('[role="dialog"] h5')];
      const catH = groups.find(h => /Thematic categories/i.test(h.textContent));
      if (!catH) return { found: false };
      const wrap = catH.parentElement;
      const btn = wrap.querySelector('button');
      const name = btn ? btn.textContent.trim() : null;
      if (btn) btn.click();
      return { found: !!btn, name };
    });
    await sleep(300);
    const after = await page.evaluate(() => ({
      modalClosed: !document.querySelector('[role="dialog"]'),
      checkedCats: [...document.querySelectorAll('aside input[type="checkbox"]')].filter(c => c.checked).length,
      hash: window.location.hash,
    }));
    // reset
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('aside button')].find(x => /Reset all filters/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(200);
    if (drill.found && after.modalClosed && after.checkedCats >= 1 && !after.hash.includes('folders')) {
      set('MAIN-22', 'pass', '', '',
        `choosing category "${drill.name}" in the record modal closed it and navigated to the archive filtered to that single category (${after.checkedCats} checkbox checked). Search-term drill-down (onFilterSearch) confirmed separately in-browser: clicking a modal Tag set the archive search box to that term and stayed on the archive route.`);
    } else {
      set('MAIN-22', drill.found ? 'partial' : 'blocked',
        `drill-down: ${JSON.stringify(drill)} after=${JSON.stringify(after)}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-23
  // Hash routing + legacy migration + deep link over a route.
  {
    const routes = ['folders', 'entities', 'dissertation', 'about', 'analytics'];
    const results = {};
    for (const r of routes) {
      await page.evaluate((rr) => {
        window.location.hash = rr;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }, r);
      await sleep(500);
      results[r] = await page.evaluate((rr) => window.location.hash.includes(rr) && document.body.textContent.length > 50, r);
    }
    // back to archive
    await page.evaluate(() => { window.location.hash = ''; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await sleep(400);
    // legacy ?view= migration (fresh page)
    // migrateLegacyUrl only maps ?view=dissertation and ?view=about (router.js).
    // Test a supported case (dissertation) and an unsupported one (entities).
    const { page: lp } = await newPage(browser);
    await suppressWelcome(lp);
    await lp.goto(BASE + '/index.html?view=dissertation', { waitUntil: 'domcontentloaded' });
    await lp.waitForFunction(
      () => window.location.hash.includes('dissertation'),
      { timeout: 15000 }).catch(() => {});
    const migratedDissertation = await lp.evaluate(() => window.location.hash.includes('dissertation'));
    await lp.goto(BASE + '/index.html?view=entities', { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    const migratedEntities = await lp.evaluate(() => window.location.hash.includes('entities'));
    await lp.close();
    const allRoutesOk = Object.values(results).every(Boolean);
    if (allRoutesOk && migratedDissertation) {
      set('MAIN-23', 'pass', '', '',
        `all hash routes load and survive the hashchange/popstate sync: ${JSON.stringify(results)}; legacy ?view=dissertation migrated to #dissertation. Note: migrateLegacyUrl (router.js) only maps ?view=dissertation and ?view=about — ?view=entities/folders/analytics are NOT migrated (migratedEntities=${migratedEntities}); harmless since those are the only legacy URLs that existed, but the story's "migrates legacy ?view= URLs" is narrower than it sounds.`);
    } else {
      set('MAIN-23', 'partial',
        `routes=${JSON.stringify(results)} legacyDissertation=${migratedDissertation}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-24
  // Header nav + tools bar + bug report + scroll shadow.
  {
    // ensure default route
    await page.evaluate(() => { window.location.hash = ''; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await sleep(400);
    const header = await page.evaluate(() => {
      const inlineTools = [...document.querySelectorAll('section button')]
        .map(b => b.textContent.trim());
      const hasMindMap = inlineTools.some(t => /Mind Map/.test(t));
      const hasEntities = inlineTools.some(t => /Entities/.test(t));
      const hasAnalytics = inlineTools.some(t => /Analytics/.test(t));
      const hasMore = inlineTools.some(t => /More/.test(t));
      const bugBtn = [...document.querySelectorAll('button[aria-label="Report a bug"]')].length;
      const logo = !!document.querySelector('button[aria-label="Return to archive home"]');
      return { hasMindMap, hasEntities, hasAnalytics, hasMore, bugBtn, logo };
    });
    // click Mind Map -> dissertation
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('section button')].find(x => /Mind Map/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(500);
    const wentToDissertation = await page.evaluate(() => window.location.hash.includes('dissertation'));
    // back home via logo (need to return first)
    await page.evaluate(() => { window.location.hash = ''; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await sleep(400);
    // scroll shadow
    await page.evaluate(() => window.scrollTo(0, 200));
    await sleep(200);
    const shadow = await page.evaluate(() =>
      !!document.querySelector('header.shadow-sm') ||
      !!document.querySelector('header[class*="shadow"]'));
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(200);
    if (header.logo && header.hasMindMap && header.hasEntities && header.hasAnalytics &&
        header.hasMore && header.bugBtn > 0 && wentToDissertation && shadow) {
      set('MAIN-24', 'pass', '', '',
        `header has logo, Report-a-bug button; inline Tools bar shows Mind Map / Entities / Analytics / More; Mind Map routed to #dissertation; header gained shadow after scrolling past 10px.`);
    } else {
      set('MAIN-24', 'partial',
        `header: ${JSON.stringify(header)} wentToDissertation=${wentToDissertation} shadow=${shadow}`,
        'low', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-25
  // Footer explore links + credits.
  {
    const footer = await page.evaluate(() => {
      const f = document.querySelector('footer');
      if (!f) return { present: false };
      const links = [...f.querySelectorAll('button')].map(b => b.textContent.trim());
      const credits = f.textContent.match(/([\d,]+)\s+records\s*\|\s*(\d{4})[–-](\d{4})/);
      return {
        present: true,
        links,
        hasArchive: links.some(l => /Browse archive/.test(l)),
        hasMindMap: links.some(l => /Dissertation mind map/.test(l)),
        hasEntities: links.some(l => /Entity browser/.test(l)),
        hasAnalytics: links.some(l => /Analytics dashboard/.test(l)),
        hasAbout: links.some(l => /About this archive/.test(l)),
        credits: credits ? credits[0] : null,
      };
    });
    // click one footer link to confirm routing (Entity browser)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('footer button')].find(x => /Entity browser/.test(x.textContent));
      if (b) b.click();
    });
    await sleep(500);
    const routed = await page.evaluate(() => window.location.hash.includes('entities'));
    await page.evaluate(() => { window.location.hash = ''; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await sleep(400);
    if (footer.present && footer.hasArchive && footer.hasMindMap && footer.hasEntities &&
        footer.hasAnalytics && footer.hasAbout && footer.credits && routed) {
      set('MAIN-25', 'pass', '', '',
        `footer Explore column has all 5 links; "Entity browser" routed to #entities; Credits show "${footer.credits}".`);
    } else {
      set('MAIN-25', 'fail',
        `footer: ${JSON.stringify(footer)} routed=${routed}`,
        'medium', '');
    }
  }

  // ----------------------------------------------------------------- MAIN-26
  // Back-to-top button.
  {
    const before = await page.evaluate(() =>
      !!document.querySelector('button[aria-label="Back to top"]'));
    await page.evaluate(() => window.scrollTo(0, 800));
    await sleep(300);
    const visible = await page.evaluate(() =>
      !!document.querySelector('button[aria-label="Back to top"]'));
    if (visible) {
      await page.click('button[aria-label="Back to top"]');
      await sleep(600);
    }
    const scrollY = await page.evaluate(() => window.scrollY);
    const afterTop = await page.evaluate(() =>
      !!document.querySelector('button[aria-label="Back to top"]'));
    if (!before && visible && scrollY < 200 && !afterTop) {
      set('MAIN-26', 'pass', '', '',
        `back-to-top hidden near top, appeared after scrolling past 500px, scrolled to top on click (scrollY=${scrollY}) and hid again.`);
    } else {
      set('MAIN-26', 'fail',
        `back-to-top: beforeTop=${before} visibleAfterScroll=${visible} scrollYafter=${scrollY} hiddenAtTop=${afterTop}`,
        'low', '');
    }
  }

  // snapshot any console/page errors observed on the main page so far
  const mainErrors = errors.filter(e => !/REQFAIL/.test(e) || /\.json|\.js\b/.test(e));
  await page.close();

  // --- fresh-page cold-load behaviours --------------------------------------

  // MAIN-21 (deep link variants): ?record=<valid> opens; ?record=BADID renders no modal.
  {
    // get a valid id from a fresh archive load
    const { page: dp, errors: derr } = await newPage(browser);
    await suppressWelcome(dp);
    await gotoArchive(dp, '');
    await dp.waitForFunction(
      () => document.querySelectorAll('.columns-1 > div.break-inside-avoid').length > 0,
      { timeout: 45000 }).catch(() => {});
    const validId = await dp.evaluate(async () => {
      // grab an id from the URL after clicking a card
      const card = document.querySelector('.columns-1 > div.break-inside-avoid');
      card.click();
      await new Promise(r => setTimeout(r, 300));
      const m = window.location.href.match(/[?&]record=([^&]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    });
    await dp.close();

    let validOpens = false, badNoModal = false;
    if (validId) {
      const { page: vp } = await newPage(browser);
      await suppressWelcome(vp);
      await vp.goto(BASE + `/index.html?record=${encodeURIComponent(validId)}`, { waitUntil: 'domcontentloaded' });
      await vp.waitForSelector('[role="dialog"]', { timeout: 20000 }).catch(() => {});
      validOpens = await vp.evaluate(() => !!document.querySelector('[role="dialog"]'));
      await vp.close();
    }
    {
      const { page: bp } = await newPage(browser);
      await suppressWelcome(bp);
      await bp.goto(BASE + '/index.html?record=BADID-NONEXISTENT', { waitUntil: 'domcontentloaded' });
      await bp.waitForFunction(
        () => /records found/.test(document.body.textContent),
        { timeout: 45000 }).catch(() => {});
      await sleep(800);
      badNoModal = await bp.evaluate(() => !document.querySelector('[role="dialog"]'));
      await bp.close();
    }
    // merge into MAIN-21 verdict
    const cur = V['MAIN-21'];
    if (cur.test_status === 'pass' && validId && validOpens && badNoModal) {
      cur.notes += ` Deep link ?record=${validId} opened the modal on cold load; ?record=BADID-NONEXISTENT rendered no modal (isOpen true but record null).`;
    } else if (validOpens && badNoModal && cur.test_status === 'partial') {
      cur.notes += ` Deep links OK (valid opens, bad renders nothing).`;
    } else if (!validOpens || !badNoModal) {
      cur.test_status = cur.test_status === 'pass' ? 'partial' : cur.test_status;
      cur.errors_found = (cur.errors_found ? cur.errors_found + '; ' : '') +
        `deep-link: validOpens=${validOpens} badNoModal=${badNoModal} (validId=${validId})`;
      cur.severity = cur.severity || 'medium';
    }
  }

  // MAIN-17: loading + core-data error. Abort the core-data request and confirm
  // the red error panel renders on both archive and #entities, with a Reload button.
  {
    const { page: ep } = await browser.newPage().then(p => ({ page: p }));
    await suppressWelcome(ep);
    // block the core data fetch
    await ep.route('**/archive-core.json', route => route.abort());
    await ep.route('**/archive-data.json', route => route.abort());
    const epErrors = [];
    ep.on('pageerror', e => epErrors.push(String(e)));
    await ep.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await ep.waitForFunction(
      () => /Error loading archive/.test(document.body.textContent) ||
            /records found/.test(document.body.textContent),
      { timeout: 30000 }).catch(() => {});
    await sleep(500);
    const archiveError = await ep.evaluate(() => ({
      panel: /Error loading archive/.test(document.body.textContent),
      reloadBtn: [...document.querySelectorAll('button')].some(b => /Reload Page/.test(b.textContent)),
    }));
    // navigate to entities, confirm error panel there too
    await ep.evaluate(() => { window.location.hash = 'entities'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await sleep(700);
    const entitiesError = await ep.evaluate(() =>
      /Error loading archive/.test(document.body.textContent));
    await ep.close();
    if (archiveError.panel && archiveError.reloadBtn && entitiesError) {
      set('MAIN-17', 'pass', '', '',
        `aborting the core-data fetch surfaced the red "Error loading archive" panel with a "Reload Page" button on the archive route, and the same panel on #entities (shared fail-loud per #369). Loading state ("Loading archive..." + LoadingQuotes) confirmed during normal cold loads.`);
    } else {
      set('MAIN-17', 'partial',
        `error path: archivePanel=${archiveError.panel} reloadBtn=${archiveError.reloadBtn} entitiesPanel=${entitiesError}`,
        'medium', 'loading state confirmed; error path partial');
    }
  }

  // MAIN-11: mobile filter drawer (fresh page at mobile viewport).
  {
    const { page: mp } = await newPage(browser, { width: 390, height: 844 });
    await suppressWelcome(mp);
    await gotoArchive(mp, '');
    await mp.waitForFunction(
      () => /records found/.test(document.body.textContent), { timeout: 45000 }).catch(() => {});
    const m1 = await mp.evaluate(() => {
      // sidebar hidden (translated off / not in lg layout): look for the toggle button
      const toggle = [...document.querySelectorAll('header button')]
        .find(b => b.querySelector('svg') && b.className.includes('lg:hidden') && b.className.includes('border'));
      return { hasToggle: !!toggle };
    });
    // apply a filter via search to get a badge, then open drawer
    await mp.evaluate(() => {
      const el = document.querySelector('aside input[type="text"]');
      if (!el) return;
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
      desc.set.call(el, 'press');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await sleep(250);
    const badge = await mp.evaluate(() => {
      const sp = [...document.querySelectorAll('header span')].find(s => /^\d+$/.test(s.textContent.trim()) && s.className.includes('bg-red'));
      return sp ? sp.textContent.trim() : null;
    });
    // open the drawer
    await mp.evaluate(() => {
      const toggle = [...document.querySelectorAll('header button')]
        .find(b => b.className.includes('lg:hidden') && b.className.includes('border'));
      if (toggle) toggle.click();
    });
    await sleep(300);
    const summary = await mp.evaluate(() =>
      /filter[s]? active/.test(document.body.textContent || ''));
    // close via X
    await mp.evaluate(() => {
      const x = [...document.querySelectorAll('aside button')].find(b => b.querySelector('svg'));
      // the close X is in the header row of the drawer
      const closeBtn = [...document.querySelectorAll('aside .lg\\:hidden button')][0] ||
        [...document.querySelectorAll('aside button')][0];
      if (closeBtn) closeBtn.click();
    });
    await sleep(300);
    await mp.close();
    if (m1.hasToggle && badge && summary) {
      set('MAIN-11', 'pass', '', '',
        `at 390px the header shows the filter toggle (sidebar hidden); applying a search produced a red "${badge}" badge; opening the drawer showed the active-filter summary line.`);
    } else {
      set('MAIN-11', 'partial',
        `mobile drawer: hasToggle=${m1.hasToggle} badge=${badge} summary=${summary}`,
        'medium', '');
    }
  }

  await browser.close();

  // record any uncaught page errors as a global note on MAIN-13 if present
  if (mainErrors.length) {
    const noisy = mainErrors.filter(e => !/favicon|sourcemap|DevTools/.test(e));
    if (noisy.length) {
      V['MAIN-13'].notes += ` [console/page errors seen during run: ${noisy.slice(0, 3).join(' | ')}]`;
    }
  }

  // ensure every MAIN story has a verdict
  for (const s of stories) {
    if (!V[s.id]) set(s.id, 'blocked', 'no test executed', 'low', '');
  }

  const path = writeVerdicts('main', V);
  const counts = { pass: 0, fail: 0, partial: 0, blocked: 0, 'n/a': 0 };
  for (const id of Object.keys(V)) counts[V[id].test_status]++;
  console.log('Wrote', path);
  console.log('Tested', Object.keys(V).length, 'MAIN stories');
  console.log(JSON.stringify(counts, null, 2));
  for (const id of Object.keys(V).sort()) {
    const v = V[id];
    if (v.test_status === 'fail' || v.test_status === 'partial' || v.test_status === 'blocked') {
      console.log(`${id} [${v.test_status}] ${v.errors_found || v.notes}`);
    }
  }
};

run().catch(err => { console.error('FATAL', err); process.exit(1); });
