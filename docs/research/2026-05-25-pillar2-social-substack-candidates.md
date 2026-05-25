# Social + Substack candidate list for Jay Rosen archive

Pillar-2 deeper sweep, 2026-05-25.

## Platform inventory

| Platform | Has Jay account? | Handle / URL | Public posts visible? | Estimated post count | Notes |
|---|---|---|---|---|---|
| Bluesky | Yes (confirmed via AT Proto API) | `@jayrosen.bsky.social` — https://bsky.app/profile/jayrosen.bsky.social | Yes, fully public | **4,235 posts** (as of 2026-05-24) | 229,805 followers, 657 following. Account created 2023-05-15. Bio: "Let's see... 39 years teaching journalism at NYU. A critic who tries to be useful. PressThink: the name of my subject and my site." Highest-volume current platform. Posts skew press criticism + political/media commentary + short replies/reposts. Recent posts as of 2026-05-24. |
| Mastodon | Yes (confirmed via mastodon.social API) | `@jayrosen_nyu@mastodon.social` — https://mastodon.social/@jayrosen_nyu | Yes, fully public | **535 statuses** | 52,886 followers, 139 following. Account created 2022-10-30 (early Twitter exodus). Bio: "I teach journalism at NYU, critique the press, try to suggest reforms. PressThink is the name of my subject and my site. 'Chill before serving' is my social media motto." Lower volume than Bluesky — appears largely dormant relative to Bluesky activity. NOT on journa.host. |
| Threads | Yes (verified by profile fetch) | `@jayrosen_nyc` (note: `_nyc` not `_nyu`) — https://www.threads.com/@jayrosen_nyc | Yes, public | ~291 threads (per search snippet); 4+ visible directly | 20.2K followers. Bio: "I teach journalism at NYU and write about the press." Most recent visible posts dated 01/14/26-01/16/26. Lower priority than Bluesky/Mastodon but real account. |
| Substack | Reader account only — NOT a publication | `@jayrosen1` — https://substack.com/@jayrosen1 | N/A | 0 published posts | 169 subscribers, activity shows "Likes & Replies" and "Reads (11)" — reader-style profile, not an active newsletter. Bio matches PressThink. **Jay does NOT run a Substack newsletter.** PressThink (WordPress) remains the canonical long-form output. |
| LinkedIn | Yes | https://www.linkedin.com/in/jay-rosen-502a03106/ | Partial — login wall blocks full activity | At least 1 long-form Pulse article confirmed visible: "With Its Curation Product Twitter Becomes an Editorial Beast..." (Sept 29, 2015, 308 reactions, 58 comments). Total Articles count not visible without login. | 665 followers. Activity feed shows comments dated 9 months ago and 3 years ago. Long-form output appears minimal/historical (single 2015 Pulse article visible publicly). Low priority unless authenticated scrape reveals more Articles. |
| Medium | Not found | n/a | n/a | n/a | No `medium.com/@jay-rosen` or `@jayrosen_nyu` surfaced in search. Not found despite checking `"Jay Rosen" medium.com PressThink author`. Expected — PressThink is his canonical long-form home. |
| Other newsletter (Beehiiv / Buttondown / Ghost / ConvertKit) | Not found | n/a | n/a | n/a | No matches for `"Jay Rosen" Beehiiv OR Ghost OR Buttondown newsletter`. Not found despite checking. PressThink (WordPress) is the only newsletter-form output. |
| Twitter/X recent | Yes (handle public, profile JSON paywalled HTTP 402) | `@jayrosen_nyu` — https://x.com/jayrosen_nyu | Profile page returns HTTP 402 to unauthenticated WebFetch; nitter mirrors gone | Unable to estimate from this sweep without auth | Handle confirmed via multiple sources (Muck Rack, threadreaderapp, search snippets). Account still active per third-party indexers (threadreaderapp.com/user/jayrosen_nyu, buzzchronicles.com/a/jayrosen_nyu). **Archive almost certainly has a cutoff date** — confirm with the inventory pass and refresh if cutoff predates the Bluesky migration (May 2023) or the Mastodon migration (Oct 2022). |
| Discord / Reddit / Quora | Not found as poster | n/a | n/a | n/a | Jay is frequently *cited* in r/journalism and similar, but no substantial body of his own posts surfaced. Long shot. Not pursuing further. |

## Notable findings

- **Bluesky is the biggest gap.** 4,235 posts + 229,805 followers + fully-public AT Protocol API + active through 2026-05-24 = the single highest-yield addition to the archive. Fetch via `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=jayrosen.bsky.social` (cursor-paginated, no auth required).
- **Mastodon is a second-priority addition.** 535 statuses is small, but every status is public-fetchable via the mastodon.social API and predates Bluesky (account created 2022-10-30) — captures the immediate post-Musk-acquisition window. Fetch via `https://mastodon.social/api/v1/accounts/{id}/statuses`.
- **Threads is a smaller but real third tier.** ~291 threads, publicly viewable, no documented API yet — likely needs scraping or the limited Threads API (requires Meta dev account).
- **Jay does NOT run a Substack.** This is the load-bearing negative finding — eliminates a category from the archive scope. PressThink stays the canonical long-form home; no parallel newsletter to sync.
- **LinkedIn Pulse output is minimal** (1 visible 2015 article). Probably not worth a dedicated ingestion pipeline; capture the single confirmed article manually.
- **Content categories on newer platforms** skew toward short-form press criticism, reposts/quote-posts of journalism news, and conversational replies — distinct from the long-form essay shape of PressThink. Archive consumers should expect a different rhythm than the WordPress + Twitter-thread material already ingested.

## Notes

- **Returned nothing:** Medium, Beehiiv/Ghost/Buttondown/ConvertKit, journa.host (Mastodon), Discord/Reddit/Quora as original-author surfaces.
- **Blocked / partial:**
  - X (`x.com/jayrosen_nyu`) returned HTTP 402 to unauthenticated WebFetch — handle and active status confirmed via third-party indexers, but post count + recent volume require an authenticated path (`twscrape`, snscrape, or paid X API).
  - LinkedIn profile partially gated by login wall — public preview confirms at least one Pulse article (2015) and 665 followers; full Articles tab count not derivable without auth.
- **Verification method:** Bluesky and Mastodon both verified through their respective public APIs (not just web search), so bio + counts + creation dates are first-party. Threads verified via direct profile-page fetch. Substack verified via direct profile-page fetch. The handle pattern is consistent (`jayrosen_nyu` on X/Mastodon, `jayrosen.bsky.social` on Bluesky, `jayrosen_nyc` on Threads, `jay-rosen-502a03106` on LinkedIn, `jayrosen1` on Substack) — no obvious impersonator surfaces detected.
