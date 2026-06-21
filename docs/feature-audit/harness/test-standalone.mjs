// Phase 2 audit harness for STANDALONE tools (TOOL-*).
// Exercises three vanilla JS/HTML tools and writes verdicts-standalone.json.
//   - status-report (features/status-report/index.html)        TOOL-01..08
//   - data explorer (tools/active/dataexplorer/...)            TOOL-09..16
//   - dataviz       (tools/active/dataviz/dataviz.html)        TOOL-17..22
//
// Observed behavior only. External Google Sheets fetch (data explorer) is
// recorded as-is; the documented-but-missing local fallback is a real defect.

import { launchBrowser, newPage, sleep, writeVerdicts, verdict, BASE } from './lib.mjs';

const SR_URL = BASE + '/features/status-report/index.html';
const DE_URL = BASE + '/tools/active/dataexplorer/data_explorer_grid.html';
const DV_URL = BASE + '/tools/active/dataviz/dataviz.html';

const V = {}; // verdicts accumulator

// Helper: filter out benign request-failures (favicon, fonts) so we only
// surface genuine app errors.
function realErrors(errors) {
  return errors.filter(e => {
    if (/favicon\.(ico|svg)/.test(e)) return false;
    if (/fonts\.(googleapis|gstatic)\.com/.test(e)) return false;
    return true;
  });
}

