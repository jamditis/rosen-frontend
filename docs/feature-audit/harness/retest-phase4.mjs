// Phase 4 re-test: verify every Phase 3 fix in real Chromium against the live
// local server, and emit retest-phase4.json (id -> {retest_status, notes}).
// Run: node docs/feature-audit/harness/retest-phase4.mjs   (server must be on :8000)
import { launchBrowser, BASE, sleep } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const results = {};
const rec = (id, ok, notes) => { results[id] = { retest_status: ok ? 'pass' : 'fail', notes }; };
const httpOk = async (url) => {
  try { const r = await fetch(url); return r.status; } catch (e) { return 'ERR ' + e.message; }
};

const browser = await launchBrowser();

// ---------------------------------------------------------------------------
// FAQ page: DIS-20 (figures pill), DIS-18 (copy-link success path)
// ---------------------------------------------------------------------------
try {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => consoleErrs.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + '/dissertation/faq/', { waitUntil: 'networkidle' });

  // DIS-18 first, on fresh load (all items visible). Note: data-category also
  // tags FAQ articles, so the pill must be matched as .pill[data-category=...].
  const btn = page.locator('.copy-link-btn').first();
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await sleep(300);
    const state = await page.evaluate(() => {
      const b = document.querySelector('.copy-link-btn');
      return { title: b.title, green: b.classList.contains('text-green-600') };
    });
    const failedLog = consoleErrs.some(e => /Failed to copy link/.test(e));
    rec('DIS-18', state.green && !failedLog,
      `success-class=${state.green} title="${state.title}" failedLog=${failedLog}`);
  } else {
    rec('DIS-18', false, 'no .copy-link-btn rendered');
  }

  // DIS-20: the figures category pill exists and filters to figures questions.
  const figPill = page.locator('.pill[data-category="figures"]');
  const pillExists = (await figPill.count()) === 1;
  let figFilters = false;
  if (pillExists) {
    await figPill.scrollIntoViewIfNeeded();
    await figPill.click();
    await sleep(300);
    figFilters = await page.evaluate(() => {
      // content items carry data-category too; exclude the .pill buttons
      const items = [...document.querySelectorAll('[data-category]')]
        .filter(el => !el.classList.contains('pill'));
      const visible = items.filter(el => el.offsetParent !== null);
      return visible.length > 0 && visible.every(el => el.getAttribute('data-category') === 'figures');
    });
  }
  rec('DIS-20', pillExists && figFilters, `pill=${pillExists} filtersToFiguresOnly=${figFilters}`);
  await ctx.close();
} catch (e) { rec('DIS-20', false, 'threw: ' + e.message); rec('DIS-18', false, 'threw: ' + e.message); }

