# Shared-opening raw_text audit

Issue #864. Audit date: 2026-11-08. Only repository data and git history were
used. No source page was fetched.

## What was counted

The 2004-2008 PressThink gap tool (`backend/scripts/pressthink_2004_2008_gap.py`)
has a body-fingerprint tier. It takes the first twelve words of a row's
`raw_text`, and of its `excerpt` with and without a leading copy of the title,
after lowercasing and dropping punctuation. A fingerprint that two archive rows
share is dropped, and the August report counted 31 of them.

That count is 31 shared fingerprints, not 31 rows. They span 87 curated records
in `data/archive_records-public.csv` (89 memberships, because `RECORD-00708` and
`RECORD-00709` each sit in two groups). After the fixes below, 30 shared
fingerprints remain.

`data/social_posts.csv` is not part of the fingerprint index. It is summarized
at the end for completeness.

## The reader bug found on the way

The gap tool read the archive CSV with Python's `csv` module. The file keeps
bare-LF newlines inside CRLF records, and Python ends a record at the bare LF.
On the current file it read 1,965 rows where csv-parse, the reader the exporter
and the tests use, reads 1,218 records. 747 of those rows were phantom rows
made from the tail of a split record, and 52 real records had their `raw_text`
cut short. The August report's `rows_indexed: 1784` came from the same split,
on a file that held 1,036 records.

This is a truncated-text problem, but in the reader, not in the data. It did
not create any of the 31 groups: the same 31 come out of both readers. The tool
now reads the CSV through csv-parse and fails loudly if Node is missing. The
match results are unchanged: 678 present, all by exact url, 1 needs review,
5 missing.

## Classification

| Class | Groups | What it means | Action |
| --- | --- | --- | --- |
| Shared boilerplate prefix | 5 | The opening is capture chrome or a standard spoken intro | None for the fingerprint. The chrome itself is a text-quality issue (see follow-ups) |
| Same text at another venue | 20 | A cross-post, republication, syndicated wire story or shared press release | None. Both records are real publications |
| True duplicate record | 3 | Two records for one work | Curator decision, not made here |
| Wrong text on the record | 3 | The `raw_text` belongs to another work | Fixed where the right text is in the repo, listed otherwise |
| Truncated capture | 0 | | None of the groups is a truncated capture. The truncation was the reader bug above |

That is the 31 groups the August report counted. The wrong-text row includes
the `RECORD-00029` and `RECORD-00030` pair, which the fix dissolved, so 30
groups remain.

### Shared boilerplate prefix

- **Wayback Machine toolbar (19 records).** `raw_text` is the markdown of a whole
  Wayback page, so it opens with the toolbar: `RECORD-00673`, `RECORD-00693`,
  `RECORD-00694`, `RECORD-00706`, `RECORD-00707`, `RECORD-00708`, `RECORD-00709`,
  `RECORD-00725`, `RECORD-00729`, `RECORD-00733`, `RECORD-00734`, `RECORD-00736`,
  `RECORD-00737`, `RECORD-00743`, `RECORD-00756`, `RECORD-00762`, `RECORD-00782`,
  `RECORD-00792`, `RECORD-00803`. The captured page follows the toolbar and the
  archived site's own navigation. This audit did not check each captured body
  against its source.
- **NYPR network header (6 records).** Direct WNYC Studios captures that open
  with the network bar: `RECORD-00741`, `RECORD-00768`, `RECORD-00769`,
  `RECORD-00770`, `RECORD-00880`, `RECORD-00888`.
- **Apple Podcasts player controls (3 records).** `RECORD-00884`, `RECORD-00885`,
  `RECORD-00889` open with "skip back, play, skip ahead, mute".
- **Poynter logo and header (2 records).** `RECORD-00732`, `RECORD-00773`.
- **On the Media's spoken opener (2 records).** "From WNYC in New York, this is On
  the Media." `RECORD-00081` is the NYU news post that carries the January 2021
  segment transcript. `RECORD-00735` is the June 2021 segment. Different
  episodes, same standard intro. Fine.

### Same text at another venue

All of these are kept as two records on purpose, as in the #210 audit, where
"same essay, two venues" kept both.

- PressThink and Huffington Post cross-posts: `RECORD-00005` and `RECORD-00679`;
  `RECORD-00070` and `RECORD-00191`; `RECORD-00192` and `RECORD-00833`;
  `RECORD-00355` and `RECORD-00678`; `RECORD-00361` and `RECORD-00691`;
  `RECORD-00413` and `RECORD-00812`; `RECORD-00463` and `RECORD-00836`;
  `RECORD-00484` and `RECORD-00845`.