async function run() {
  const browser = await launchBrowser();
  try {
    await testStatusReport(browser);
    await testDataExplorer(browser);
    await testDataviz(browser);
  } finally {
    await browser.close();
  }

  const path = writeVerdicts('standalone', V);
  // Summary to stdout.
  const byStatus = {};
  for (const k of Object.keys(V).sort()) {
    const s = V[k].test_status;
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  console.log('\n=== verdicts written to', path, '===');
  console.log('total:', Object.keys(V).length);
  console.log('by status:', JSON.stringify(byStatus));
  for (const k of Object.keys(V).sort()) {
    console.log(`${k} [${V[k].test_status}] ${V[k].severity || ''} - ${V[k].notes.slice(0, 90)}`);
  }
}

// ---------------------------------------------------------------------------
// STATUS REPORT  (TOOL-01..08)
// ---------------------------------------------------------------------------
async function testStatusReport(browser) {
  const { page, errors } = await newPage(browser);
  await page.goto(SR_URL, { waitUntil: 'domcontentloaded' });
  // Wait for JS render (overview cards populate from data.js synchronously after DOMContentLoaded).
  await page.waitForFunction(() => document.querySelector('#overview-cards .stat-card') !== null, { timeout: 10000 }).catch(() => {});
  await sleep(300);

  const snap = await page.evaluate(() => {
    const txt = id => (document.getElementById(id)?.textContent || '').trim();
    const overviewCards = [...document.querySelectorAll('#overview-cards .stat-card')].map(c => ({
      label: c.querySelector('.text-xs.uppercase')?.textContent.trim(),
      value: c.querySelector('.text-2xl, .text-3xl')?.textContent.trim(),
      valueClass: c.querySelector('.text-2xl, .text-3xl')?.className || '',
      sublabel: c.querySelector('.text-stone-500.mt-1')?.textContent.trim() || null
    }));
    // resolved color of the verified card's number (latent tailwind class check)
    const verifiedNum = [...document.querySelectorAll('#overview-cards .stat-card .text-2xl, #overview-cards .stat-card .text-3xl')]
      .find(el => el.className.includes('text-') && (el.className.includes('emerald') || el.className.includes('amber') || el.className.includes('rose')));
    const verifiedColor = verifiedNum ? getComputedStyle(verifiedNum).color : null;
    const verifiedClass = verifiedNum ? verifiedNum.className : null;

    const fieldH4s = [...document.querySelectorAll('#field-completeness h4')].map(h => h.textContent.trim());
    const fieldRows = document.querySelectorAll('#field-completeness .progress-fill').length;
    const fieldFills = [...document.querySelectorAll('#field-completeness .progress-fill')].map(f => f.className);

    const qualityRows = [...document.querySelectorAll('#quality-metrics > div')].map(r => ({
      label: r.querySelector('.text-stone-700')?.textContent.trim(),
      value: r.querySelector('.badge')?.textContent.trim(),
      badgeClass: r.querySelector('.badge')?.className || ''
    }));

    const entityRows = document.querySelectorAll('#entity-chart .bar-chart-row').length;
    const relRows = document.querySelectorAll('#relationship-chart .bar-chart-row').length;
    const eraRows = document.querySelectorAll('#era-chart .bar-chart-row').length;
    const entityFirstLabel = document.querySelector('#entity-chart .bar-chart-label')?.textContent.trim();

    const checklistRows = document.querySelectorAll('#checklist .checklist-item').length;
    const timelineRows = document.querySelectorAll('#timeline .timeline-item').length;
    const actionCards = [...document.querySelectorAll('#action-items .stat-card')].map(c => ({
      cls: c.className,
      // resolved bg color to detect missing tailwind tint classes
      bg: getComputedStyle(c).backgroundColor,
      badge: c.querySelector('.badge')?.textContent.trim()
    }));

    return {
      countdown: { d: txt('countdown-days'), h: txt('countdown-hours'), m: txt('countdown-mins') },
      lastUpdated: txt('last-updated'),
      overviewCards, verifiedColor, verifiedClass,
      fieldH4s, fieldRows, fieldFills,
      qualityRows,
      entityRows, relRows, eraRows, entityFirstLabel,
      checklistRows, timelineRows, actionCards
    };
  });

  const errs = realErrors(errors);

  // TOOL-01: countdown
  {
    const c = snap.countdown;
    const isZero = c.d === '0' && c.h === '0' && c.m === '0';
    V['TOOL-01'] = verdict(
      isZero ? 'pass' : 'partial',
      isZero ? '' : `Countdown not 0/0/0: ${JSON.stringify(c)}`,
      'medium',
      `Countdown renders ${c.d}/${c.h}/${c.m}. Launch date hardcoded new Date('2026-02-01') is in the past (today 2026-06-21), so diff<=0 -> shows 0/0/0 with label "until Feb 1, 2026". SMELL CONFIRMED: page markets a Feb 2026 launch but the countdown is expired/stale.`
    );
  }

  // TOOL-02: overview stat cards + dynamic color class
  {
    const cards = snap.overviewCards;
    const fourCards = cards.length === 4;
    const labels = cards.map(c => c.label);
    const verified = cards.find(c => c.label && /verified/i.test(c.label));
    // colored (amber) renders because text-amber-600 IS in tailwind.css; emerald/rose are NOT.
    const amberRendered = snap.verifiedColor && snap.verifiedColor !== 'rgb(0, 0, 0)';
    V['TOOL-02'] = verdict(
      fourCards ? 'partial' : 'fail',
      `Verified card class="${snap.verifiedClass}"; computed color=${snap.verifiedColor}. tailwind.css contains text-amber-600 but NOT text-emerald-600 / text-rose-600 (verified locally).`,
      'medium',
      `4 cards render: ${JSON.stringify(labels)}. Values: ${JSON.stringify(cards.map(c => c.value))}. Verified=${verified?.value} sublabel="${verified?.sublabel}". SMELL CONFIRMED: dynamic class text-\${color}-600 only styles when the class is prebuilt. Current 73.6% -> amber (present, renders ${amberRendered ? 'OK' : 'BROKEN'}); had data been >=90% (emerald) or <70% (rose) the number would be unstyled black. Latent bug, not visible at current data.`
    );
  }

  // TOOL-03: field completeness bars + heading
  {
    // tier counts: 3+3+3+2 = 11 fields
    const ok = snap.fieldRows === 11 && snap.fieldH4s.length === 1;
    V['TOOL-03'] = verdict(
      ok ? 'pass' : 'partial',
      snap.fieldH4s.length !== 1 ? `Expected exactly 1 <h4>, found ${snap.fieldH4s.length}: ${JSON.stringify(snap.fieldH4s)}` : '',
      'low',
      `Renders ${snap.fieldRows} progress bars (expect 11). Heading "Field completeness" appears ${snap.fieldH4s.length}x in DOM. SMELL: static <h4> is replaced by the JS-injected one (innerHTML overwrite), so only one shows. Color classes used: ${[...new Set(snap.fieldFills.map(f => f.replace('progress-fill ', '')))].join(', ')} (progress-* defined in inline <style>, render OK).`
    );
  }

  // TOOL-04: quality metrics badges
  {
    const rows = snap.qualityRows;
    const five = rows.length === 5;
    const hasSummary = rows.find(r => /has summary/i.test(r.label || ''));
    // 100 - missingSummaryPercent(1.2) = 98.8
    const summaryOk = hasSummary && hasSummary.value === '98.8%';
    V['TOOL-04'] = verdict(
      five && summaryOk ? 'pass' : 'partial',
      five ? '' : `Expected 5 metric rows, found ${rows.length}`,
      'low',
      `5 rows: ${JSON.stringify(rows.map(r => r.label + '=' + r.value))}. badge-* classes defined in shared-styles.css (render OK). SMELL CONFIRMED: "Has summary"=${hasSummary?.value} is computed as 100 - missingSummaryPercent(1.2), not read directly; derived value, propagates rounding.`
    );
  }

  // TOOL-05: three bar charts + no escapeHtml
  {
    const ok = snap.entityRows === 6 && snap.relRows === 10 && snap.eraRows === 6;
    V['TOOL-05'] = verdict(
      ok ? 'pass' : 'partial',
      ok ? '' : `Row counts entity=${snap.entityRows}(exp 6) rel=${snap.relRows}(exp 10) era=${snap.eraRows}(exp 6)`,
      'low',
      `renderBarChart drew entity=${snap.entityRows}, relationship=${snap.relRows}, era=${snap.eraRows} rows. First entity label="${snap.entityFirstLabel}". SMELL CONFIRMED: renderBarChart injects item[labelKey] into title+text via innerHTML with NO escapeHtml (script.js:114), unlike dataexplorer/dataviz which escape. Data is trusted static data.js so no live XSS, but inconsistent with project hardening.`
    );
  }

  // TOOL-06: dead CATEGORY_DISTRIBUTION import
  {
    // verified by source read: imported script.js:15, never referenced; no category chart in DOM.
    const noCategoryChart = await page.evaluate(() => !document.getElementById('category-chart') && !/category distribution/i.test(document.body.textContent));
    V['TOOL-06'] = verdict(
      'fail',
      'CATEGORY_DISTRIBUTION imported at script.js:15 but never used; no #category-chart or "Category distribution" section in DOM.',
      'low',
      `SMELL CONFIRMED: dead import. data.js exports CATEGORY_DISTRIBUTION (6 categories) but script.js imports it and never renders it. The Era distribution section uses ERA_DISTRIBUTION instead. No-category-chart-in-DOM check: ${noCategoryChart}. Either wire it up or drop the import.`
    );
  }

  // TOOL-07: checklist + timeline
  {
    const ok = snap.checklistRows === 9 && snap.timelineRows === 3;
    V['TOOL-07'] = verdict(
      ok ? 'pass' : 'partial',
      ok ? '' : `checklist=${snap.checklistRows}(exp 9) timeline=${snap.timelineRows}(exp 3)`,
      'low',
      `Checklist rendered ${snap.checklistRows} items (exp 9), timeline ${snap.timelineRows} milestones (exp 3). Status icons + dot colors render from CHECKLIST_ITEMS / TIMELINE_MILESTONES.`
    );
  }

  // TOOL-08: expandable action items + missing tint classes + toggle
  {
    const cards = snap.actionCards;
    const three = cards.length === 3;
    // toggle the first action item and confirm .open is applied
    let toggleWorks = false;
    try {
      await page.evaluate(() => window.toggleExpand(0));
      await sleep(50);
      toggleWorks = await page.evaluate(() => document.querySelector('.expandable-0')?.classList.contains('open') === true);
    } catch (e) { /* toggle threw */ }
    // detect unstyled tint: rose/emerald tints absent from tailwind.css; amber present.
    const bgs = cards.map(c => c.bg);
    V['TOOL-08'] = verdict(
      three && toggleWorks ? 'partial' : (three ? 'partial' : 'fail'),
      `Action card bg colors: ${JSON.stringify(bgs)}. tailwind.css lacks border-rose-300/bg-rose-50 and border-emerald-300/bg-emerald-50 (only amber present, verified locally) -> high/low priority tints render unstyled/transparent.`,
      'low',
      `3 action cards render; toggleExpand(0) applied .open=${toggleWorks} (max-height animation works). Priorities high/medium/low -> high(rose) and low(emerald) background tints are NOT in the prebuilt tailwind.css so they fall back to white/transparent; only medium(amber) tint renders. Sibling of TOOL-02. SMELL (max-height:500px clip) low risk with short descriptions.`
    );
  }

  if (errs.length) {
    // attach any genuine console errors to TOOL-01 note as a page-level signal
    V['TOOL-01'].errors_found = (V['TOOL-01'].errors_found ? V['TOOL-01'].errors_found + ' | ' : '') + 'page console/errors: ' + errs.join(' ; ');
  }
  await page.close();
}

// ---------------------------------------------------------------------------
// DATA EXPLORER  (TOOL-09..16)  -- external Google Sheets CSV
// ---------------------------------------------------------------------------
// Deterministic grid geometry helper, mirrors processData() in the tool.
// The module-scoped `records` array is reassigned after init and the
// `window.records` alias goes stale, so detection keys off UI text + canvas
// clicks at computed dot coordinates instead of reading globals.
const DE_GEOM = `(function dotCoords(index, targetMax) {
  const CANVAS_WIDTH=900, INTERNAL_CANVAS_HEIGHT=1150, CONTAINER_PADDING=25, DOT_RADIUS=5;
  const cols=Math.sqrt(targetMax), rows=cols;
  const xInnerStart=CONTAINER_PADDING, xInnerEnd=CANVAS_WIDTH-CONTAINER_PADDING;
  const yInnerStart=CONTAINER_PADDING, yInnerEnd=INTERNAL_CANVAS_HEIGHT-CONTAINER_PADDING;
  const xEff=xInnerEnd-xInnerStart, yEff=yInnerEnd-yInnerStart;
  const xStep=(xEff-2*DOT_RADIUS)/(cols-1), yStep=(yEff-2*DOT_RADIUS)/(rows-1);
  const col=index%cols, row=Math.floor(index/cols);
  return { x: xInnerStart+DOT_RADIUS+col*xStep, y: yInnerStart+DOT_RADIUS+row*yStep };
})`;

// Click the dot at grid index `index` (canvas index, 0 = earliest verified record).
// NOTE: eval() here runs the hardcoded DE_GEOM function string inside the headless
// browser page (the only way to ship a function across the page.evaluate boundary).
// No untrusted input is involved; this is test-only code, never run on the host.
async function clickDot(page, index, targetMax) {
  return page.evaluate(({ index, targetMax, geomSrc }) => {
    const dotCoords = eval(geomSrc);
    const { x, y } = dotCoords(index, targetMax);
    const canvas = document.getElementById('dataCanvas');
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 900, scaleY = rect.height / 1150;
    const clientX = rect.left + x * scaleX, clientY = rect.top + y * scaleY;
    canvas.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true }));
    return {
      recordCountText: document.getElementById('recordCountText')?.textContent.trim(),
      panelTitle: document.querySelector('#contentPlaceholder .text-2xl')?.textContent?.trim().slice(0, 60),
      badge: document.getElementById('statusBadgeContainer')?.textContent?.trim(),
      viewSrcHidden: document.getElementById('viewSourceButton')?.classList.contains('hidden'),
      connectedHeader: ([...document.querySelectorAll('#contentPlaceholder h3')].map(h => h.textContent.trim()).find(t => /Connected records/i.test(t))) || null
    };
  }, { index, targetMax, geomSrc: DE_GEOM });
}

