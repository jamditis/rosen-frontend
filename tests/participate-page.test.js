import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const html = read('features/participate/index.html');
const css = read('features/participate/styles.css');
const script = read('features/participate/script.js');

describe('Ways to participate standalone page', () => {
  it('is canonical, crawlable, useful without JavaScript, and share-ready', () => {
    assert.match(html, /rel="canonical" href="https:\/\/pressthink\.org\/j\/rosen-archive\/features\/participate\/"/);
    assert.match(html, /property="og:title" content="Ways to participate/);
    assert.match(html, /property="og:image:alt"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /name="twitter:image:alt"/);
    assert.match(html, /rel="icon" type="image\/svg\+xml" href="\.\.\/\.\.\/favicon\.svg"/);
    assert.match(html, /rel="icon" href="\.\.\/\.\.\/favicon\.ico"/);
    assert.match(html, /<main id="main-content">/);
    assert.match(html, /class="skip-link"/);
    assert.match(html, /<script src="\.\/script\.js\?v=\d+\.\d+\.\d+" defer><\/script>/);
  });

  it('organizes the six grounded activities into three clear participation lanes', () => {
    const lanes = html.match(/<article class="participation-path/g) || [];
    assert.equal(lanes.length, 3);
    for (const text of [
      'Share a record', 'Teach or research with it', 'Suggest a missing work',
      'Report a correction or barrier', 'Follow new additions', 'Reuse the project',
    ]) assert.match(html, new RegExp(text));
    for (const heading of [
      'Use and share', 'Improve the record', 'Reuse or collaborate',
    ]) assert.match(html, new RegExp(heading));
    assert.match(html, /does not collect money/);
    assert.doesNotMatch(html, /sign up|donate|private Ways to Participate|will follow up/i);
  });

  it('uses one consistent action treatment and one clearly scoped email contact', () => {
    const actions = html.match(/class="action-link/g) || [];
    assert.equal(actions.length, 7);
    assert.equal((html.match(/href="mailto:/g) || []).length, 1);
    assert.match(html, /Public project route/);
    assert.match(html, /Private conversation/);
    assert.doesNotMatch(html, /class="(?:disclosure|contact|closing)"/);
    assert.match(css, /\.action-link\s*\{[^}]*min-height:\s*9\.25rem[^}]*height:\s*9\.25rem/s);
  });

  it('uses a real portrait and 36 frozen record-backed headlines', () => {
    assert.match(html, /photo-jay-rosen-bw\.jpg/);
    assert.match(html, /width="480" height="720" alt="Jay Rosen"/);
    assert.match(html, /<figure class="portrait-card">/);
    assert.match(html, /<figcaption>/);
    const coreRaw = JSON.parse(read('data/archive-core.json'));
    const records = coreRaw.records || coreRaw;
    const byId = new Map(records.map((record) => [record.id, record.title]));
    const headlines = [...html.matchAll(/<span data-record-id="([^"]+)">([^<]+)<\/span>/g)];
    assert.equal(headlines.length, 36);
    for (const [, id, title] of headlines) {
      assert.equal(title.replaceAll('&amp;', '&'), byId.get(id), `${id} headline must match archive-core.json exactly`);
    }
  });

  it('keeps the archive-themed Easter egg hidden, keyboard reachable, and record backed', () => {
    assert.match(html, /class="portrait-stamp"/);
    assert.match(html, /id="archive-secret"[^>]*hidden/);
    assert.match(html, /\?record=RECORD-00070/);
    assert.match(script, /stamp\?\.addEventListener\('click'/);
    assert.match(script, /stampPresses >= 3/);
    assert.match(script, /typed\.endsWith\('audience'\)/);
    assert.match(script, /event\.key === 'Escape'/);
    assert.match(css, /\.archive-secret\[hidden\]/);
  });

  it('bridges only to the existing report intents and explains their public context', () => {
    assert.match(html, /\?report=record&amp;source=participate/);
    assert.match(html, /\?report=problem&amp;source=participate/);
    assert.match(html, /become public GitHub issues/);
    assert.equal((html.match(/Creates a public GitHub issue\./g) || []).length, 2);
    assert.match(html, /problem reports also attach browser information/);
    assert.match(html, /email address, it will appear in that public issue/);
  });

  it('keeps the three Start here orientation cards and adds participation as a secondary strip', () => {
    const start = read('frontend/components/StartHerePage.js');
    assert.match(start, /md:grid-cols-3/);
    assert.equal((start.match(/className="group border border-stone-200 bg-white p-6 text-left/g) || []).length, 3);
    assert.match(start, /Help keep the archive useful/);
    assert.match(start, /features\/participate\//);
    assert.match(read('frontend/components/AboutPage.js'), /onParticipate/);
    assert.match(read('frontend/App.js'), />Ways to participate</);
    assert.doesNotMatch(read('frontend/components/ToolsModal.js'), /action: 'participate'/);
  });

  it('has responsive, focus-visible, and reduced-motion safeguards', () => {
    assert.match(css, /a:focus-visible/);
    assert.match(css, /@media \(max-width: 520px\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /overflow-x: hidden/);
    assert.match(css, /footer nav a\s*\{[^}]*min-height:\s*44px/s);
  });

  it('states the reuse terms instead of asking visitors to infer them', () => {
    assert.match(html, /MIT-licensed code/);
    assert.match(html, /Metadata license \(CC BY 4\.0\)/);
    assert.match(html, /original works retain their original copyright/i);
  });

  it('is included in deployment and preview auditing', () => {
    assert.match(read('backend/scripts/deploy_full_site.py'), /'features\/participate'/);
    assert.match(read('DEPLOYMENT.md'), /participate\/\s+# Ways to Participate/);
    assert.match(read('scripts/preview-audit.js'), /slug: 'participate',\s+url: '\/features\/participate\/'/);
  });
});
