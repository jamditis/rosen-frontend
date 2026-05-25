# Pillar 2 deeper sweep: gap inventory

**Status**: Draft — awaiting Joe's review + priority call
**Date**: 2026-05-25
**Trigger**: Stop hook 2026-05-24 flagged that "all of Jay's digital content" was overclaimed by the initial Pillar 2 round (PressThink + NYT/LA Times/Atlantic/Guardian + HuffPost backfill + Firecrawl raw_text refill).

## What this document is

A cross-reference of what's currently in the archive vs what exists on platforms Jay has actively used over the past 25 years but the initial Pillar 2 round didn't sweep. Each category gets: counted gap, suggested follow-up issue, and Joe's priority call.

This is an inventory + recommendation. Issues only get filed for the categories Joe picks; not every line below becomes a backlog item.

## Correction — 2026-05-25 (post-merge audit)

The first version of this doc undercounted what's in the archive because it only audited `archive_records-public.csv` (1,007 records). The actual archive also includes `data/social_posts.csv` (58,385 rows — the granular social-platform corpus that the main CSV's THREAD-NNNNN records reference but don't enumerate). Numbers below are corrected.

Lesson captured for future inventory work: audit every file in `data/`, not just the main records CSV.

## Cross-reference summary (corrected)

| Category | In archive (main + social) | Exists | Gap | Method to backfill | Priority call |
|---|---|---|---|---|---|
| Bluesky posts | 3,052 (10 thread records + 3,042 social_posts) | 4,235 | **~1,183 (~28%)** | Public AT Proto API, paginated, no auth | TBD |
| Mastodon statuses | ~28 (10 in main + 18 in social_posts) | 535 | **~507 (~95%)** | Public mastodon.social API | TBD |
| Threads posts | 2 (0 in main + 2 in social_posts) | ~291 | **~289 (~99%)** | Web scrape (no public API without Meta dev account) | TBD |
| Substack posts | 4 records | **0 published** | NOT a gap | n/a — confirmed reader-only account | Close as confirmed-empty |
| Podcast guest appearances | ~28 audio records | 27+ verified candidates | Unknown overlap; needs URL dedup | Manual sweep + Wayback for old hosts | TBD |
| YouTube talks (Jay as speaker) | 19 URL refs | 25+ verified candidates | Unknown overlap; needs URL dedup | Mostly self-curated at `pressthink.org/talks/` | TBD |
| Rebooting The News (Jay as co-host) | Unknown — likely 0 | ~90 episodes 2009-2011 | Likely 100% | Sequential scrape of `rebootnews.wordpress.com` | TBD — different content shape from guest appearances |
| LinkedIn Pulse articles | 0 | 1 visible publicly | 1 missing; total behind login wall | Manual capture | Low — single article |
| X recent posts (post-cutoff) | 26,240 (3 main + 26,237 social_posts) | Unknown — paywalled fetch | Cutoff appears later than initial estimate; gap is smaller than first claimed | Investigate cutoff date in social_posts before deciding | Investigate cutoff first |

## Detailed findings per category

### Bluesky — differential backfill (corrected)