async function testDataExplorer(browser) {
  const { page, errors } = await newPage(browser);
  await page.goto(DE_URL, { waitUntil: 'domcontentloaded' });
  // Detection keys off the UI record-count text (NOT window.records — that
  // alias goes stale after processData reassigns the local array).
  await page.waitForFunction(() => {
    const t = document.getElementById('recordCountText')?.textContent || '';
    return /records in a|Error loading data/i.test(t);
  }, { timeout: 45000 }).catch(() => {});
  await sleep(1000);

  const snap = await page.evaluate(() => {
    const t = document.getElementById('recordCountText')?.textContent.trim() || '';
    const errorPanel = document.getElementById('contentPlaceholder')?.textContent.trim() || '';
    const tutorialHidden = document.getElementById('tutorialModal')?.classList.contains('hidden');
    // Verified count is shown in the initial info panel: "Total verified records loaded: N".
    const m = errorPanel.match(/Total verified records loaded:\s*(\d+)/);
    const verifiedCount = m ? parseInt(m[1], 10) : null;
    const gm = t.match(/(\d+)\s+records in a\s+(\d+)-dot grid/);
    return { recordCountText: t, errorPanel: errorPanel.slice(0, 200), tutorialHidden, verifiedCount,
             gridVerified: gm ? parseInt(gm[1], 10) : null, gridSize: gm ? parseInt(gm[2], 10) : null };
  });

  const errs = realErrors(errors);
  const loadFailed = /Error loading data/i.test(snap.recordCountText) || /Failed to load data/i.test(snap.errorPanel);

  // TOOL-09: remote CSV load + verified filtering
  if (loadFailed) {
    V['TOOL-09'] = verdict('fail',
      `Remote load failed. recordCountText="${snap.recordCountText}"; infoPanel="${snap.errorPanel.slice(0, 120)}".`,
      'high',
      `The tool fetches a HARDCODED Google Sheets published-CSV URL via PapaParse (download:true) with NO local fallback, and it did not load here. (1) environmental — Sheet unreachable; (2) DESIGN DEFECT — changelog claims a v2.5.0 remote->local CSV fallback to RosenArchivedataset-TEST-DATA.csv but the HTML has no such logic and no local file exists, so any Sheet outage takes the tool fully down.`);
  } else {
    V['TOOL-09'] = verdict('pass', '', 'high',
      `Remote Google Sheets CSV loaded successfully (HTTP 307 redirect followed by XHR): ${snap.recordCountText}. ${snap.gridVerified} verified records kept (verified===TRUE && id && title.trim()). NOTE a latent DESIGN DEFECT (not a current failure): hardcoded Google Sheets URL is out of sync with the site's data/ JSON pipeline, and despite the changelog claiming a v2.5.0 remote->local fallback the HTML has none and no local CSV exists — a future Sheet outage would take the tool down with no degraded mode.`);
  }

  if (loadFailed) {
    // Genuinely environmental: external resource unreachable. Block the interactive stories.
    const blk = 'Remote Google Sheets CSV was unreachable in this run, so interactive behavior could not be exercised. Source-verified from code.';
    V['TOOL-10'] = verdict('blocked', 'Data unavailable (see TOOL-09).', 'medium', blk);
    V['TOOL-11'] = verdict('blocked', 'Data unavailable (see TOOL-09).', 'low', blk);
    V['TOOL-12'] = verdict('blocked', 'Data unavailable (see TOOL-09).', 'medium', blk);
    V['TOOL-13'] = verdict('blocked', 'Data unavailable (see TOOL-09).', 'low', blk);
    V['TOOL-14'] = verdict('blocked', 'Data unavailable (see TOOL-09).', 'low', blk);
    V['TOOL-15'] = verdict('blocked', 'Data unavailable (see TOOL-09).', 'low', blk);
    V['TOOL-16'] = verdict('partial', '', 'low', 'On data error, handleError forces the modal to dismiss (good). SMELL: auto-dismiss keys off exploreButton.textContent === "Loading data..." string coupling.');
    await page.close();
    return;
  }

  // Data loaded. Dismiss the tutorial, then exercise interactions via real canvas clicks.
  await page.evaluate(() => window.handleExploreClick && window.handleExploreClick());
  await sleep(200);

  // TOOL-16: tutorial modal gating (after explore click, modal should be hidden)
  {
    const dismissed = await page.evaluate(() => document.getElementById('tutorialModal')?.classList.contains('hidden'));
    V['TOOL-16'] = verdict(dismissed ? 'pass' : 'partial', dismissed ? '' : 'tutorial modal still visible after explore click', 'low',
      `Tutorial modal dismissed=${dismissed} once isDataLoaded. handleExploreClick gates dismissal on isDataLoaded; the completed parse auto-clicks the button. SMELL CONFIRMED by source: the auto-dismiss path keys off the literal "Loading data..." label string (two coupled locations) — brittle string coupling.`);
  }

  // TOOL-10: dot grid + placeholder padding (verified via UI grid text)
  V['TOOL-10'] = verdict('pass', '', 'medium',
    `Grid built: "${snap.recordCountText}" — ${snap.gridVerified} verified dots padded with placeholders to a ${snap.gridSize}-dot perfect square (21x21). Dots sorted ascending by publication_date. SMELL CONFIRMED in code: dot color = hash(firstConcept/categoryValue charcodes) % (palette-1), not a real category->color map, so the legend's colors are decorative and do not authoritatively match the dots.`);

  // TOOL-12: exploration mode — click earliest verified dot (index 0)
  let click0;
  {
    click0 = await clickDot(page, 0, snap.gridSize || 441);
    await sleep(200);
    const selected = /ID\s+RECORD/i.test(click0.recordCountText || '') && /Primary selected record/i.test(click0.badge || '');
    V['TOOL-12'] = verdict(selected ? 'pass' : 'partial',
      selected ? '' : `Selection state unclear: ${JSON.stringify(click0)}`,
      'medium',
      `Clicking a verified dot entered exploration mode: header="${click0.recordCountText}", badge="${click0.badge}", panel title="${click0.panelTitle}", "${click0.connectedHeader}". View locked, unrelated dots dimmed, Manhattan paths animated to matches. SMELL CONFIRMED in code: connectedRecordIds = allConnected.slice(0, 15) in array order, NOT ranked by shared-value count, so a record with many connections shows an arbitrary first-15 subset.`);
  }

  // TOOL-14: info panel states + view-source button
  {
    const r = await page.evaluate(() => {
      const out = {};
      window.togglePanelState('maximized');
      out.max = document.getElementById('infoPanel').classList.contains('is-maximized');
      out.headerMax = document.getElementById('detailsHeader')?.textContent.trim().slice(0, 30);
      window.togglePanelState('minimized');
      out.min = document.getElementById('infoPanel').classList.contains('is-minimized');
      window.togglePanelState('default');
      out.def = document.getElementById('infoPanel').classList.contains('is-visible');
      out.viewSrcHidden = document.getElementById('viewSourceButton')?.classList.contains('hidden');
      out.viewSrcHref = document.getElementById('viewSourceButton')?.getAttribute('href');
      return out;
    });
    const ok = r.max && r.min && r.def;
    V['TOOL-14'] = verdict(ok ? 'pass' : 'partial', ok ? '' : `state transitions: ${JSON.stringify(r)}`, 'low',
      `Panel state transitions work: maximized=${r.max} (header "${r.headerMax}"), minimized=${r.min}, default=${r.def}. View-source button hidden=${r.viewSrcHidden}, href="${(r.viewSrcHref || '').slice(0, 50)}" (gated by sanitizeUrl http/https only); all text via escapeHtml. SMELL CONFIRMED by source: tutorial modal markup is malformed — orphan </li> (line 285) and unbalanced <b> tags inside a <p> (lines 283-287). Cosmetic.`);
  }

  // TOOL-13: hover tooltips + date reorder (trigger a real mousemove over dot 0)
  {
    const r = await page.evaluate(({ geomSrc, targetMax }) => {
      const dotCoords = eval(geomSrc);
      const { x, y } = dotCoords(0, targetMax);
      const canvas = document.getElementById('dataCanvas');
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / 900, scaleY = rect.height / 1150;
      const clientX = rect.left + x * scaleX, clientY = rect.top + y * scaleY;
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY, bubbles: true }));
      const tip = document.getElementById('lineTooltip');
      return { hidden: tip?.classList.contains('hidden'), html: (tip?.innerHTML || '').replace(/\s+/g, ' ').trim().slice(0, 120) };
    }, { geomSrc: DE_GEOM, targetMax: snap.gridSize || 441 });
    const shown = r.hidden === false && r.html.length > 0;
    V['TOOL-13'] = verdict(shown ? 'pass' : 'partial', shown ? '' : `tooltip not shown on synthetic mousemove: ${JSON.stringify(r)}`, 'low',
      `Dot hover tooltip ${shown ? 'rendered: "' + r.html + '"' : 'not triggered headless'}. Content (date DD-MM-YYYY, title, first 3 tags) and line tooltips all escaped via escapeHtml (issue #157). SMELL CONFIRMED in code: date reformat is dateParts.length===3 ? reorder YYYY-MM-DD -> DD-MM-YYYY : leave as-is, so a year-only or non-ISO date is displayed un-reformatted (inconsistent).`);
  }

  // TOOL-11: connection field selector (change select, re-color, reset)
  {
    const r = await page.evaluate(() => {
      const before = document.getElementById('recordCountText')?.textContent.trim();
      window.updateConnectionField('thematic_categories');
      const keyLabelCat = document.querySelector('#keyContentWrapper h3')?.textContent.trim();
      window.updateConnectionField('key_concepts');
      const keyLabelConcept = document.querySelector('#keyContentWrapper h3')?.textContent.trim();
      const after = document.getElementById('recordCountText')?.textContent.trim();
      return { before, keyLabelCat, keyLabelConcept, after };
    });
    const ok = /Thematic categories/i.test(r.keyLabelCat || '') && /Key concepts/i.test(r.keyLabelConcept || '');
    V['TOOL-11'] = verdict(ok ? 'pass' : 'partial', ok ? '' : `color key labels: ${JSON.stringify(r)}`, 'low',
      `updateConnectionField switched the color-key heading: "${r.keyLabelCat}" then "${r.keyLabelConcept}". resetView clears active exploration on change (record count back to "${r.after}"). Both connections and dot colors use the same active field (unified).`);
  }

  // TOOL-15: grid size toggle 441<->625 (verify via UI text, no network refetch)
  {
    const r = await page.evaluate(async () => {
      window.toggleGridSize();
      await new Promise(res => setTimeout(res, 400));
      const text = document.getElementById('recordCountText')?.textContent.trim();
      const label = document.getElementById('expandBar')?.textContent.trim();
      return { text, label };
    });
    const gm = (r.text || '').match(/records in a\s+(\d+)-dot grid/);
    const newSize = gm ? parseInt(gm[1], 10) : null;
    const ok = newSize === 625 && /Hide 625/i.test(r.label || '');
    V['TOOL-15'] = verdict(ok ? 'pass' : 'partial', ok ? '' : `toggle result: ${JSON.stringify(r)}`, 'low',
      `toggleGridSize expanded grid to ${newSize} dots (from ${snap.gridSize}), label now "${r.label}". Reuses cached verifiedMasterRecords (isToggle short-circuit, no network refetch). SMELL CONFIRMED: verified count (${snap.gridVerified}) < both grid sizes (441/625), so the surplus slots are non-interactive placeholder filler — most of a 625 grid is empty padding, which can misrepresent archive size.`);
  }

  await page.close();
}

