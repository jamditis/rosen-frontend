// The observer has to start over on every audited route (#772).
//
// This is the check that source-reading tests cannot make. An init script runs
// on a document navigation and never on a fragment one, so two routes that
// differ only by hash share one document and one entry list. The audit's route
// order contains exactly that pair, and the second route was reporting the
// first route's shifts on top of its own.
//
// The test drives a real browser over a fixture page that shifts by a
// different amount per hash, so the entries say which route produced them. It
// first reproduces the leak, then shows the audit's rule removing it.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import {
  installLayoutShiftObserver,
  requiresFreshDocument,
} from '../scripts/layout-shift-probe.js';

// A machine without the Playwright browser skips this file rather than
// failing it. Asking the launcher is the only reliable probe: the audit runs
// on the headless shell build, whose path is not the one executablePath()
// reports.
let launchedBrowser = null;
let launchFailure = '';
try {
  launchedBrowser = await chromium.launch();
} catch (err) {
  launchFailure = err.message.split('\n')[0];
}

// Route "a" pushes the content down a little, route "b" a lot. The Layout
// Instability value that reaches the observer therefore identifies the route.
const FIXTURE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>shift fixture</title>
<style>body { margin: 0; font: 16px monospace; } #pushed { height: 0; }</style>
</head><body>
<div id="pushed"></div>
<p id="content">content that moves when the block above it grows</p>
<script>
  function shift() {
    var height = location.hash === '#b' ? 240 : 40;
    setTimeout(function () {
      document.getElementById('pushed').style.height = height + 'px';
    }, 120);
  }
  shift();
  addEventListener('hashchange', shift);
</script>
</body></html>`;

async function startFixtureServer() {
  const server = createServer((req, res) => {
    if (req.url.startsWith('/bootstrap')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"fixture":"bootstrap"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(FIXTURE);
  });
  await new Promise((ok) => { server.listen(0, '127.0.0.1', ok); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

describe('layout-shift observer across route transitions', {
  skip: launchedBrowser ? false : `chromium could not launch: ${launchFailure}`,
}, () => {
  let fixture;
  const browser = launchedBrowser;
  let context;
  let page;

  const readEntries = () => page.evaluate(
    () => (window.__previewLayoutShifts || []).map((entry) => ({ ...entry })),
  );
  const settle = () => page.waitForTimeout(600);

  before(async () => {
    fixture = await startFixtureServer();
    context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await installLayoutShiftObserver(context);
    page = await context.newPage();
  });

  after(async () => {
    await browser?.close();
    await new Promise((ok) => fixture.server.close(ok));
  });

  it('leaks the previous route when the audit only changes the hash', async () => {
    await page.goto(`${fixture.base}/#a`, { waitUntil: 'load' });
    await settle();
    const afterA = await readEntries();
    assert.ok(afterA.length > 0, 'the fixture did not produce a layout shift');
    const routeAValues = afterA.map((entry) => entry.value);

    // Playwright returns null for a navigation the browser handled inside the
    // current document. That is the whole problem: no new document, no init
    // script, no reset.
    const response = await page.goto(`${fixture.base}/#b`, { waitUntil: 'load' });
    assert.equal(response, null, 'expected a same-document fragment navigation');
    await settle();

    const afterB = await readEntries();
    assert.ok(
      afterB.length > afterA.length,
      'the fixture did not shift on the hash change',
    );
    assert.ok(
      routeAValues.every((value) => afterB.some((entry) => entry.value === value)),
      'route a entries should still be present, which is the leak this guards against',
    );
    assert.equal(requiresFreshDocument(`${fixture.base}/#a`, `${fixture.base}/#b`, fixture.base), true);
  });

  it('measures only the current route once the audit forces a document', async () => {
    await page.goto(`${fixture.base}/#a`, { waitUntil: 'load' });
    await settle();
    const routeAValues = (await readEntries()).map((entry) => entry.value);
    assert.ok(routeAValues.length > 0);

    // What auditOne does: land on the tiny bootstrap document first, so the
    // route that follows gets its own document.
    assert.equal(requiresFreshDocument(page.url(), `${fixture.base}/#b`, fixture.base), true);
    await page.goto(`${fixture.base}/bootstrap`, { waitUntil: 'domcontentloaded' });
    const fresh = await page.goto(`${fixture.base}/#b`, { waitUntil: 'load' });
    assert.ok(fresh, 'expected a real document navigation');
    await settle();

    const entries = await readEntries();
    assert.ok(entries.length > 0, 'route b did not report its own shift');
    assert.ok(
      entries.every((entry) => !routeAValues.includes(entry.value)),
      `route a entries survived into route b: ${JSON.stringify(entries)}`,
    );
  });

  it('measures a repeated route instead of a stale document', async () => {
    // Two audited routes share /#analytics. Navigating to the URL the page is
    // already on does nothing at all, so the second one measured a document
    // that had been sitting there since the first.
    await page.goto(`${fixture.base}/#b`, { waitUntil: 'load' });
    await settle();
    const repeated = await page.goto(`${fixture.base}/#b`, { waitUntil: 'load' });
    assert.equal(repeated, null, 'expected no navigation for an identical URL');
    assert.equal(requiresFreshDocument(page.url(), `${fixture.base}/#b`, fixture.base), true);

    await page.goto(`${fixture.base}/bootstrap`, { waitUntil: 'domcontentloaded' });
    await page.goto(`${fixture.base}/#b`, { waitUntil: 'load' });
    await settle();
    const entries = await readEntries();
    assert.ok(entries.length > 0);
    assert.ok(
      entries.every((entry) => entry.startTime < 5000),
      'entries should come from the document just loaded',
    );
  });
});
