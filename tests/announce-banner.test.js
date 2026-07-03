// Structure guards for the site announcement banner (#567 sibling fix).
//
// Two defects motivated these: the banner read as "covering" the nav bar, and
// its dismiss X sat directly below the header's external "Curated by Joe
// Amditis" GitHub link on the same right edge, so a near-miss on the tiny 24px
// X landed on that link and navigated the reader off-site. The fixes: render
// the banner ABOVE the header (so the X is the top-right-corner target, not the
// GitHub link) and give the dismiss control a >=44x44 tap target (WCAG 2.5.5).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(rootDir, ...parts), 'utf8');

describe('announcement banner placement and dismiss target', () => {
  const appSrc = read('frontend', 'App.js');
  const bannerSrc = read('frontend', 'components', 'WorkInProgressBanner.js');

  it('renders the banner above the header, not below it', () => {
    // Order matters: as a plain top strip the banner must precede the sticky
    // header so its dismiss X becomes the top-right-corner control instead of
    // sitting under the header's external GitHub link.
    const bannerIdx = appSrc.indexOf('<${WorkInProgressBanner}');
    const headerIdx = appSrc.indexOf('<header');
    assert.ok(bannerIdx !== -1, 'banner is rendered in App.js');
    assert.ok(headerIdx !== -1, 'header is rendered in App.js');
    assert.ok(bannerIdx < headerIdx,
      'WorkInProgressBanner must render before <header> so it sits above the nav bar');
  });

  it('gives the dismiss control a >=44x44 tap target', () => {
    // The old 24px icon-only button, stacked in the same corner as the GitHub
    // link, made mis-dismissal easy. p-3 (12px) around the w-5/h-5 (20px) icon =
    // a 44x44 centered target, the WCAG 2.5.5 minimum. Padding is used instead of
    // min-w/min-h because arbitrary values (min-w-[44px]) are absent from the
    // pre-built zero-build stylesheet and would render inert.
    const btn = bannerSrc.match(/<button[\s\S]*?aria-label="Dismiss banner"[\s\S]*?<\/button>/);
    assert.ok(btn, 'dismiss button exists');
    assert.match(btn[0], /\bp-3\b/);
    assert.match(btn[0], /items-center/);
    assert.match(btn[0], /justify-center/);
    assert.match(btn[0], /className="w-5 h-5"/);
  });
});
