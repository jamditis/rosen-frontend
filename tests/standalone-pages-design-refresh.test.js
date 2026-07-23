import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const pages = {
  faq: {
    file: 'faq/index.html',
    url: 'https://pressthink.org/j/rosen-archive/faq/',
    prefix: '../',
    ownedStyle: './styles.css',
  },
  dissertation: {
    file: 'dissertation/index.html',
    url: 'https://pressthink.org/j/rosen-archive/dissertation/',
    prefix: '../',
    ownedStyle: '<style>',
  },
  reader: {
    file: 'dissertation/reader/index.html',
    url: 'https://pressthink.org/j/rosen-archive/dissertation/reader/',
    prefix: '../../',
    ownedStyle: 'src/css/main.css',
  },
  network: {
    file: 'dissertation/network-effect/index.html',
    url: 'https://pressthink.org/j/rosen-archive/dissertation/network-effect/',
    prefix: '../../',
    ownedStyle: '<style>',
  },
  method: {
    file: 'features/winer-method/index.html',
    prefix: '../../',
    ownedStyle: './styles.css',
  },
};

describe('standalone archive design-system boundaries', () => {
  it('loads tokens, recipes, shared rules, then page-owned styles in that order', () => {
    for (const [name, page] of Object.entries(pages)) {
      const html = read(page.file);
      const expected = [
        `${page.prefix}frontend/design-system/legacy-token-bridge.css`,
        `${page.prefix}frontend/design-system/tokens.css`,
        `${page.prefix}frontend/design-system/recipes.css`,
        `${page.prefix}shared-styles.css`,
      ];
      let cursor = -1;
      for (const asset of expected) {
        const index = html.indexOf(asset);
        assert.ok(index > cursor, `${name} must load ${asset} after the preceding shared layer`);
        cursor = index;
      }
      const ownedIndex = html.indexOf(page.ownedStyle, cursor);
      assert.ok(
        ownedIndex > cursor,
        `${name} must load ${page.ownedStyle} after the shared structural layer`,
      );
    }
  });

  it('keeps complete canonical, social, and favicon metadata on every touched page', () => {
    for (const [name, page] of Object.entries(pages)) {
      if (!page.url) continue;
      const html = read(page.file);
      for (const marker of [
        `rel="canonical" href="${page.url}"`,
        'property="og:site_name"',
        'property="og:title"',
        'property="og:description"',
        'property="og:type"',
        `property="og:url" content="${page.url}"`,
        'property="og:image"',
        'property="og:image:alt"',
        'property="og:image:width" content="1200"',
        'property="og:image:height" content="630"',
        'name="twitter:card" content="summary_large_image"',
        'name="twitter:title"',
        'name="twitter:description"',
        'name="twitter:image"',
        'name="twitter:image:alt"',
        `rel="icon" type="image/svg+xml" href="${page.prefix}favicon.svg"`,
        `rel="icon" href="${page.prefix}favicon.ico"`,
      ]) {
        assert.ok(html.includes(marker), `${name} is missing ${marker}`);
      }
    }
  });
});