// ---------------------------------------------------------------------------
// Dissertation reader: RDR-02/19 (conclusion id), RDR-03 (no dup ids),
// RDR-18 (citation copy w/o label), RDR-08 (resume to section, not absolute Y)
// ---------------------------------------------------------------------------
try {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.goto(BASE + '/dissertation/reader/', { waitUntil: 'networkidle' });

  // RDR-03 structural: no duplicate ids in the rendered DOM
  const dupes = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
    const seen = {}; ids.forEach(i => seen[i] = (seen[i] || 0) + 1);
    return Object.entries(seen).filter(([, n]) => n > 1).map(([i, n]) => `${i}(${n})`);
  });
  rec('RDR-03', dupes.length === 0, dupes.length ? 'still dup: ' + dupes.join(',') : 'no duplicate ids in DOM');

  // RDR-02 / RDR-19: #conclusion resolves to the top-level CONCLUSION h1
  const concl = await page.evaluate(() => {
    const el = document.getElementById('conclusion');
    return el ? { tag: el.tagName, text: el.textContent.trim().slice(0, 40) } : null;
  });
  const conclOk = concl && concl.tag === 'H1' && /CONCLUSION/i.test(concl.text);
  rec('RDR-02', conclOk, concl ? `#conclusion -> <${concl.tag}> "${concl.text}"` : '#conclusion not found');
  rec('RDR-19', conclOk, concl ? `deep-link target <${concl.tag}> "${concl.text}"` : '#conclusion not found');

  // RDR-18: copy citation, assert copied text excludes the "Cite this work:" label
  const copyBtn = await page.$('[data-action="copy-citation"]');
  if (copyBtn) {
    await copyBtn.click();
    await sleep(300);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const ok = !!clip && !/^\s*cite this work/i.test(clip) && /^Rosen, J\./.test(clip);
    rec('RDR-18', ok, `clipboard starts: "${(clip || '').slice(0, 40)}"`);
  } else {
    rec('RDR-18', false, 'no copy-citation button');
  }
  await ctx.close();

  // RDR-08: seed a saved position with an absurd scrollY but a real sectionId;
  // resume must land on the section element, not the (clamped) absolute scrollY.
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.addInitScript(() => {
    localStorage.setItem('dissertation-reader-progress', JSON.stringify({
      sectionId: 'chapter-5', scrollProgress: 42, scrollY: 9999999
    }));
  });
  await page2.goto(BASE + '/dissertation/reader/', { waitUntil: 'networkidle' });
  await sleep(500);
  const prompt = await page2.$('.resume-prompt');
  let resumeOk = false, detail = 'no resume prompt';
  if (prompt) {
    const cont = await page2.$('.resume-prompt [data-action="resume"]');
    await cont.click();
    // Wait for the smooth scroll to settle (large document => long animation).
    const r = await page2.evaluate(async () => {
      const settle = () => new Promise(res => {
        let last = -1, stable = 0;
        const tick = () => {
          const y = Math.round(window.scrollY);
          if (y === last) { if (++stable >= 5) return res(y); } else { stable = 0; last = y; }
          setTimeout(tick, 100);
        };
        tick();
      });
      const finalY = await settle();
      const el = document.getElementById('chapter-5');
      const rect = el.getBoundingClientRect();
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      return { top: Math.round(rect.top), scrollY: finalY, maxY: Math.round(maxY) };
    });
    // chapter-5 should be near the top of the viewport, and we must NOT be pinned
    // at the bottom (which the old absolute-scrollY=9999999 would have forced).
    resumeOk = Math.abs(r.top) < 200 && r.scrollY < r.maxY - 100;
    detail = `chapter-5 rect.top=${r.top}px finalScrollY=${r.scrollY} (max=${r.maxY})`;
  }
  rec('RDR-08', resumeOk, detail);
  await ctx2.close();
} catch (e) {
  ['RDR-02', 'RDR-19', 'RDR-03', 'RDR-18', 'RDR-08'].forEach(id => { if (!results[id]) rec(id, false, 'threw: ' + e.message); });
}

