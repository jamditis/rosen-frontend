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
  assert.match(source, /max-w-4xl[^\n]*rounded-none[^\n]*border-2[^\n]*border-stone-800/);
  assert.doesNotMatch(source, /rounded-full bg-stone-100/);
});

test('About page has a compiled responsive H1 and consistent keyboard focus treatment', () => {
  const source = read('frontend/components/AboutPage.js');

  assert.match(source, /text-3xl md:text-5xl font-display font-bold/);
  assert.ok((source.match(/focus:ring-2 focus:ring-sky-500 focus:ring-offset-2/g) || []).length >= 8,
    'About page controls and links should expose a consistent visible focus ring');
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
