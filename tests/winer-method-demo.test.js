import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONCEPTS,
  CONNECTIONS,
  CURATOR_FINDINGS,
  ENTITIES,
  MANIFEST,
  PRESETS,
  RECORDS,
  TRAIL_STOPS,
} from '../features/winer-method/data.js';
import initSqlJs from 'sql.js';
import { parseState, queryPreset, runPreset, serializeState } from '../features/winer-method/script.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureDir = path.join(root, 'features', 'winer-method');
const html = fs.readFileSync(path.join(featureDir, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(featureDir, 'script.js'), 'utf8');
const styles = fs.readFileSync(path.join(featureDir, 'styles.css'), 'utf8');
const releaseVersion = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8')).version;

describe('Winer method demonstration corpus', () => {
  it('is a deeply frozen, chronological 11-record public-source dataset spanning 2001–2026', () => {
    assert.equal(RECORDS.length, 11);
    assert.equal(MANIFEST.recordCount, 11);
    assert.equal(RECORDS[0].year, 2001);
    assert.equal(RECORDS.at(-1).year, 2026);
    assert.deepEqual(RECORDS.map(({ date }) => date), [...RECORDS.map(({ date }) => date)].sort());
    assert.ok(Object.isFrozen(RECORDS));
    assert.ok(RECORDS.every(Object.isFrozen));
  });

  it('keeps unique stable IDs, canonical HTTPS URLs, provenance, and restrained summaries on every record', () => {
    assert.equal(new Set(RECORDS.map(({ id }) => id)).size, RECORDS.length);
    for (const record of RECORDS) {
      assert.match(record.id, /^direct-\d{4}-[a-z0-9-]+$/);
      assert.match(record.url, /^https:\/\/(scripting\.com|pressthink\.org|source\.scripting\.com|blogroll\.scripting\.com|github\.com\/scripting)\//);
      assert.ok(record.summary.length >= 100 && record.summary.length <= 460, `${record.id} summary length`);
      assert.ok(record.evidence.length >= 25, `${record.id} evidence note`);
      assert.ok(record.themes.length > 0 && record.entities.length > 0);
    }
    assert.equal(RECORDS[0].url, 'https://scripting.com/2001/01.html#myBlogOnTheDesktop');
    assert.equal(RECORDS[1].url, 'https://scripting.com/2004/08.html#When:3:28:15PM');
    assert.equal(RECORDS.find(({ id }) => id === 'direct-2013-networked-beat').date, '2013-05-13');
    assert.equal(RECORDS.find(({ id }) => id === 'direct-2024-social-blogroll').date, '2024-02-14');
    assert.doesNotMatch(
      JSON.stringify({ records: RECORDS, trail: TRAIL_STOPS, concepts: CONCEPTS }),
      /journalism syllabus|becomes the seed|feeds chosen by a reader|share a community story flow/,
    );
  });

  it('backs every editorial connection with existing entities and a source record', () => {
    const entityIds = new Set(ENTITIES.map(({ id }) => id));
    const recordIds = new Set(RECORDS.map(({ id }) => id));
    assert.equal(CONNECTIONS.length, 7);
    for (const connection of CONNECTIONS) {
      assert.ok(entityIds.has(connection.from), `missing ${connection.from}`);
      assert.ok(entityIds.has(connection.to), `missing ${connection.to}`);
      assert.ok(recordIds.has(connection.evidenceRecord), `missing ${connection.evidenceRecord}`);
    }
  });

  it('provides an intentional five-stop trail with connective editorial copy', () => {
    const recordIds = new Set(RECORDS.map(({ id }) => id));
    assert.equal(TRAIL_STOPS.length, 5);
    assert.equal(new Set(TRAIL_STOPS.map(({ recordId }) => recordId)).size, 5);
    for (const stop of TRAIL_STOPS) {
      assert.ok(recordIds.has(stop.recordId), `missing trail evidence ${stop.recordId}`);
      assert.ok(stop.interpretation.length >= 80, `${stop.id} needs substantive interpretation`);
      assert.ok(stop.transition.length >= 55, `${stop.id} needs connective copy`);
    }
  });

  it('offers six bounded concepts and four evidence-linked curator findings', () => {
    const recordIds = new Set(RECORDS.map(({ id }) => id));
    assert.equal(CONCEPTS.length, 6);
    assert.equal(new Set(CONCEPTS.map(({ id }) => id)).size, CONCEPTS.length);
    assert.equal(CURATOR_FINDINGS.length, 4);
    for (const item of [...CONCEPTS, ...CURATOR_FINDINGS]) {
      assert.ok(item.evidenceRecordIds.length >= 2, `${item.id} needs plural evidence`);
      assert.ok(item.evidenceRecordIds.every((id) => recordIds.has(id)), `${item.id} has missing evidence`);
    }
  });
});

describe('Winer method safe query presets and deep links', () => {
  it('offers only named allowlisted presets and never accepts arbitrary SQL', async () => {
    assert.deepEqual(PRESETS.map(({ id }) => id), ['all', 'idea', 'infrastructure', 'participation']);
    assert.equal(runPreset('all').length, 11);
    assert.ok(runPreset('idea').length > 0);
    assert.deepEqual(runPreset('DROP TABLE records'), RECORDS);
    assert.doesNotMatch(script, /\beval\s*\(|sqliteService|archiveService|params\.get\(['"]sql/i);
    const SQL = await initSqlJs();
    const database = new SQL.Database(fs.readFileSync(path.join(featureDir, 'demo.sqlite')));
    assert.deepEqual(queryPreset(database, 'all').map(({ id }) => id), RECORDS.map(({ id }) => id));
    for (const preset of PRESETS) {
      assert.deepEqual(
        queryPreset(database, preset.id).map(({ id }) => id),
        runPreset(preset.id).map(({ id }) => id),
        `${preset.id} fallback must match SQLite`,
      );
    }
    assert.deepEqual(
      database.exec('SELECT canonical_url FROM records ORDER BY date, id')[0].values.flat(),
      RECORDS.map(({ url }) => url),
    );
    assert.deepEqual(
      database.exec('SELECT date FROM records ORDER BY date, id')[0].values.flat(),
      RECORDS.map(({ date }) => date),
    );
    assert.deepEqual(
      database.exec('SELECT source_title FROM records ORDER BY date, id')[0].values.flat(),
      RECORDS.map(({ sourceTitle }) => sourceTitle),
    );
    assert.deepEqual(
      database.exec('SELECT id, date, year, title, creator, source, source_type, canonical_url, summary, evidence FROM records ORDER BY date, id')[0].values,
      RECORDS.map((record) => [record.id, record.date, record.year, record.title, record.creator, record.source, record.sourceType, record.url, record.summary, record.evidence]),
    );
    assert.deepEqual(queryPreset(database, 'DROP TABLE records').map(({ id }) => id), RECORDS.map(({ id }) => id));
    database.close();
  });

  it('round-trips valid URL state and discards unknown or injected values', () => {
    const state = parseState('?view=records&preset=idea&record=direct-2009-flying-seminar');
    assert.deepEqual(state, { view: 'records', preset: 'all', record: 'direct-2009-flying-seminar', concept: null });
    assert.deepEqual(parseState('?view=<script>&preset=SELECT+*&record=../../secret&concept=javascript:alert(1)'), {
      view: 'trail', preset: 'all', record: null, concept: null,
    });
    assert.equal(serializeState(state), '?view=records&record=direct-2009-flying-seminar');
  });

  it('canonicalizes record permalinks to the complete corpus so an incompatible preset cannot hide the requested record', () => {
    const recordId = 'direct-2001-desktop-websites';
    const state = parseState(`?view=records&preset=infrastructure&record=${recordId}`);
    assert.deepEqual(state, { view: 'records', preset: 'all', record: recordId, concept: null });
    assert.equal(serializeState({ view: 'records', preset: 'infrastructure', record: recordId }), `?view=records&record=${recordId}`);
    assert.ok(runPreset(state.preset).some(({ id }) => id === recordId));
  });

  it('round-trips allowlisted concept pages and strips state that does not belong to the active view', () => {
    assert.deepEqual(parseState('?view=concepts&concept=provenance'), {
      view: 'concepts', preset: 'all', record: null, concept: 'provenance',
    });
    assert.equal(serializeState({ view: 'concepts', concept: 'provenance' }), '?view=concepts&concept=provenance');
    assert.deepEqual(parseState('?view=concepts&concept=../../private&record=direct-2001-desktop-websites'), {
      view: 'concepts', preset: 'all', record: null, concept: null,
    });
    assert.deepEqual(parseState('?view=trail&record=direct-2001-desktop-websites&concept=provenance'), {
      view: 'trail', preset: 'all', record: null, concept: null,
    });
  });
});

describe('Winer method public page and deployment', () => {
  it('ships an accessible, noindex, visibly independent standalone page', () => {
    assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/pressthink\.org\/j\/rosen-archive\/features\/winer-method\/">/);
    assert.match(html, /<meta property="og:type" content="website">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/pressthink\.org\/j\/rosen-archive\/features\/winer-method\/">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/pressthink\.org\/j\/rosen-archive\/og-image\.png">/);
    assert.match(html, /<meta property="og:image:width" content="1200">/);
    assert.match(html, /<meta property="og:image:height" content="630">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /Independent, unendorsed demonstration/);
    assert.match(html, /Dave Winer did not commission, review, or endorse it\./);
    assert.match(html, /Winer formulates and builds/);
    assert.match(html, /Rosen translates the journalism implications/);
    assert.match(html, /This demonstration is an interpretation, not an endorsement/);
    assert.match(html, /<dt>Span<\/dt><dd>2001–2026<\/dd>/);
    assert.doesNotMatch(html, /<dt>Years<\/dt><dd>26<\/dd>/);
    assert.match(html, /<a class="skip-link" href="#demo-content">/);
    assert.match(html, /<main>/);
    assert.match(html, /<h1 id="page-title">/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, new RegExp(`<script type="module" src="\\.\\/script\\.js\\?v=${releaseVersion}"><\\/script>`));
  });

  it('loads the standalone-page display and mono webfonts with an early connection hint', () => {
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/);
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
    assert.match(html, /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Roboto\+Mono:wght@300;400;500;700&family=Special\+Elite&display=swap" rel="stylesheet">/);
  });

  it('uses only local frozen feature data and performs no runtime scraping or unrestricted fetch', () => {
    assert.doesNotMatch(script, /XMLHttpRequest|WebSocket|EventSource|\.\.\/\.\.\/data\//);
    assert.deepEqual([...script.matchAll(/fetch\(([^)]+)\)/g)].map((match) => match[1]), ["'./demo.sqlite'"]);
    assert.match(script, new RegExp(`from '\\.\\/data\\.js\\?v=${releaseVersion}'`));
    const externalResourceHints = [...html.matchAll(/<link\b[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => /rel="(?:preconnect|stylesheet)"/.test(tag))
      .map((tag) => tag.match(/href="(https?:\/\/[^\"]+)"/)?.[1])
      .filter(Boolean);
    assert.deepEqual(
      externalResourceHints,
      [
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
        'https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;500;700&family=Special+Elite&display=swap',
      ],
    );
  });

  it('leads with the authored trail and presents record controls as editorial lenses', () => {
    assert.match(html, /<a class="primary-action" href="#explore">Begin with the authored trail<\/a>/);
    assert.match(html, /<section class="explorer"[^>]+data-lenses[^>]+hidden/);
    assert.match(html, /<p class="archive-folder-tab eyebrow"><span>Editorial lenses<\/span><\/p>/);
    assert.match(html, /Read the source records from four angles/);
    assert.doesNotMatch(html, /Four safe ways|free-form database console|fixed local filters/);
    assert.match(script, /Bounded interface/);
    assert.match(script, /allowlisted, read-only query presets/);
    assert.match(script, /no free-form SQL/);
  });

  it('uses a compact split hero and retains useful two-column tablet layouts', () => {
    assert.match(html, /<div class="hero-copy">/);
    assert.match(html, /<aside class="hero-context"/);
    assert.match(styles, /\.hero\s*\{[^}]*grid-template-columns:/s);
    assert.doesNotMatch(styles, /8vw, 7rem/);
    assert.match(styles, /@media \(max-width: 900px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(styles, /@media \(max-width: 640px\)[\s\S]*grid-template-columns: 1fr/);
  });

  it('renders the bounded editorial layers and keeps the complete corpus in source records', () => {
    assert.match(script, /TRAIL_STOPS\.map/);
    assert.match(script, /CURATOR_FINDINGS\.map/);
    assert.match(script, /CONCEPTS\.map/);
    assert.match(script, /function renderRecords\(records\)/);
    assert.match(script, /Download source manifest \(JSON\)/);
    assert.match(script, /Download offline ingestion log \(JSON\)/);
    assert.doesNotMatch(script, /function renderTrail\(records\)/);
    assert.match(script, /<strong>Primary source title:<\/strong>/);
    assert.match(script, /Download retrieval evidence \(JSON\)/);
  });

  it('uses context-accurate record links and accessible names for focusable articles', () => {
    assert.match(script, /compact \? 'Open full record'/);
    assert.match(script, /'Focus record and update share URL'/);
    assert.match(script, /'Focused record permalink'/);
    assert.match(script, /<article class="record-card[^>]+aria-labelledby="record-title-\$\{record\.id\}"/);
    assert.match(script, /<h3 id="record-title-\$\{record\.id\}">/);
    assert.doesNotMatch(script, /closest\('\[data-record-id\]'\)/);
  });

  it('renders connections as linked entity-to-entity evidence paths with useful counts', () => {
    assert.match(script, /class="relation-map"/);
    assert.match(script, /class="entity-node" href="#entity-\$\{source\.id\}"/);
    assert.match(script, /class="entity-node" href="#entity-\$\{target\.id\}"/);
    assert.match(script, /supporting record/);
    assert.match(script, /linked evidence record/);
    assert.match(styles, /\.relation-map/);
    assert.doesNotMatch(html, /d3(?:\.min)?\.js|vis-network|cytoscape/i);
  });

  it('preserves native entity-fragment navigation without re-rendering the connections view', () => {
    assert.match(script, /const nextState = parseState\(window\.location\.search\);/);
    assert.match(script, /if \(serializeState\(nextState\) === serializeState\(state\)\) return;/);
    assert.match(script, /function focusEntityFragment\(\)/);
    assert.match(script, /if \(!focusEntityFragment\(\) && state\.view !== 'trail' && !state\.record\) focusContentHeading\(\);/);
  });

  it('scrolls newly focused view headings into the viewport after navigation', () => {
    assert.match(script, /document\.documentElement\.style\.scrollBehavior = 'auto';/);
    assert.match(script, /heading\.scrollIntoView\(\{ block: 'center' \}\);/);
    assert.match(script, /heading\.focus\(\{ preventScroll: true \}\);/);
  });

  it('routes every on-page state link without a disorienting full-page reload', () => {
    assert.match(html, /class="quiet-link" data-state-link href="\?view=method"/);
    assert.match(html, /class="secondary-action" data-state-link href="\?view=records"/);
    assert.match(html, /data-state-link href="\?view=method">Source manifest<\/a>/);
    assert.match(script, /document\.addEventListener\('click', \(event\) => \{/);
    assert.match(script, /data-state-link href="\$\{(?:escapeHtml\()?serializeState\(/);
  });

  it('keeps keyboard-focused view tabs visible in the mobile scroll strip', () => {
    assert.match(script, /button\.addEventListener\('focus', \(\) => button\.scrollIntoView\(\{ block: 'nearest', inline: 'center' \}\)\)/);
  });

  it('reveals the active view tab for shared URLs and provides a keyboard-accessible manifest table', () => {
    assert.match(script, /activeTab\.scrollIntoView\(\{ block: 'nearest', inline: 'center' \}\)/);
    assert.match(script, /id="manifest-scroll-hint"/);
    assert.match(script, /class="table-wrap" tabindex="0" aria-describedby="manifest-scroll-hint"/);
  });

  it('shows cited records and shared deep-link content regardless of prior UI state', () => {
    assert.match(script, /serializeState\(\{ view: 'records', preset: 'all', record: record\.id \}\)/);
    assert.match(script, /if \(!focusEntityFragment\(\) && state\.view !== 'trail' && !state\.record\) focusContentHeading\(\);/);
    assert.match(script, /window\.addEventListener\('popstate', \(\) => \{/);
  });

  it('renders only once during initial SQLite loading so a selected record is centered once', () => {
    assert.match(script, /render\(\);\s*try \{\s*await loadDatabase\(\);/);
    assert.doesNotMatch(script, /await loadDatabase\(\);\s*render\(\);/);
  });

  it('is present in the deploy manifest, deployment guide, and preview audit', () => {
    const deployScript = fs.readFileSync(path.join(root, 'backend', 'scripts', 'deploy_full_site.py'), 'utf8');
    const deployment = fs.readFileSync(path.join(root, 'DEPLOYMENT.md'), 'utf8');
    const audit = fs.readFileSync(path.join(root, 'scripts', 'preview-audit.js'), 'utf8');
    const previewServer = fs.readFileSync(path.join(root, 'scripts', 'preview-server.js'), 'utf8');
    assert.match(deployScript, /'features\/winer-method'/);
    assert.match(deployment, /winer-method\//);
    assert.match(audit, /url: '\/features\/winer-method\/'/);
    assert.match(previewServer, /'\.wasm': 'application\/wasm'/);
    assert.match(html, new RegExp(`shared-styles\\.css\\?v=${releaseVersion}`));
    assert.match(html, new RegExp(`styles\\.css\\?v=${releaseVersion}`));
    assert.match(html, new RegExp(`sql-wasm\\.js\\?v=${releaseVersion}`));
    assert.match(html, new RegExp(`script\\.js\\?v=${releaseVersion}`));
    assert.match(script, new RegExp(`from './data\\.js\\?v=${releaseVersion}'`));
    for (const file of ['index.html', 'styles.css', 'data.js', 'script.js', 'source-manifest.json', 'ingestion-log.json', 'retrieval-evidence.json', 'capture-ingestion-evidence.mjs', 'build-data-artifacts.mjs', 'sql-wasm.js', 'demo.sqlite', 'README.md']) {
      assert.ok(fs.existsSync(path.join(featureDir, file)), `${file} must ship`);
    }
    const sourceManifest = JSON.parse(fs.readFileSync(path.join(featureDir, 'source-manifest.json'), 'utf8'));
    const ingestionLog = JSON.parse(fs.readFileSync(path.join(featureDir, 'ingestion-log.json'), 'utf8'));
    assert.equal(ingestionLog.runtimeNetworkAccess, false);
    assert.deepEqual(ingestionLog.records.map(({ id }) => id), RECORDS.map(({ id }) => id));
    assert.equal(sourceManifest.records.length, RECORDS.length);
    assert.deepEqual(sourceManifest.records, RECORDS.map((record) => ({
      id: record.id,
      date: record.date,
      sourceTitle: record.sourceTitle,
      recordTitle: record.title,
      creator: record.creator,
      source: record.source,
      sourceType: record.sourceType,
      canonicalUrl: record.url,
      verificationNote: record.evidence,
    })));
  });
});