- Account: `@jayrosen.bsky.social` (https://bsky.app/profile/jayrosen.bsky.social)
- 4,235 posts as of 2026-05-24; 229,805 followers; active through 2026-05-24
- Account created 2023-05-15 (early-adopter window)
- Bio: "Let's see... 39 years teaching journalism at NYU. A critic who tries to be useful. PressThink: the name of my subject and my site."
- Verification: confirmed via AT Proto API `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=jayrosen.bsky.social`
- Content shape: press criticism + political/media commentary + short replies/reposts
- **Backfill method**: `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=jayrosen.bsky.social` — cursor-paginated, no auth, no rate-limit friction at 10 req/s
- **Dedup**: 3,042 posts already in `social_posts.csv`; backfill adds the ~1,183 missing (post date later than the existing corpus's most recent date, OR post not in the existing URL set)
- **Era mapping**: all posts fall in "Platform Transition & Future Models (2021-Present)" — no era taxonomy work needed
- **Estimated effort**: ~2 hours for the scraper + ~1 hour for dedup + CSV append + JSON regen + test
- **Estimated archive growth**: ~1,183 new social_posts.csv rows (~2% growth on the ~58k-row social corpus, not a 4x change)

### Mastodon — meaningful gap

- Account: `@jayrosen_nyu@mastodon.social` (https://mastodon.social/@jayrosen_nyu)
- 535 statuses; 52,886 followers
- Account created 2022-10-30 (immediate post-Musk-acquisition Twitter exodus)
- Bio: "I teach journalism at NYU, critique the press, try to suggest reforms. PressThink is the name of my subject and my site. 'Chill before serving' is my social media motto."
- Verification: confirmed via mastodon.social API `/api/v1/accounts/lookup`
- Lower volume than Bluesky — appears largely dormant relative to Bluesky activity since mid-2023
- **Backfill method**: `https://mastodon.social/api/v1/accounts/{id}/statuses` — paginated
- **Dedup**: ~28 posts in archive vs 535 actual = ~507 missing (~95%). Most of the archive's existing 28 are likely older / less recent posts; backfill catches the bulk.
- **Era mapping**: same as Bluesky
- **Estimated effort**: same shape as Bluesky scraper, smaller volume

### Threads — third-priority

- Account: `@jayrosen_nyc` (note: `_nyc`, not `_nyu` — likely picked up from Jay's Instagram handle)
- ~291 threads; 20.2K followers
- Most recent visible posts dated 01/14/26 - 01/16/26
- **Backfill method**: web scrape OR Threads API via Meta dev account (high friction)
- **Risk**: Meta may revoke unauthenticated read access at any time; scrapes break unpredictably
- **Era mapping**: same as Bluesky

### Substack — CONFIRMED NOT A GAP

- Account: `@jayrosen1` (https://substack.com/@jayrosen1) is **reader-only**
- 169 subscribers, "Likes & Replies" and "Reads (11)" — no published posts
- Bio matches PressThink, confirming this is the real Jay (not impersonator)
- PressThink (WordPress) remains the canonical long-form home; no parallel Substack newsletter exists
- **Action**: close any future "should we sweep Substack?" question with reference to this finding

### Podcast guest appearances — 27 verified candidates

Highest-confidence finds:
- **On the Media (WNYC)**: "Emergency Mode" (2020-10-16), "Some Weird Sh*t" (2021-01-22), "How to Cover the Ongoing Siege" (2021-06-11), plus segments "Again and Again", "Journalists are People Too", "Meet the Facts", "Re-musing Ourselves"
- **The Ezra Klein Show (NYT)**: "Neutrality or Democracy?" (2021-11-12)
- **Recode Media w/ Peter Kafka**: 2017 + 2019 episodes
- **Press Publish (Nieman Lab)** #3 (2013-01-23)
- **The Pub (Current.org)** #43 (2015-11) and #62 (2016-04, live at Mercer CCJ)
- **Trumpcast (Slate)** finale (2021-01)
- **Reliable Sources (CNN)** Jay Rosen episode (2021-06)
- **Jen Rubin's Green Room** (2023-08)
- **Stand Up! with Pete Dominick** #861
- **Media Masters** Paul Blanchard interview
- **The Kicker / CJR Journalism 2050** (2025-12-29) with Emily Bell + Heather Chaplin
- **Radio Open Source (Christopher Lydon)** 2003, 2008, 2012

Categories that returned NOTHING (worth recording so we don't re-search):
- Slate Political Gabfest, NYT Daily, Pivot, Decoder Ring, Hot Pod, The Bulwark, Galaxy Brain, It's All Journalism, The Newest Americans, Source Code/Galley, TED main stage

**Most fruitful next sources** (if backfilling):
1. `pressthink.org/talks/` — Jay's own curated index (pre-2011, near-complete)
2. `wnycstudios.org/podcasts/otm` — needs Playwright for the dynamically-rendered WNYC people index
3. `current.org/category/thepub/` — full The Pub archive
4. `podchaser.com/creators/jay-rosen-107aNDpuES/appearances` — paywalled but claims 8 credits
5. `niemanlab.org/tag/jay-rosen/` — Nieman Lab tag page

### YouTube talks (Jay as speaker) — 25 verified candidates

Mostly self-curated by Jay at `pressthink.org/talks/` for pre-2011 content. Post-2011 surfaces through ONA + ISOJ + IJF Perugia speaker pages.

Highest-confidence finds:
- Berkman Center 2006, Carnegie Council 2008, Bill Moyers Journal 2009 (w/ Greenwald)
- TEDxNYED 2010, SXSW 2010, World Bank 2010, ABC Australia 2010
- ONA17 keynote "Optimizing for Trust in News"
- ISOJ 2014 keynote, ISOJ 2019 panel, ISOJ 2023 news-avoidance panel
- IJF Perugia 2018 (moderated by Mathew Ingram)
- The Daily Show w/ Trevor Noah 2018 (Correspondent pitch)
- NYC Media Lab Summit 2020
- PBS NewsHour Brief But Spectacular

**Most fruitful next sources**:
1. `pressthink.org/talks/` (Jay's own curated index)
2. Per-year ONA speaker pages
3. Per-year ISOJ speaker pages (2015, 2016, 2017, 2018, 2020, 2021, 2022 not yet swept)
4. `journalismfestival.com/speaker/jay-rosen` for IJF Perugia
5. YouTube channels: ONA, ISOJ, Berkman Klein, IJF Perugia, Knight Foundation, Solutions Journalism Network

### Rebooting The News — Jay AS HOST, separate content category

- Co-hosted with Dave Winer 2009-2011
- ~90 weekly episodes
- Full archive at `https://rebootnews.wordpress.com/`
- This is different in shape from guest appearances — Jay framed the conversation, didn't just respond to questions
- Likely 0 episodes currently in the archive (the inventory's 4 podcast-host URLs are all post-2015)
- **Backfill method**: sequential scrape of the WordPress archive; episode pages have title + date + audio link + show-notes
- **Estimated effort**: ~3 hours (manageable per-episode metadata; audio could either be transcribed by an existing pipeline OR just linked + show-notes captured)
- **Priority consideration**: 90 episodes of live press-criticism dialogue with Dave Winer is genuinely high signal — arguably one of the most important blocks of missing content despite being older

### LinkedIn Pulse — minimal

- Profile: https://www.linkedin.com/in/jay-rosen-502a03106/
- 665 followers (modest)
- 1 visible Pulse article: "With Its Curation Product Twitter Becomes an Editorial Beast..." (2015-09-29, 308 reactions)
- Full Articles count blocked by login wall
- **Recommendation**: manually capture the 2015 article; don't build a pipeline for LinkedIn

### X recent posts — investigation blocked

- Handle: `@jayrosen_nyu`
- Profile JSON returned HTTP 402 to unauthenticated WebFetch
- Active per third-party indexers (threadreaderapp.com, buzzchronicles.com)
- **Unknown**: what date does the archive's social CSV cut off at, and how big is the post-cutoff gap?
- **Recommended first step**: check the social CSV cutoff; if it predates 2022, that's a meaningful gap (Jay's Twitter-exodus narrative + Musk-era press criticism is a real corpus). If cutoff is 2023+, the gap is small.

## Era taxonomy implication

The inventory subagent found that 13% of existing records (131) use non-canonical era labels (variants like "Web & Blogging (2000s)" vs the canonical "Blogging Launch & Digital Disruption (2000-2004)"). This is task #11 in the backlog.

**Implication for Pillar 2 backfill**: any new Bluesky/Mastodon/Threads records map cleanly to "Platform Transition & Future Models (2021-Present)" — no taxonomy work needed for those. But the Rebooting The News and pre-2015 podcast/YouTube backfills will land in eras affected by the drift, and would either (a) inherit the drifted labels by accident or (b) need the canonical-era cleanup to happen first.

**Recommendation**: don't block the social platform backfill on era cleanup, but do block the Rebooting The News + older-podcast backfill on it.

## Recommended issues (priority-ordered, corrected)

If Joe agrees with the priority calls, these are the issues to file:

1. **[P1] Mastodon backfill** — ~507 missing via free public API. ~95% miss rate is the largest by percentage on a non-trivial gap. Captures Jay's immediate post-Musk-exodus voice. Easiest backfill to ship (small absolute count).
2. **[P1] Rebooting The News (Jay as host) backfill** — ~90 episodes 2009-2011. Different content shape but high signal density. Blocked on era taxonomy fix (#11).
3. **[P2] Bluesky differential backfill** — ~1,183 missing posts via free AT Proto API. Existing 3,042-post corpus needs differential top-up, not bulk import. Routine maintenance shape, matches PR #213's HuffPost differential.
4. **[P2] Podcast guest appearances backfill** — 27 verified candidates + sweep sources for more. Includes Playwright pass on WNYC OTM people page.
5. **[P2] YouTube talks backfill** — 25 verified candidates + sweep sources for more. Lots of self-curated source material at `pressthink.org/talks/`.
6. **[P3] Threads backfill** — ~289 posts. Lower priority due to API access friction. Higher percentage miss but smaller absolute volume than Bluesky.
7. **[P3] X recent posts gap investigation** — social_posts.csv already has 26,237 X/Twitter posts; first determine the actual cutoff date before investing in paid X API for any further backfill.
8. **[Close] Substack non-gap** — confirm/document that Substack is NOT in scope; close any future re-investigation.

Priority shift from the first draft: Mastodon moved from P1 to P1 (unchanged); Bluesky moved from P0 to P2 (the corrected ~28% miss rate doesn't justify P0 urgency); Threads stayed P3. The story is now "differential maintenance backfill" not "the archive is missing huge swaths of Jay's voice."

## What's NOT in this inventory

- Books, book chapters, academic publications (separate scope; Jay's published bibliography is its own catalog)
- Lectures at NYU (closed to public; not on YouTube)
- Email newsletter / list serve / pre-WordPress content (different scope)
- Translations of Jay's work into other languages (separate scope)
- Citations / mentions of Jay by others (the relationships graph already covers this for in-archive mentions)

## Source documents

The full subagent reports backing this inventory are at:
- `/tmp/pillar2-inventory.md` — archive content-type inventory
- `/tmp/pillar2-social-substack-candidates.md` — Bluesky / Mastodon / Threads / Substack verification
- `/tmp/pillar2-podcast-youtube-candidates.md` — podcast + YouTube candidate list

These are scratch files — if Joe wants them durably committed, say so and I'll move them to `docs/research/` or similar.