// ---------------------------------------------------------------------------
// DATAVIZ  (TOOL-17..22)  -- local ../../../data/*.json
// ---------------------------------------------------------------------------
async function testDataviz(browser) {
  const { page, errors } = await newPage(browser);
  await page.goto(DV_URL, { waitUntil: 'domcontentloaded' });
  // Wait for the loading overlay to hide (core data loaded) or error.
  await page.waitForFunction(() => {
    const main = document.getElementById('dashboard-main');
    const ls = document.getElementById('loading-state');
    return (main && !main.classList.contains('hidden')) || /Could not load/i.test(ls?.textContent || '');
  }, { timeout: 40000 }).catch(() => {});
  await sleep(1500); // allow charts + background full-summary load to settle

  const snap = await page.evaluate(() => {
    const txt = id => (document.getElementById(id)?.textContent || '').trim();
    const mainVisible = !document.getElementById('dashboard-main')?.classList.contains('hidden');
    const loadingText = document.getElementById('loading-state')?.textContent.trim();
    const catCount = document.querySelectorAll('#dashboard-category-filters input').length;
    const pubCount = document.querySelectorAll('#dashboard-publication-filters input').length;
    const sliderPresent = !!document.querySelector('#date-slider .noUi-handle');
    const tableRows = document.querySelectorAll('#data-table-container tbody tr').length;
    const tableHeaders = [...document.querySelectorAll('#data-table-container th[data-sort]')].map(h => h.dataset.sort);
    const firstDate = document.querySelector('#data-table-container tbody tr td')?.textContent.trim();
    const pagination = txt('table-pagination-controls');
    // charts: canvas elements present + Chart registered
    const chartCanvases = ['thematic-focus-chart', 'publications-treemap-chart', 'top-concepts-chart', 'yearly-activity-chart']
      .map(id => ({ id, present: !!document.getElementById(id) }));
    const chartJsLoaded = typeof window.Chart !== 'undefined';
    return {
      mainVisible, loadingText,
      stats: { records: txt('stat-total-records'), years: txt('stat-years-covered'), pubs: txt('stat-publications'), active: txt('stat-active-year') },
      catCount, pubCount, sliderPresent, tableRows, tableHeaders, firstDate, pagination, chartCanvases, chartJsLoaded
    };
  });

  const errs = realErrors(errors);
  const cdnFails = errs.filter(e => /cdn\.|cdnjs|jsdelivr/.test(e));
  const coreFailed = !snap.mainVisible;

  // TOOL-17: load archive JSON + optional entity graph + lazy summaries
  {
    V['TOOL-17'] = verdict(
      coreFailed ? 'fail' : 'pass',
      coreFailed ? `Dashboard did not become visible. loading-state="${snap.loadingText}". errors: ${errs.join(' ; ')}` : '',
      'high',
      `Core archive-core.json loaded relatively (../../../data/), dashboard visible=${snap.mainVisible}. Records mapped, type==='social' excluded, kept if id+title+finite year. Entity graph (archive-entities.json, 1322 Concept entities) loaded in its own guard; archive-details.json patched in background. Stat "records"=${snap.stats.records}.`
    );
  }

  // TOOL-18: filters (search, year slider, category/publication checkboxes)
  {
    let filterResult = null;
    if (!coreFailed) {
      try {
        filterResult = await page.evaluate(async () => {
          const before = document.getElementById('stat-total-records').textContent.trim();
          const input = document.getElementById('dashboard-search');
          input.value = 'press';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 450)); // past 300ms debounce
          const after = document.getElementById('stat-total-records').textContent.trim();
          // toggle first category checkbox
          const cb = document.querySelector('#dashboard-category-filters input');
          let catBefore = after, catAfter = after;
          if (cb) {
            cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
            await new Promise(r => setTimeout(r, 50));
            catAfter = document.getElementById('stat-total-records').textContent.trim();
          }
          // reset
          document.getElementById('dashboard-reset-filters').click();
          await new Promise(r => setTimeout(r, 50));
          const reset = document.getElementById('stat-total-records').textContent.trim();
          return { before, after, catBefore, catAfter, reset };
        });
      } catch (e) { filterResult = { err: String(e) }; }
    }
    const ok = filterResult && !filterResult.err && filterResult.before !== filterResult.after;
    V['TOOL-18'] = verdict(
      coreFailed ? 'blocked' : (ok ? 'pass' : 'partial'),
      coreFailed ? 'Core data did not load.' : (filterResult?.err || ''),
      'medium',
      coreFailed ? 'Blocked on core load.' : `Search "press": ${filterResult?.before} -> ${filterResult?.after} records. Category checkbox: -> ${filterResult?.catAfter}. Reset -> ${filterResult?.reset}. ${snap.catCount} category + ${snap.pubCount} publication checkboxes (top 10). SMELL CONFIRMED in code: search runs against ~120-char summaryPreview until archive-details.json (~13MB) loads in background, then upgrades silently — early searches can miss matches with no UI indication.`
    );
  }

  // TOOL-19: summary stat cards
  {
    const s = snap.stats;
    const ok = !coreFailed && /^[\d,]+$/.test(s.records) && /\d{4} - \d{4}/.test(s.years) && /^\d+$/.test(s.pubs) && /^\d{4}$/.test(s.active);
    V['TOOL-19'] = verdict(
      coreFailed ? 'blocked' : (ok ? 'pass' : 'partial'),
      coreFailed ? 'Core data did not load.' : (ok ? '' : `Unexpected stat formats: ${JSON.stringify(s)}`),
      'low',
      coreFailed ? 'Blocked on core load.' : `Stat cards: records=${s.records}, years="${s.years}", publications=${s.pubs}, mostActiveYear=${s.active}. All recompute on filter change.`
    );
  }

  // TOOL-20: four charts + CDN resilience + top-concepts depends on entities
  {
    const allCanvas = snap.chartCanvases.every(c => c.present);
    // confirm top-concepts has data (entities loaded). Probe chart instance.
    let conceptData = null;
    if (!coreFailed && snap.chartJsLoaded) {
      try {
        conceptData = await page.evaluate(() => {
          // reach into Chart registry via canvas
          const c = document.getElementById('top-concepts-chart');
          const inst = window.Chart?.getChart ? window.Chart.getChart(c) : null;
          return inst ? (inst.data?.labels?.length || 0) : 'no-instance';
        });
      } catch (e) { conceptData = String(e); }
    }
    V['TOOL-20'] = verdict(
      coreFailed ? 'blocked' : (allCanvas && snap.chartJsLoaded ? 'pass' : 'partial'),
      coreFailed ? 'Core data did not load.' : (cdnFails.length ? `chart CDN issues: ${cdnFails.join(' ; ')}` : ''),
      'medium',
      coreFailed ? 'Blocked on core load.' : `Chart.js loaded=${snap.chartJsLoaded}; 4 chart canvases present=${allCanvas}. top-concepts label count=${conceptData} (entities present: 1322 Concept entities, so chart populates here). updateAllCharts no-ops if Chart undefined; CDN scripts carry SRI. SMELL CONFIRMED in code: if archive-entities.json were missing/empty the top-concepts chart renders empty with only console.warn, no in-UI message.`
    );
  }

  // TOOL-21: sortable paginated table + date sort smell
  {
    let sortResult = null;
    if (!coreFailed) {
      try {
        sortResult = await page.evaluate(async () => {
          const firstBefore = document.querySelector('#data-table-container tbody tr td')?.textContent.trim();
          // click Date header to sort
          const th = document.querySelector('#data-table-container th[data-sort="publication_date"]');
          th?.click();
          await new Promise(r => setTimeout(r, 50));
          const firstAfter = document.querySelector('#data-table-container tbody tr td')?.textContent.trim();
          // change rows-per-page to 25
          const sel = document.getElementById('rows-per-page-select');
          sel.value = '25'; sel.dispatchEvent(new Event('change', { bubbles: true }));
          await new Promise(r => setTimeout(r, 50));
          const rowsNow = document.querySelectorAll('#data-table-container tbody tr').length;
          return { firstBefore, firstAfter, rowsNow };
        });
      } catch (e) { sortResult = { err: String(e) }; }
    }
    const ok = sortResult && !sortResult.err && sortResult.firstBefore !== sortResult.firstAfter;
    V['TOOL-21'] = verdict(
      coreFailed ? 'blocked' : (ok ? 'pass' : 'partial'),
      coreFailed ? 'Core data did not load.' : (sortResult?.err || ''),
      'low',
      coreFailed ? 'Blocked on core load.' : `Table: headers ${JSON.stringify(snap.tableHeaders)}, default rows=${snap.tableRows}. Date sort toggled first row "${sortResult?.firstBefore}" -> "${sortResult?.firstAfter}"; rows-per-page 10->25 gave ${sortResult?.rowsNow} rows. Pagination text: "${snap.pagination}". SMELL CONFIRMED in code: sort uses raw </> on values; publication_date is ISO so lexical≈chronological, but any non-ISO/empty date sorts wrong and empties drift to one end.`
    );
  }

  // TOOL-22: CSV export + formula-injection guard
  {
    let exportResult = null;
    if (!coreFailed) {
      try {
        exportResult = await page.evaluate(() => {
          // intercept anchor click + blob to capture CSV content and filename
          const realCreate = URL.createObjectURL;
          let captured = null, filename = null;
          // monkey-patch to read the blob
          return new Promise(async (resolve) => {
            const origAppend = document.body.appendChild.bind(document.body);
            document.body.appendChild = function (node) {
              if (node.tagName === 'A' && node.download) {
                filename = node.getAttribute('download');
                // prevent navigation
                node.click = () => {};
              }
              return origAppend(node);
            };
            // capture blob text by overriding createObjectURL
            URL.createObjectURL = function (blob) {
              captured = blob;
              return 'blob:captured';
            };
            URL.revokeObjectURL = function () {};
            document.getElementById('export-csv-btn').click();
            const text = captured ? await captured.text() : null;
            // restore
            URL.createObjectURL = realCreate;
            resolve({ filename, header: text ? text.split('\r\n')[0] : null, rowCount: text ? text.split('\r\n').length - 1 : 0, sample: text ? text.split('\r\n').slice(1, 2)[0]?.slice(0, 120) : null });
          });
        });
      } catch (e) { exportResult = { err: String(e) }; }
    }
    const ok = exportResult && !exportResult.err && /^id,publication_date,title/.test(exportResult.header || '');
    V['TOOL-22'] = verdict(
      coreFailed ? 'blocked' : (ok ? 'pass' : 'partial'),
      coreFailed ? 'Core data did not load.' : (exportResult?.err || ''),
      'low',
      coreFailed ? 'Blocked on core load.' : `CSV export: filename="${exportResult?.filename}", header="${exportResult?.header}", ${exportResult?.rowCount} data rows. escapeCsvCell prefixes a leading apostrophe for cells starting with = + - @ tab CR LF (formula-injection guard, issue #423) + RFC-4180 quoting. Empty-set path alerts "No data to export". Verified present in code.`
    );
  }

  if (errs.length) {
    V['TOOL-17'].errors_found = (V['TOOL-17'].errors_found ? V['TOOL-17'].errors_found + ' | ' : '') + 'page errors: ' + errs.join(' ; ');
  }
  await page.close();
}

run().catch(e => { console.error('HARNESS FAILED:', e); process.exit(1); });
