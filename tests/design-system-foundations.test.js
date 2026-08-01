import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const tokens = read('frontend/design-system/tokens.css');
const legacyBridge = read('frontend/design-system/legacy-token-bridge.css');
const recipes = read('frontend/design-system/recipes.css');
const index = read('index.html');
const demo = read('frontend/design-system/demo.html');
const participate = read('features/participate/index.html');
const participateCss = read('features/participate/styles.css');
const startHere = read('frontend/components/StartHerePage.js');
const worker = read('frontend/sw.js');
const audit = read('scripts/preview-audit.js');
const acceptance = read('docs/design-system-acceptance-2026-08-01.md');
const releaseManifest = read('docs/design-system-release-3.8.9.sha256');
const appVersion = JSON.parse(read('version.json')).version;

const position = (source, fragment) => {
  const found = source.indexOf(fragment);
  assert.notEqual(found, -1, `missing ${fragment}`);
  return found;
};

describe('archive design-system foundations', () => {
  it('defines the canonical semantic surface and signal roles', () => {
    for (const [name, value] of [
      ['archive-canvas', '#fdfbf7'],
      ['archive-paper', '#fffefa'],
      ['archive-paper-deep', '#f3eee3'],
      ['archive-ink', '#1c1917'],
      ['archive-ink-muted', '#57534e'],
      ['archive-rule', '#d6d3d1'],
      ['archive-hero', '#121b18'],
      ['archive-signal', '#f2bd49'],
      ['archive-manila', '#e8dfc8'],
      ['archive-sky', '#5aa9c9'],
      ['archive-amber', '#d89824'],
      ['archive-green', '#548873'],
    ]) {
      assert.match(tokens, new RegExp(`--${name}:\\s*${value.replace('#', '\\#')}`));
    }

    assert.match(tokens, /--color-paper:\s*var\(--archive-canvas\)/);
    assert.match(tokens, /--color-text-primary:\s*var\(--archive-ink\)/);
    assert.match(tokens, /--color-focus:\s*var\(--archive-focus\)/);
    assert.doesNotMatch(tokens, /\.(?:btn|card|modal-content|badge|pill)\s*\{/,
      'tokens.css must contain values only; reusable presentation belongs in recipes.css');
  });

  it('provides namespaced recipes for the planned interface roles', () => {
    for (const className of [
      'archive-canvas',
      'archive-section-label',
      'archive-action',
      'archive-action--primary',
      'archive-action--secondary',
      'archive-control',
      'archive-panel',
      'archive-panel--accent',
      'archive-frame',
      'archive-notice',
      'archive-stat',
      'archive-dialog-backdrop',
      'archive-dialog',
      'archive-density--compact',
      'archive-density--spacious',
    ]) {
      assert.match(recipes, new RegExp(`\\.${className.replaceAll('-', '\\-')}(?:[\\s:{.,]|$)`),
        `missing .${className}`);
      assert.match(demo, new RegExp(`class="[^"]*${className}`),
        `demo must render .${className}`);
    }

    assert.doesNotMatch(recipes, /\.(?:btn|card|modal-content|badge|pill)\s*\{/,
      'recipe names must not collide with page-owned generic classes');
  });

  it('builds accessibility behavior into the recipes', () => {
    assert.match(tokens, /--archive-target-min:\s*2\.75rem/);
    assert.match(recipes, /min-(?:block-)?size:\s*var\(--archive-target-min\)/);
    assert.match(recipes, /:focus-visible/);
    assert.match(recipes, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(recipes, /@media \(forced-colors: active\)/);
    assert.match(recipes, /@media \(hover: hover\)/);
    assert.match(
      recipes,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.archive-action:hover:not\(:disabled, \[aria-disabled='true'\]\)\s*\{\s*transform:\s*none;/,
      'reduced-motion hover must outrank the motion-enabled hover selector',
    );
    assert.match(
      recipes,
      /@media \(forced-colors: active\)[\s\S]*\.archive-action:hover:not\(:disabled, \[aria-disabled='true'\]\)\s*\{[\s\S]*color:\s*HighlightText;[\s\S]*background:\s*Highlight;[\s\S]*box-shadow:\s*none;/,
      'forced-colors hover must keep action colors under system control',
    );
    assert.match(
      demo,
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*html\s*\{\s*scroll-behavior:\s*auto;/,
      'the specimen page must disable smooth anchor scrolling for reduced motion',
    );
  });

  it('loads recipes after Tailwind and pre-caches both foundation stylesheets', () => {
    const bridgeRef = `./frontend/design-system/legacy-token-bridge.css?v=${appVersion}`;
    const tokenRef = `./frontend/design-system/tokens.css?v=${appVersion}`;
    const tailwindRef = `./frontend/dist/tailwind.css?v=${appVersion}`;
    const recipeRef = `./frontend/design-system/recipes.css?v=${appVersion}`;

    assert.ok(position(index, bridgeRef) < position(index, tokenRef));
    assert.ok(position(index, tokenRef) < position(index, tailwindRef));
    assert.match(worker, /'design-system\/legacy-token-bridge\.css'/);
    assert.ok(position(index, tailwindRef) < position(index, recipeRef));
    assert.match(worker, /'design-system\/tokens\.css'/);
    assert.match(worker, /'design-system\/recipes\.css'/);
  });

  it('keeps the specimen page in production stylesheet order', () => {
    const bridgeRef = `./legacy-token-bridge.css?v=${appVersion}`;
    const tokenRef = `./tokens.css?v=${appVersion}`;
    const tailwindRef = `../dist/tailwind.css?v=${appVersion}`;
    const recipeRef = `./recipes.css?v=${appVersion}`;

    assert.ok(position(demo, bridgeRef) < position(demo, tokenRef));
    assert.ok(position(demo, tokenRef) < position(demo, tailwindRef));
    assert.ok(position(demo, tailwindRef) < position(demo, recipeRef));
    assert.match(demo, /name="twitter:image:alt"/);
    assert.doesNotMatch(demo, /role="dialog"|aria-modal="true"/,
      'an inert visual specimen must not announce an active modal');
  });

  it('bridges semantic tokens when the previous service worker supplies its cached token file', () => {
    assert.match(legacyBridge, /--archive-canvas:\s*var\(--color-paper, #fdfbf7\)/);
    assert.match(legacyBridge, /--archive-hero:\s*#121b18/);
    assert.match(legacyBridge, /--archive-on-dark:\s*#fdfbf7/);
    assert.match(legacyBridge, /--archive-signal:\s*var\(--color-accent-amber, #f2bd49\)/);

    const participateBridge = `../../frontend/design-system/legacy-token-bridge.css?v=${appVersion}`;
    const participateTokens = `../../frontend/design-system/tokens.css?v=${appVersion}`;
    assert.ok(position(participate, participateBridge) < position(participate, participateTokens));
  });

  it('lets the approved participation page consume the canonical tokens without changing its page-owned layout', () => {
    const tokenRef = `../../frontend/design-system/tokens.css?v=${appVersion}`;
    const recipeRef = `../../frontend/design-system/recipes.css?v=${appVersion}`;
    const pageRef = `./styles.css?v=${appVersion}`;

    assert.ok(position(participate, tokenRef) < position(participate, recipeRef));
    assert.ok(position(participate, recipeRef) < position(participate, pageRef));
    assert.match(participateCss, /--ink:\s*var\(--archive-ink\)/);
    assert.match(participateCss, /--signal:\s*var\(--archive-signal\)/);
    assert.match(participateCss, /--display:\s*var\(--font-display\)/);
  });

  it('proves the recipes on one low-risk application surface', () => {
    assert.match(startHere, /archive-panel archive-panel--accent archive-density--spacious/);
    assert.match(startHere, /archive-section-label/);
    assert.match(startHere, /archive-action archive-action--primary/);
    assert.match(startHere, /Help keep the archive useful\./);
    assert.match(audit, /slug: 'design-system',\s+url: '\/frontend\/design-system\/demo\.html'/);
  });

  it('documents the final route count and where the visual system should recede', () => {
    const readme = read('frontend/design-system/README.md');
    assert.match(demo, /<span class="archive-stat__label">Audit routes<\/span><strong class="archive-stat__value">41<\/strong>/);
    assert.match(demo, /07 \/ restraint/);
    assert.match(demo, /Dense utility routes should let the system recede/);
    assert.match(readme, /## Visual restraint/);
    assert.match(readme, /Dense utility routes/);
    assert.match(readme, /Specialized modes keep their own visual identity/);
  });

  it('records the 3.8.9 acceptance decision and an ordered partial-package manifest', () => {
    assert.match(acceptance, /123 rows, 0 axe violations, 0 custom audit errors/);
    assert.match(acceptance, /explicitly deferred to #772/);
    assert.match(acceptance, /No production deployment was performed/);
    assert.match(acceptance, /Files: 57/);

    const manifestRows = releaseManifest.split('\n')
      .filter((line) => /^[0-9a-f]{64}  \S+/.test(line));
    assert.equal(manifestRows.length, 57);
    assert.match(manifestRows[0], /  frontend\/App\.js$/);
    assert.match(manifestRows.at(-3), /  index\.html$/);
    assert.match(manifestRows.at(-2), /  frontend\/sw\.js$/);
    assert.match(manifestRows.at(-1), /  version\.json$/);
    assert.doesNotMatch(manifestRows.join('\n'), /(?:^|  )(?:backend|tests|features\/making-of)\//m);
  });
});