- PressThink posts republished by The Correspondent: `RECORD-01090` and
  `RECORD-00708`; `RECORD-01098` and `RECORD-00709`; `RECORD-01078` and
  `RECORD-00720`. The two older Correspondent records match on their excerpts,
  because their `raw_text` opens with the Wayback toolbar.
- The retirement post and the Bluesky thread that reproduces it: `RECORD-00045`
  and `THREAD-00001`.
- The same post on the WordPress notebook and on Posterous: `RECORD-00658` and
  `RECORD-00781`. The curator already ruled on this pair in #867 and kept
  `RECORD-00781` as a dead-platform publication.
- One Peabody board press release on two sites: `RECORD-00083`
  (peabodyawards.com) and `RECORD-00084` (news.uga.edu).
- Wire stories run by several newspapers. Each clipping record keeps the same
  short quoted passage, by design:
  - `CLIP-00019`, `CLIP-00080`, `CLIP-00081` (2003 leak investigation story)
  - `CLIP-00065`, `CLIP-00066`, `CLIP-00067` (1991 suburbs story)
  - `CLIP-00082`, `CLIP-00083`, `CLIP-00084` (2003 Neil Postman obituary)
  - `CLIP-00085`, `CLIP-00086`, `CLIP-00087` (2008 McClellan column)
  - `CLIP-00068`, `CLIP-00069` (1991 Gulf War coverage story)
- The Current "The Pub #62" episode blurb: `RECORD-00772` is the full episode
  page. `RECORD-00040` and `RECORD-00041` are SoundCloud clips from the same
  episode, and their `raw_text` is only the 535-character episode description.
  That is a thin capture rather than a truncated one, since it is the whole
  description. A transcript of either clip would need the audio.

### True duplicate record (curator decision)

These look like one work recorded twice. Merging or dropping a record touches
the graph, the embeddings and every derived file, so it is a curator ruling,
like the #867 adjudication. Nothing was changed.

- `RECORD-00387` and `RECORD-00700`: "He said, she said journalism", 2009-04-12,
  at the legacy `archive.pressthink.org` print URL and the modern
  `pressthink.org` URL. Same shape as the `RECORD-00340` and `RECORD-00699` pair
  the #210 audit left to the curator.
- `RECORD-00068` and `RECORD-00069`: "What Are Journalists For?" as two bookseller
  listings, Goodreads and AbeBooks, sharing the publisher's description.
  `RECORD-00068` has no `raw_text` at all.
- `RECORD-00749` and `RECORD-00777`: one PBS NewsHour "Brief but Spectacular"
  segment from 2016-12-08, as its show page and its Brief page. The excerpts are
  identical. `RECORD-00777` already replaced a third copy (`RECORD-00055`) in
  `data/fixes/fix-duplicate-urls.js`.

### Wrong text on the record

**`RECORD-00029`, fixed.** The 2016 PressThink essay "Asymmetry between the
major parties fries the circuits of the mainstream press" stored the YouTube
auto-caption transcript of `RECORD-00030`, the two-minute IRE video on
crowdsourcing. The two records' `raw_text` was byte-identical, and the wrong
text has been there since 68353c50, the reorganization for public release. The essay's
own text is in the PressThink source journal,
`preservation/pressthink/versions.jsonl`: WordPress post 9172, captured
2026-11-02T19:55:34Z, linked to `RECORD-00029`, version sha256
`ee4a5b1210b28091017148b7e88d5326a5bc34f684d4f23fca22f664c420e349`. The fix
copies that version's text as is. That is the form already stored on the 184
records whose `raw_text` matches their linked journal version. The record's 15 extracted relationships already
quote the essay, so the graph needed no change. `RECORD-00030` keeps its
transcript.

**`RECORD-00161`, fixed.** "Tough Guy Journalism More in Vogue in LA"
(2003-12-11) stored only the PressThink sidebar of older posts, which begins
"The People Formerly Known as the Audience". Its body, the post on Tim Rutten
and Daniel Okrent, was stored on `RECORD-00162` instead. The fix copies
`RECORD-00162`'s `raw_text` onto `RECORD-00161`. A second copy in git history
backs it up: the print twin `RECORD-00459` (`rutten_ombud_p.html`, the same
post) was dropped as a duplicate in d9a8f6f2. In d9a8f6f2^ its `raw_text`
contains the new `RECORD-00161` text word for word, once whitespace is
normalized, followed by the post's comment pointer and its sidebar.

