import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadTool(tool, document, URL) {
  const configs = {
    reader: {
      className: 'DissertationReader',
      path: 'dissertation/reader/src/js/reader.js',
      prepare(source) {
        return source
          .replace(/^import .*;$/gm, '')
          .replace(
            /\/\/ Initialize on load[\s\S]*export default DissertationReader;\s*$/,
            'globalThis.DissertationReader = DissertationReader;',
          );
      },
    },
    shared: {
      className: 'TextSelectionTool',
      path: 'features/shared/text-selection.js',
      prepare(source) {
        return source
          .replace('export class TextSelectionTool', 'class TextSelectionTool')
          .replace(
            /\/\/ Auto-initialize[\s\S]*export default TextSelectionTool;\s*$/,
            'globalThis.TextSelectionTool = TextSelectionTool;',
          );
      },
    },
  };
  const config = configs[tool];
  const source = config.prepare(readFileSync(config.path, 'utf8'));
  const context = vm.createContext({
    console,
    document,
    URL,
    globalThis: {},
    setTimeout,
  });
  new vm.Script(source).runInContext(context);
  return context.globalThis[config.className];
}

function renderQuote(tool, selectedText) {
  const drawCalls = [];
  const context = {
    fillStyle: '',
    font: '',
    fillRect() {},
    fillText(text, x, y) {
      drawCalls.push({ text, x, y });
    },
    measureText(text) {
      return { width: text.length * 14 };
    },
  };
  const anchor = { click() {} };
  const canvas = {
    getContext: () => context,
    toBlob: (callback) => callback({}),
  };

  const document = {
    getElementById: () => null,
    createElement: (tag) => (tag === 'canvas' ? canvas : anchor),
  };
  const URL = {
    createObjectURL: () => 'blob:test',
    revokeObjectURL() {},
  };
  const Tool = loadTool(tool, document, URL);
  const instance = tool === 'shared'
    ? new Tool({ source: 'Jay Rosen, "The Impossible Press" (1986)' })
    : Object.create(Tool.prototype);
  instance.selectedText = selectedText;
  instance.showToast = () => {};

  return Promise.resolve(instance.downloadShareImage()).then(() => {
    return drawCalls;
  });
}

describe('Dissertation share image layout', () => {
  it('vertically balances short quotes consistently in both public generators', async () => {
    const text = 'Submitted in partial fulfillment of the requirements for the degree of Doctor of Philosophy.';
    const baselines = [];

    for (const tool of ['reader', 'shared']) {
      const calls = await renderQuote(tool, text);
      const quoteLines = calls.slice(0, -1);
      assert.ok(quoteLines.length > 0);
      assert.ok(
        quoteLines[0].y >= 220,
        `${tool}: expected a short quote in the balanced content region, got y=${quoteLines[0].y}`,
      );
      assert.ok(quoteLines.at(-1).y < 510, `${tool}: quote must stay clear of the citation`);
      baselines.push(quoteLines.map((line) => line.y));
    }

    assert.deepEqual(baselines[0], baselines[1], 'reader and shared generators must stay aligned');
  });

  it('keeps maximum-length quote baselines inside the protected content region', async () => {
    const text = Array.from({ length: 180 }, (_, index) => `word${index}`).join(' ');

    for (const tool of ['reader', 'shared']) {
      const calls = await renderQuote(tool, text);
      const quoteLines = calls.slice(0, -1);
      assert.equal(quoteLines.length, 9, `${tool}: canvas must cap the visible quote at nine lines`);
      assert.ok(quoteLines[0].y >= 120, `${tool}: quote must respect the top boundary`);
      assert.ok(quoteLines.at(-1).y < 510, `${tool}: quote must stay clear of the citation`);
      assert.match(quoteLines.at(-1).text, /\.\.\."$/, `${tool}: overflow line must be ellipsized`);
    }
  });
});
