/**
 * Regression guard for the locked archive name in RSS/OPML feeds (#346).
 *
 * Jay locked the public name as "Jay Rosen's Internet Archive" — possessive,
 * and "Internet" not "Digital". History: "Internet" (not "Digital") was locked
 * 2026-01-31 ("subtle differences between 'digital' and 'internet' ... a bit
 * more musical"); the possessive form was added on the 2026-06-19 launch-prep
 * call ("You want it to be Possessive ... right?" / "I do"). This pins the feed
 * title to the locked name so a future edit can't silently regress it. Committed
 * feed artifacts pick up the new name on the next data export.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateRSS, generateAllFeeds } from '../data/lib/rss-generator.js';
import { generateSubscriptionOPML } from '../data/lib/opml-generator.js';

const LOCKED_NAME = "Jay Rosen's Internet Archive";
// RSS channel titles run through escapeXml, which turns ' into &apos;. The
// generator tag and OPML title are literal. So the locked name appears in both
// forms across the feeds; accept either.
const LOCKED_NAME_XML = 'Jay Rosen&apos;s Internet Archive';
const STALE_NAME = 'Jay Rosen Digital Archive';

const hasLockedName = (s) => s.includes(LOCKED_NAME) || s.includes(LOCKED_NAME_XML);

const here = dirname(fileURLToPath(import.meta.url));
const feedsDir = join(here, '..', 'data', 'feeds');

const SAMPLE_RECORDS = Array.from({ length: 5 }, (_, i) => ({
  id: `RECORD-${i}`,
  title: `Sample ${i}`,
  date: `2020-01-0${i + 1}`,
  type: 'article',
  categories: ['Press Criticism'],
  era: 'Test Era',
}));

describe('feed title uses the locked archive name (#346)', () => {
  it('generateRSS channel title and generator never say "Digital Archive"', () => {
    const xml = generateRSS({
      title: LOCKED_NAME,
      link: 'https://example.com',
      description: 'test',
      feedUrl: 'https://example.com/data/feeds/rss.xml',
      records: SAMPLE_RECORDS,
    });
    assert.match(xml, /<title>Jay Rosen&apos;s Internet Archive<\/title>/);
    assert.doesNotMatch(xml, /Digital Archive/);
  });

  it('generateAllFeeds names every feed with the locked name', () => {
    const feeds = generateAllFeeds(SAMPLE_RECORDS, 'https://example.com');
    assert.ok(Object.keys(feeds).length > 0, 'expected at least one feed');
    for (const [name, xml] of Object.entries(feeds)) {
      assert.doesNotMatch(xml, /Digital Archive/, `${name} still contains "Digital Archive"`);
      assert.ok(hasLockedName(xml), `${name} missing the locked name`);
    }
  });

  it('subscription OPML uses the locked name', () => {
    const opml = generateSubscriptionOPML('https://example.com', { 'rss.xml': '' });
    assert.doesNotMatch(opml, /Digital Archive/);
    assert.ok(hasLockedName(opml), 'OPML missing the locked name');
  });

  it('committed feed artifacts contain no "Digital Archive"', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(xml|opml)$/.test(entry)) continue;
        if (readFileSync(p, 'utf8').includes(STALE_NAME)) offenders.push(p);
      }
    };
    walk(feedsDir);
    assert.deepStrictEqual(offenders, [], `stale name still in: ${offenders.join(', ')}`);
  });
});
