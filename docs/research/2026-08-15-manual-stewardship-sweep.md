# Manual stewardship sweep — 2026-08-15

This sweep covers the archive gap after the prior social update on 2026-06-17
and the prior curated record update on 2026-07-16.

## Bluesky decisions

The public AT Protocol author feed returned 187 unique Jay Rosen posts from
2026-06-18 through 2026-08-15 after exact-URI deduplication and repost removal.
The review applies the selection policy in issue #810.

| Decision | Count | Treatment |
| --- | ---: | --- |
| Admit | 115 | Added as `BSKY-03173` through `BSKY-03287`. |
| Context only | 69 | Retained in the decision manifest, but not added as standalone records. |
| Needs review | 3 | Held because image or missing conversation context affects the decision. |

The machine-readable decision file is
`docs/research/2026-08-15-bluesky-stewardship-decisions.csv`. It records the
source URI, URL, timestamp, post type, thread role, decision, reason,
confidence, project flags, and duplicate evidence for every candidate.

The supplied Citizens Agenda post `3mt2mi7jej22l` is admitted. The supplied
Joe-tagging continuation `3mt33nkk7yk2p` is context only because it only routes
Joe to the substantive thread.

The other three Joe-tagged posts document the archive project and are admitted:

- `3mpwt335cps2h`
- `3mpye45mnxs2y`
- `3mq35cboajk25`

The three held posts are:

- `3mqsisljuok2c`
- `3mrgubvmkx22w`
- `3mshbrmae4c2u`

## Curated records added

| ID | Record | Source decision |
| --- | --- | --- |
| `RECORD-00912` | Jay Rosen’s Internet Archive: an Introduction. | Primary PressThink metadata. |
| `RECORD-00913` | About Jay Rosen’s 1986 PhD dissertation, “The Impossible Press” | Primary PressThink metadata. |
| `RECORD-00914` | Rebooting the News #93 | Primary episode page and MP3 metadata. |
| `RECORD-00915` | Ethics of Linking: Jay Rosen | Primary YouTube metadata. |
| `RECORD-00916` | NYU’s Jay Rosen on why news needs subsidies | Primary publisher metadata and transcript listing. |
| `RECORD-00917` | What are your top issues in November’s elections? | Metadata-only Citizens Agenda record from issue #801 and Jay’s thread. |

The Roanoke Times record does not contain copied article text. The publisher’s
robots controls and `X-Robots-Tag: noarchive` signal were honored. Its title,
date, author, and publisher come from Jay’s public Bluesky embed, Google News,
and publisher metadata observed during the sweep.

## Confirmed non-adds and deferrals

- Cascadia Citizens Agenda is already `RECORD-00911`.
- Two WNYC interviews are already `RECORD-00733` and `RECORD-00734`.
- The July 2026 PBS SoCal page is a re-air of `RECORD-00777`.
- The Alaska voter guide remains Bluesky thread context because it does not
  feature Jay Rosen’s work directly.
- The St. Louis Citizens Agenda series needs a separate series review.
- Eight historical videos and five Rosen-Shirky segments remain in the video
  backfill queue.
- The broader PressThink structural gap remains tracked by issue #538.

## Method and access limits

- Discovery used the public AT Protocol API, primary publisher pages, official
  feeds, and search metadata.
- Duplicate checks compared normalized URLs, titles, dates, exact post URIs,
  and normalized social text against `origin/main` at `451c77054eaa`.
- The sweep stopped on publisher robots restrictions, `noarchive`, a search
  CAPTCHA, and the unavailable authenticated D1 ledger query.
- No restricted page, login wall, or technical access control was bypassed.