describe('FAQ archival question index', () => {
  it('uses a page-owned stylesheet and semantic, stateful disclosure buttons', () => {
    assert.ok(existsSync('faq/styles.css'), 'FAQ needs a page-owned stylesheet after the shared layers');
    const html = read('faq/index.html');
    const script = read('faq/script.js');
    const css = read('faq/styles.css');

    assert.match(html, /<body class="archive-canvas faq-page">/);
    assert.match(html, /<header class="faq-site-header">[\s\S]*class="archive-mark"/);
    assert.match(html, /class="archive-control faq-search__input"/);
    assert.match(script, /const answerId = `answer-\$\{item\.id\}`;/);
    assert.match(script, /<h2 class="faq-heading">\s*<button[\s\S]*class="faq-toggle"/);
    assert.match(script, /<button[\s\S]*class="faq-toggle"[\s\S]*aria-expanded="false"[\s\S]*aria-controls="\$\{answerId\}"/);
    assert.match(script, /class="archive-folder-tab faq-category"/);
    assert.match(script, /toggle\.setAttribute\('aria-expanded', String\(isOpen\)\)/);
    assert.match(script, /answer\.hidden = !isOpen/);
    assert.match(css, /\.faq-category[\s\S]*color:\s*var\(--archive-ink-soft\)/);
    assert.match(css, /@media \(forced-colors: active\)/);
  });

  it('retains useful orientation and controls without relying on generic rounded cards', () => {
    const html = read('faq/index.html');
    const script = read('faq/script.js');
    assert.match(html, /Jay Rosen's Internet Archive[\s\S]*Frequently asked questions/);
    assert.match(html, /<noscript>[\s\S]*questions require JavaScript[\s\S]*<\/noscript>/i);
    assert.doesNotMatch(script, /article\.className = 'faq-item card'/);
    assert.doesNotMatch(script, /text-stone-400 uppercase tracking-wider/);
  });
});

describe('The Impossible Press landing and reader', () => {
  it('keeps the cinematic landing page while adopting archive orientation and accessible links', () => {
    const html = read('dissertation/index.html');
    assert.match(html, /class="site-nav__identity"[\s\S]*Jay Rosen's Internet Archive[\s\S]*The Impossible Press/);
    assert.match(html, /class="archive-folder-tab hero-eyebrow"/);
    assert.match(html, /class="archive-action dissertation-action dissertation-action--primary"/);
    assert.match(html, /\.about-attribution a\s*\{[\s\S]*text-decoration:\s*underline/);
    assert.match(html, /\.scholar-context a\s*\{[\s\S]*text-decoration:\s*underline/);
    assert.match(html, /--dissertation-on-dark-muted:\s*#d6d3d1/);
    assert.match(html, /@media \(max-width: 640px\)[\s\S]*\.hero\s*\{[\s\S]*padding-top:\s*7rem/);
    assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
    assert.doesNotMatch(html, /onmouseover=|onmouseout=/);
  });

  it('uses an explicit accessible link color in both reader themes', () => {
    const variables = read('dissertation/reader/src/css/variables.css');
    const layout = read('dissertation/reader/src/css/layout.css');
    assert.match(variables, /:root\s*\{[\s\S]*--color-link:\s*#1d4ed8/);
    assert.match(variables, /\[data-theme="dark"\]\s*\{[\s\S]*--color-link:\s*#93c5fd/);
    assert.match(variables, /:root:not\(\[data-theme="light"\]\)[\s\S]*--color-link:\s*#93c5fd/);
    assert.match(layout, /\.reader-footer a\s*\{[\s\S]*color:\s*var\(--color-link\)[\s\S]*text-decoration:\s*underline/);
    assert.match(layout, /\.reader-context[\s\S]*font-family:\s*var\(--font-mono\)/);
  });
});

describe('standalone release surface', () => {
  it('includes dissertation browser assets in the canonical semver bump', () => {
    const bump = read('scripts/bump-version.mjs');
    const tests = read('tests/bump-version.test.js');
    assert.match(bump, /walk\(path\.join\(rootDir, 'dissertation'\), \['\.html', '\.js', '\.css'\]\)/);
    assert.match(tests, /stamps standalone dissertation HTML, CSS, and JavaScript recursively/);
  });

  it('uses canonical tokens for the Winer reference page without changing its composition', () => {
    const css = read('features/winer-method/styles.css');
    assert.match(css, /--paper:\s*var\(--archive-canvas\)/);
    assert.match(css, /--ink:\s*var\(--archive-ink\)/);
    assert.match(css, /--muted:\s*var\(--archive-ink-muted\)/);
    assert.match(css, /--display:\s*var\(--font-display\)/);
    assert.match(css, /--mono:\s*var\(--font-body\)/);
  });
});
