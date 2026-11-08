/**
 * A failed core load must be retryable without a page reload.
 *
 * App.js gates the archive-core fetch with the coreFetchStarted ref. The ref
 * was never reset, so after one failed fetch (a short network drop on first
 * load) the error panel stayed up until a full reload, even after the network
 * came back (state machine map, follow-up 16). App.js mounts the whole
 * application, so these checks read its source the same way the other App.js
 * structure tests do.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(ROOT, 'frontend', 'App.js'), 'utf8');

const coreLoadEffect = () => {
  const start = app.indexOf('if (coreFetchStarted.current) return;');
  assert.ok(start >= 0, 'expected the coreFetchStarted guard in App.js');
  const end = app.indexOf('}, [', start);
  const depsEnd = app.indexOf(']);', end);
  return { body: app.slice(start, end), deps: app.slice(end, depsEnd) };
};

const errorPanel = () => {
  const start = app.indexOf('const errorPanel = error && html`');
  assert.ok(start >= 0, 'expected the shared errorPanel in App.js');
  return app.slice(start, app.indexOf('`;', start));
};

describe('core load retry', () => {
  it('releases the fetch guard when the core load fails', () => {
    const { body } = coreLoadEffect();
    const catchBlock = body.slice(body.indexOf('.catch('));
    assert.match(catchBlock, /coreFetchStarted\.current\s*=\s*false/,
      'the catch must reset coreFetchStarted so a retry can fetch again');
  });

  it('re-runs the load effect when the reader asks to retry', () => {
    const { deps } = coreLoadEffect();
    assert.match(deps, /coreLoadAttempt/, 'the load effect must depend on the retry counter');
    assert.match(app, /const \[coreLoadAttempt, setCoreLoadAttempt\] = useState\(0\)/);
  });

  it('offers a keyboard-reachable retry button that does not reload the page', () => {
    const panel = errorPanel();
    const retry = panel.match(/<button\b[^>]*onClick=\$\{retryCoreLoad\}[^>]*>\s*Try again\s*<\/button>/);
    assert.ok(retry, 'expected a native <button> wired to retryCoreLoad with the label "Try again"');
    assert.match(retry[0], /type="button"/);
    assert.match(retry[0], /className="archive-action archive-action--danger"/,
      'the retry action must use the shared design-system button recipe');

    const handler = app.slice(app.indexOf('const retryCoreLoad'));
    const body = handler.slice(0, handler.indexOf('};') + 2);
    assert.doesNotMatch(body, /location\.reload/);
    assert.match(body, /setError\(null\)/);
    assert.match(body, /setLoading\(true\)/);
    assert.match(body, /setCoreLoadAttempt\(/);
  });
});
