#!/usr/bin/env node
// WCAG 2.1 AA accessibility audit + visual screenshots for the rosen-archive
// static bundle. Spawns the preview server, walks key routes at mobile and
// desktop viewports, runs axe-core, writes per-route screenshots + a single
// HTML report. Run via `npm run preview:audit`.
//
// Routes: top-level SPA hash routes + standalone subpages + one record
// deep-link to exercise the modal path. Update ROUTES below to add more.

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const PORT = Number(process.env.PREVIEW_PORT || 8765);
// Pick a connect target for Playwright that's always routable, regardless
// of what PREVIEW_HOST the server is bound to. Wildcard binds (0.0.0.0 in
// IPv4, :: and ::0 in IPv6) are accept-any-interface addresses, NOT connect
// destinations — translate each to its same-family loopback. Other PREVIEW_HOST
// values pass through unchanged. IPv6 literals get bracketed for URL syntax
// (`http://[::1]:8765`, not `http://::1:8765`). Hard-coding 'localhost' would
// silently fail on IPv6-first systems where it resolves to ::1 while the
// server only listens on IPv4.
const SERVER_HOST = process.env.PREVIEW_HOST || '127.0.0.1';
const WILDCARD_TO_LOOPBACK = { '0.0.0.0': '127.0.0.1', '::': '::1', '::0': '::1' };
const CLIENT_HOST = WILDCARD_TO_LOOPBACK[SERVER_HOST] || SERVER_HOST;
const URL_HOST = CLIENT_HOST.includes(':') && !CLIENT_HOST.startsWith('[')
  ? `[${CLIENT_HOST}]`
  : CLIENT_HOST;
const BASE = `http://${URL_HOST}:${PORT}`;
const OUT_DIR = resolve(fileURLToPath(import.meta.url), '..', '..', 'preview-audit-results');

const ROUTES = [
  { slug: 'home-archive',       url: '/' },
  { slug: 'explorer',           url: '/#explorer' },
  { slug: 'entities',           url: '/#entities' },
  { slug: 'about',              url: '/#about' },
  { slug: 'analytics',          url: '/#analytics' },
  { slug: 'record-modal',       url: '/?record=RECORD-00802' },
  { slug: 'dissertation',       url: '/dissertation/' },
  { slug: 'dissertation-reader',url: '/dissertation/reader/' },
  { slug: 'status-report',      url: '/features/status-report/' },
];

const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812  },
  { name: 'desktop', width: 1440, height: 900  },
];

async function startServer() {
  const proc = spawn('node', ['scripts/preview-server.js'], {
    env: { ...process.env, PREVIEW_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('preview server did not start in 8s')), 8000);
    // spawn() emits 'error' (not 'exit') when the executable is missing or
    // permission-denied — without this listener the audit would hang until
    // the 8s timeout instead of failing fast with a clear message.
    proc.on('error', (err) => { clearTimeout(t); fail(new Error(`preview server spawn failed: ${err.message}`)); });
    proc.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Preview server')) { clearTimeout(t); ok(); }
    });
    proc.on('exit', (code) => { clearTimeout(t); fail(new Error(`preview server exited early: ${code}`)); });
  });
  return proc;
}

async function auditOne(page, route, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(BASE + route.url, { waitUntil: 'networkidle', timeout: 30000 });
  // Async React render + lazy-loaded sql.js: small extra settle.
  await page.waitForTimeout(1500);

  const shotDir = resolve(OUT_DIR, 'screenshots', viewport.name);
  await mkdir(shotDir, { recursive: true });
  // Viewport-only screenshots. Full-page on long content (e.g. the dissertation
  // reader, which is the entire 1986 text) can OOM the chromium process.
  // Viewport is sufficient for visual review of the above-the-fold rendering.
  await page.screenshot({ path: resolve(shotDir, `${route.slug}.png`), fullPage: false, timeout: 15000 });

  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const result = await axe.analyze();
  return {
    route: route.slug,
    url: route.url,
    viewport: viewport.name,
    violations: result.violations.map(v => ({
      id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl,
      nodes: v.nodes.length, sample: v.nodes[0]?.target?.[0] || '',
    })),
    passes: result.passes.length,
    incomplete: result.incomplete.length,
  };
}