**`RECORD-00162`, not fixed, needs the source.** The Rodney Benson interview
(2003-12-05) still stores the Rutten post. The interview text is not in the
repository. Its print twin `RECORD-00485`, also dropped in d9a8f6f2, stored the
Yearly Kos post, so history has no copy either. The seven relationships
extracted from the Rutten text are filed under `RECORD-00162`
(`RECORD-00162_REL_001` to `_008`), so the text stays until the interview is
recovered and the graph is moved in the same pass. See the follow-ups.

**`RECORD-00032`, not fixed, needs the source.** "Journalism: Where we went wrong
and what we can do about it" is a 63-minute CUNY panel from 2016-11-18
(`length_in_seconds` 3789). Its `raw_text` is a transcript of the 2010 ABC
Australia interview on horse race journalism, which is `RECORD-00033`. It talks
about Julia Gillard and Tony Abbott. The record's own notes say the transcript
fetch for `o_SzPrd2RNw` failed, and its summary and its five relationships come
from the panel's video description. The two transcripts differ by a few words,
so they come from two caption runs, and only the video itself can confirm what
it holds. The panel transcript is not in the repository.

## The fingerprint tier

The issue asked whether the tier could strip a known boilerplate prefix before
fingerprinting. A prototype stripped the Wayback toolbar, which is the largest
group and a fixed, machine-made block that ends at the "The Wayback Machine -
<url>" line. It did not help:

- What follows the toolbar is the archived site's own navigation, such as "Skip
  to content" with a timestamped Wayback link. Each row gets a new fingerprint
  made of url fragments rather than prose. `RECORD-00733` and `RECORD-00734`
  then collide again on the NYPR network bar.
- None of these 19 rows is a PressThink post, so no source entry can ever match
  them. Dropping their shared fingerprint costs nothing.
- The tier confirms no work today. All 678 present works match by exact url, and
  the change left every result as it was.

The prefix strip was not adopted. The collisions that could cost a real match
are the cross-posts, where a PressThink row and its Huffington Post twin share
an opening. Resolving those means teaching the matcher to prefer the PressThink
host's row, which changes matching rules and is outside this issue.

## Social posts

`data/social_posts.csv` holds 30,146 source rows. 20,811 have enough text for a
fingerprint, and 371 fingerprints are shared by 813 rows. 139 `raw_text` values
appear more than once, across 546 rows. These are Jay's own repetitions: the
same post on Twitter, Bluesky and Mastodon, refrains he reuses ("not the odds
but the stakes"), and link shares that open with a headline. 14 openings are
shared between a social post and a curated record, and all are expected: each
`THREAD-*` record against the Bluesky post that starts it, and posts that quote
a PressThink opening. None is a capture error, and none feeds the fingerprint
tier.

## Follow-ups

These need either the source on the web or a curator ruling, so they were not
done here.

1. Recover the Rodney Benson interview text for `RECORD-00162`
   (`http://archive.pressthink.org/2003/12/05/benson_interview.html`, Wayback).
   In the same pass, move `RECORD-00162_REL_001` to `_008` to `RECORD-00161`,
   and drop the three `RECORD-00161` relationships that came from the sidebar
   (`RECORD-00161_REL_004`, `_009`, `_010`: Walter Pincus, Len Downie, Jim Brady).
2. Fetch the transcript of `https://youtu.be/o_SzPrd2RNw` for `RECORD-00032`, or
   confirm that the video really is the CUNY panel, and replace the ABC
   transcript.
3. Rule on the three duplicate pairs: `RECORD-00387`/`RECORD-00700`,
   `RECORD-00068`/`RECORD-00069`, `RECORD-00749`/`RECORD-00777`.
4. Clean capture chrome out of `raw_text` for the boilerplate groups, starting
   with the 19 Wayback page captures. Where the article starts and ends inside
   each capture is a per-site judgment, and some captures may hold no article
   at all, so a curator should review it rather than leave it to a regex.
5. `backend/scripts/pressthink_sitemap_gap.py` reads the archive CSV with the
   same Python reader and has the same row split. It has no fingerprint tier,
   but its row count and title index are affected.
6. Two dates that turned up on the way: `RECORD-00691` is dated 2008-01-01, but
   the post it mirrors, `RECORD-00361`, is 2008-06-16. `RECORD-00678` is dated
   2005-12-01 against `RECORD-00355`'s Q&A of 2005-12-13.

## Reproducing

The fixes are applied by `node data/fixes/fix-2026-11-shared-opening-raw-text.js`
(`--dry-run` to preview). A re-run does nothing. `tests/shared-opening-raw-text.test.js`
guards both corrections. The pytest
`test_every_shared_opening_in_the_archive_is_classified_in_the_audit` fails when
a new shared opening appears whose records this file does not name.
