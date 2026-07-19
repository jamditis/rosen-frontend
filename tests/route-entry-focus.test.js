import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

describe('canonical route-entry focus', () => {
  it('repairs body focus after a rendered route changes without stealing precise child focus', () => {
    const app = read('frontend/App.js');

    assert.match(app, /previouslyRenderedRoute = useRef\(currentRoute\)/);
    assert.match(app, /if \(previousRoute === currentRoute\) return undefined/,
      'the initial document render must retain native browser focus');
    assert.match(app, /activeElement !== document\.body[\s\S]*activeElement\.isConnected[\s\S]*return/,
      'dialogs, entity details, Start, and desktop windows keep their more precise focus');
    assert.match(app, /document\.querySelector\(ROUTE_ENTRY_FOCUS_SELECTOR\)/);
    assert.match(app, /focusTarget\.focus\(\{ preventScroll: true \}\)/);
  });

  it('marks stable entry targets on canonical route surfaces', () => {
    const app = read('frontend/App.js');
    const about = read('frontend/components/AboutPage.js');
    const dissertation = read('frontend/components/DissertationPage.js');
    const analytics = read('frontend/components/AnalyticsDashboard.js');
    const start = read('frontend/components/StartHerePage.js');

    assert.match(app, /<main[\s\S]*id="main-content"[\s\S]*data-route-entry-focus[\s\S]*tabIndex="-1"/);
    for (const source of [about, dissertation, analytics, start]) {
      assert.match(source, /data-route-entry-focus/);
      assert.match(source, /tabIndex=/);
    }
  });
});
