import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const rootDir = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('Tools modal traps focus, isolates the background, and restores its opener', () => {
  const source = read('frontend/components/ToolsModal.js');

  assert.match(source, /e\.key === 'Tab'/, 'Tools modal should handle Tab navigation');
  assert.match(source, /querySelectorAll\(/, 'Tools modal should collect its focusable controls');
  assert.match(source, /\.inert = true/, 'Tools modal should inert background siblings');
  assert.match(source, /setAttribute\('aria-hidden', 'true'\)/, 'Tools modal should hide background siblings from assistive technology');
  assert.match(source, /openerRef\.current\?\.focus\(\)/, 'Tools modal should restore focus to its opener');
});

test('Tools modal uses available square archive styling and a one-column mobile grid', () => {
  const source = read('frontend/components/ToolsModal.js');

  assert.match(source, /grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4/);
  assert.match(source, /archive-dialog-backdrop/);
  assert.match(source, /archive-dialog archive-tools-dialog/);
  assert.match(source, /archive-panel archive-tool-card/);
  assert.doesNotMatch(source, /rounded-full bg-stone-100/);
});

test('Tools modal marks only Archive desktop and Data visualization as beta', () => {
  const source = read('frontend/components/ToolsModal.js');
  const tools = [...source.matchAll(/\{\s+id: '([^']+)',[\s\S]*?status: '(ready|beta)'\s+\}/g)]
    .map((match) => ({ id: match[1], status: match[2] }));
  const statusById = new Map(tools.map((tool) => [tool.id, tool.status]));
  const betaIds = tools
    .filter((tool) => tool.status === 'beta')
    .map((tool) => tool.id)
    .sort();

  assert.deepEqual(betaIds, ['dataviz', 'desktop']);
  assert.equal(statusById.get('reader'), 'ready');
  assert.match(source, /aria-label=\$\{tool\.name\}/,
    'status badges must not change the stable accessible name used by keyboard and preview audits');
  assert.match(source, /aria-describedby=\$\{cardDescriptionIds\}/,
    'tool descriptions and release status must supplement the stable card name');
  assert.match(source, /id=\$\{toolDescriptionId\}/,
    'every card description must be associated with its control');
  assert.match(source, /id=\$\{toolStatusId\}/,
    'beta status must remain available to assistive technology');
});

test('Feature-audit coverage tracks the current Tools modal beta labels', () => {
  const stories = JSON.parse(read('docs/feature-audit/stories-02-modals.json'));
  const toolsStory = stories.find((story) => story.id === 'MODAL-16');
  const generatedStories = JSON.parse(read('docs/feature-audit/feature-stories.json'));
  const generatedToolsStory = generatedStories.find((story) => story.id === 'MODAL-16');
  const harness = read('docs/feature-audit/harness/test-modals.mjs');

  assert.ok(toolsStory, 'MODAL-16 must remain in the maintained feature-audit catalog');
  assert.match(toolsStory.expected_behavior, /Dissertation reader link \[ready\]/);
  assert.match(toolsStory.expected_behavior, /Archive desktop.*\[beta\]/);
  assert.match(toolsStory.expected_behavior, /Data visualization.*\[beta\]/);
  assert.equal(generatedToolsStory?.expected_behavior, toolsStory.expected_behavior,
    'the generated audit catalog must match its maintained source story');
  assert.match(harness, /betaCards:/,
    'the live audit must collect Beta labels from individual tool cards');
  assert.match(harness, /hasCorrectBetaCards/,
    'the live audit result must require exactly the current two beta tools');
  assert.match(harness, /hasAllExpectedCards/,
    'the live audit result must require every expected tool card');
  assert.match(harness, /linkDestinations/,
    'the live audit must exercise the destination of every link-backed tool card');
  assert.match(harness, /hasResolvedToolLinks/,
    'MODAL-16 must fail when a tool card does not reach its resolved local destination');
  assert.match(harness, /configuredBasePath/,
    'link destinations must preserve a configured production or GitHub Pages subpath');
  assert.match(harness, /new URL\(BASE\)\.pathname/,
    'the live audit must derive its expected prefix from the configured base URL');
  assert.doesNotMatch(harness, /Explore tools/,
    'the live audit must not look for the retired tools-button accessible name');
  assert.match(harness, /\['Tools', 'More tools'\]\.includes/,
    'the live audit should open the chooser from either current tools entry point');
  assert.doesNotMatch(harness, /hardcoded prod hrefs|hrefs are hardcoded/,
    'the live audit must not re-report the resolved-link bug as current');
});

test('Generated modal audit notes preserve direct Bluesky outbound links', () => {
  const generatedStories = JSON.parse(read('docs/feature-audit/feature-stories.json'));
  const modalVerdicts = JSON.parse(read('docs/feature-audit/verdicts-modals.json'));
  const storyNotes = ['MODAL-09', 'MODAL-14']
    .map((id) => generatedStories.find((story) => story.id === id)?.notes || '')
    .join(' ');
  const verdictNotes = ['MODAL-09', 'MODAL-14']
    .map((id) => modalVerdicts[id]?.notes || '')
    .join(' ');

  for (const notes of [storyNotes, verdictNotes]) {
    assert.doesNotMatch(notes, /embed\.bsky\.app|toEmbedUrl|bsky->embed/,
      'audit notes must not claim the retired Bluesky embed-host rewrite is active');
    assert.match(notes, /bsky\.app/,
      'audit notes should record that direct Bluesky outbound links stay on bsky.app');
  }
});

test('About page has a compiled responsive H1 and consistent keyboard focus treatment', () => {
  const source = read('frontend/components/AboutPage.js');
  const routeHeader = read('frontend/components/ArchiveRouteHeader.js');
  const css = read('frontend/index.css');

  assert.match(source, /text-3xl md:text-5xl font-display font-bold/);
  assert.match(source, /archive-action archive-action--primary/);
  assert.match(source, /archive-action archive-action--secondary/);
  assert.match(routeHeader, /archive-route-header__brand/);
  assert.match(css, /\.archive-route-header__brand:focus-visible/);
  assert.match(css, /outline:\s*3px solid var\(--archive-focus\)/,
    'About page recipe controls and route navigation should expose a visible focus ring');
  assert.ok((source.match(/aria-hidden="true"/g) || []).length >= 9,
    'Decorative About page icons should be hidden from assistive technology');
  assert.doesNotMatch(source, /text-xs text-stone-400 mt-2/,
    'Small About page annotations should not use the low-contrast stone-400 token');
});

test('responsive typography and layout tokens are present in the precompiled stylesheet', () => {
  const css = read('frontend/dist/tailwind.css');

  assert.match(css, /\.text-3xl\{/);
  assert.match(css, /\.md\\:text-5xl\{/);
  assert.match(css, /\.grid-cols-1\{/);
  assert.match(css, /\.sm\\:grid-cols-3\{/);
  assert.match(css, /\.rounded-none\{/);
});