// HTML-escape every interpolated value in the report. Without this, an axe
// rule id, help URL, sample selector, or surfaced error message containing
// '<', '&', or quotes can break rendering or inject markup. err.message in
// particular originates from runtime exceptions (Playwright timeouts include
// the user-controlled URL) and is the most likely culprit.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function renderReport(rows) {
  const totalViolations = rows.reduce((s, r) => s + r.violations.length, 0);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Rosen archive — accessibility audit</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='13' font-size='14'%3E%E2%9C%93%3C/text%3E%3C/svg%3E">
  <style>
    body { font: 14px/1.5 -apple-system, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; color: #1c1917; }
    h1, h2, h3 { font-weight: 600; }
    .summary { background: #f5f5f4; padding: 1rem; border-radius: 6px; margin-bottom: 2rem; }
    .summary .ok { color: #16a34a; } .summary .bad { color: #dc2626; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e7e5e4; vertical-align: top; font-size: 13px; }
    th { background: #fafaf9; font-weight: 600; }
    .v-critical { color: #dc2626; font-weight: 600; }
    .v-serious  { color: #ea580c; font-weight: 600; }
    .v-moderate { color: #ca8a04; }
    .v-minor    { color: #57534e; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 11px; background: #e7e5e4; }
    .shot-link { font-size: 12px; }
    details { margin: 0.25rem 0; }
    code { background: #f5f5f4; padding: 0 4px; border-radius: 3px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Rosen archive — accessibility audit</h1>
  <div class="summary">
    <div>Generated: ${new Date().toISOString()}</div>
    <div>Standard: WCAG 2.1 AA (axe-core)</div>
    <div>Routes audited: ${ROUTES.length} &times; ${VIEWPORTS.length} viewports = ${ROUTES.length * VIEWPORTS.length} runs</div>
    <div>Total violations: <span class="${totalViolations === 0 ? 'ok' : 'bad'}">${totalViolations}</span></div>
  </div>

  <table>
    <thead><tr><th>Route</th><th>Viewport</th><th>Violations</th><th>Passes</th><th>Screenshot</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td><code>${esc(r.url)}</code><br><span class="badge">${esc(r.route)}</span></td>
        <td>${esc(r.viewport)}</td>
        <td>${r.violations.length === 0 ? '<span class="v-minor">0</span>' : r.violations.map(v => `
          <details><summary class="v-${esc(v.impact || 'minor')}">${esc(v.impact || 'minor')}: ${esc(v.help)} (${esc(v.nodes)} nodes)</summary>
            <div>Rule: <code>${esc(v.id)}</code> &middot; <a href="${esc(v.helpUrl)}">help</a></div>
            <div>Sample selector: <code>${esc(v.sample)}</code></div>
          </details>`).join('')}</td>
        <td>${esc(r.passes)}</td>
        <td><a class="shot-link" href="screenshots/${encodeURIComponent(r.viewport)}/${encodeURIComponent(r.route)}.png">view</a></td>
      </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;
  return html;
}

const server = await startServer();
try {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const rows = [];
  for (const viewport of VIEWPORTS) {
    for (const route of ROUTES) {
      console.log(`  ${viewport.name.padEnd(8)} ${route.url}`);
      try {
        rows.push(await auditOne(page, route, viewport));
      } catch (err) {
        console.error(`  FAILED ${viewport.name} ${route.url}: ${err.message}`);
        rows.push({ route: route.slug, url: route.url, viewport: viewport.name, violations: [{ id: 'audit-error', impact: 'critical', help: err.message, helpUrl: '', nodes: 0, sample: '' }], passes: 0, incomplete: 0 });
      }
    }
  }
  await browser.close();

  await writeFile(resolve(OUT_DIR, 'axe-report.html'), renderReport(rows));
  await writeFile(resolve(OUT_DIR, 'axe-report.json'), JSON.stringify(rows, null, 2));

  const totalViolations = rows.reduce((s, r) => s + r.violations.length, 0);
  console.log(`\nReport: ${resolve(OUT_DIR, 'axe-report.html')}`);
  console.log(`Total violations: ${totalViolations}`);
  if (totalViolations > 0) process.exitCode = 1;
} finally {
  server.kill();
}