// ---------------------------------------------------------------------------
// Dissertation landing: DIS-01 (hero CTA new tab), DIS-08 (main + selection)
// ---------------------------------------------------------------------------
try {
  const page = await browser.newPage();
  await page.goto(BASE + '/dissertation/', { waitUntil: 'networkidle' });

  const cta = await page.evaluate(() => {
    const a = document.querySelector('.hero-cta-primary');
    return a ? { target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null;
  });
  rec('DIS-01', cta && cta.target === '_blank', cta ? `target=${cta.target} rel=${cta.rel}` : 'no hero CTA');

  // DIS-08: <main> exists and a selection inside it raises the share menu
  const mainExists = await page.evaluate(() => !!document.querySelector('main'));
  let menuShown = false;
  if (mainExists) {
    menuShown = await page.evaluate(async () => {
      const p = document.querySelector('main p');
      if (!p) return false;
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const menu = document.getElementById('text-selection-menu');
      return !!menu && menu.classList.contains('is-visible');
    });
  }
  rec('DIS-08', mainExists && menuShown, `main=${mainExists} shareMenuVisible=${menuShown}`);
  await page.close();
} catch (e) { ['DIS-01', 'DIS-08'].forEach(id => { if (!results[id]) rec(id, false, 'threw: ' + e.message); }); }

// ---------------------------------------------------------------------------
// React app: MODAL-16 (tool links resolve), ENT-10 (Read Full Text resolves)
// ---------------------------------------------------------------------------
try {
  const page = await browser.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  // resolve the three tool paths via the real module, then confirm each is 200
  const urls = await page.evaluate(async () => {
    const m = await import('/frontend/utils/pathResolver.js');
    return {
      faq: m.resolveSitePath('dissertation/faq/'),
      reader: m.resolveSitePath('dissertation/reader/'),
      dataviz: m.resolveSitePath('tools/active/dataviz/dataviz.html'),
    };
  });
  const codes = {};
  for (const [k, rel] of Object.entries(urls)) codes[k] = await httpOk(BASE + rel);
  const allOk = Object.values(codes).every(c => c === 200);
  rec('MODAL-16', allOk, `faq=${urls.faq}(${codes.faq}) reader=${urls.reader}(${codes.reader}) dataviz=${urls.dataviz}(${codes.dataviz})`);
  await page.close();

  // ENT-10: navigate to #dissertation, read the "Read Full Text" anchor href
  const page2 = await browser.newPage();
  await page2.goto(BASE + '/index.html#dissertation', { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => /Read Full Text/i.test(document.body.textContent), { timeout: 20000 }).catch(() => {});
  const href = await page2.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find(x => /Read Full Text/i.test(x.textContent));
    return a ? a.getAttribute('href') : null;
  });
  const entCode = href ? await httpOk(BASE + href) : 'no-link';
  rec('ENT-10', href === '/dissertation/reader/' && entCode === 200, `href=${href} status=${entCode}`);
  await page2.close();
} catch (e) { ['MODAL-16', 'ENT-10'].forEach(id => { if (!results[id]) rec(id, false, 'threw: ' + e.message); }); }

// ---------------------------------------------------------------------------
// status-report: TOOL-02 + TOOL-08 (utilities resolve), TOOL-06 (clean load)
// ---------------------------------------------------------------------------
try {
  const page = await browser.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + '/features/status-report/', { waitUntil: 'networkidle' });
  await sleep(300);

  const colors = await page.evaluate(() => {
    const probe = (cls, prop) => {
      const d = document.createElement('div');
      d.className = cls; document.body.appendChild(d);
      const v = getComputedStyle(d)[prop]; d.remove(); return v;
    };
    return {
      emeraldText: probe('text-emerald-600', 'color'),
      roseText: probe('text-rose-600', 'color'),
      roseBg: probe('bg-rose-50', 'backgroundColor'),
      emeraldBorder: probe('border-emerald-300', 'borderTopColor'),
    };
  });
  const tool02 = colors.emeraldText === 'rgb(5, 150, 105)' && colors.roseText === 'rgb(225, 29, 72)';
  rec('TOOL-02', tool02, `emerald=${colors.emeraldText} rose=${colors.roseText}`);
  const tool08 = colors.roseBg === 'rgb(255, 241, 242)' && colors.emeraldBorder === 'rgb(110, 231, 183)';
  rec('TOOL-08', tool08, `rose-bg=${colors.roseBg} emerald-border=${colors.emeraldBorder}`);

  const importErr = errs.some(e => /CATEGORY_DISTRIBUTION|import|module/i.test(e));
  rec('TOOL-06', !importErr, importErr ? 'import error: ' + errs.join(' | ') : `clean load (${errs.length} console errors)`);
  await page.close();
} catch (e) { ['TOOL-02', 'TOOL-08', 'TOOL-06'].forEach(id => { if (!results[id]) rec(id, false, 'threw: ' + e.message); }); }

await browser.close();

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'retest-phase4.json');
writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
const pass = Object.values(results).filter(r => r.retest_status === 'pass').length;
const fail = Object.values(results).filter(r => r.retest_status === 'fail').length;
console.log(`retest complete: ${pass} pass, ${fail} fail of ${Object.keys(results).length}`);
for (const [id, r] of Object.entries(results)) console.log(`  ${r.retest_status === 'pass' ? 'PASS' : 'FAIL'} ${id}: ${r.notes}`);
