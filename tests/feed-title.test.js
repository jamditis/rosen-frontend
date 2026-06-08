/**
 * Regression guard for the locked archive name in RSS/OPML feeds (#346).
 *
 * Jay locked the public name as "Jay Rosen Internet Archive" (not "Digital
 * Archive") on 2026-01-31 ("subtle differences between 'digital' and 'internet'
 * ... a bit more musical"), re-confirmed 2026-06-08. The feed generators and
 * their committed artifacts had drifted back to "Digital Archive". This pins
 * the feed title to the locked name so a future edit can't silently regress it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateRSS, generateAllFeeds } from '../data/lib/rss-generator.js';
import { generateSubscriptionOPML } from '../data/lib/opml-generator.js';

const LOCKED_NAME = 'Jay Rosen Internet Archive';
const STALE_NAME = 'Jay Rosen Digital Archive';

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
    assert.match(xml, /<title>Jay Rosen Internet Archive<\/title>/);
    assert.doesNotMatch(xml, /Digital Archive/);
  });

  it('generateAllFeeds names every feed with the locked name', () => {
    const feeds = generateAllFeeds(SAMPLE_RECORDS, 'https://example.com');
    assert.ok(Object.keys(feeds).length > 0, 'expected at least one feed');
    for (const [name, xml] of Object.entries(feeds)) {
      assert.doesNotMatch(xml, /Digital Archive/, `${name} still contains "Digital Archive"`);
      assert.match(xml, /Jay Rosen Internet Archive/, `${name} missing the locked name`);
    }
  });

  it('subscription OPML uses the locked name', () => {
    const opml = generateSubscriptionOPML('https://example.com', { 'rss.xml': '' });
    assert.doesNotMatch(opml, /Digital Archive/);
    assert.match(opml, /Jay Rosen Internet Archive/);
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
