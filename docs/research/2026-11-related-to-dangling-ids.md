# Dangling related_to ids (issue #871)

Checked against repository state on 2026-11-08.

101 rows in `data/archive_records-public.csv` named 30 distinct `related_to`
tokens that resolve to no row in `archive_records-public.csv` or
`social_posts.csv`. Five of the 30 were not missing records. They were
semicolon-joined pairs (`RECORD-00733; RECORD-00739` and four more) in six rows
for the RECORD-00733 to RECORD-00740 group. A comma split read each pair as one
unknown id. Every id in those pairs exists, so those rows were only rewritten
with the `, ` separator. That leaves 25 removed ids, adjudicated below.

## How the ids were traced

For each id, the commits that touched `data/archive_records-public.csv` were
walked in order to find the commit whose parent still held the id's row and
whose tree did not. Each removed row's url was then matched against the rows
that commit kept. Four commits account for all 25 removals:

- `084a33b0` (2026-02-05), "Remove 24 duplicate URL records (869 -> 845)":
  RECORD-00006 to 00008, 00015 to 00019, and the nine RECORD-006xx ids below.
  Each removed row shared its url with a row the commit kept.
- `f6c12a3d` (2026-02-14), `data/fixes/fix-duplicate-urls.js`: RECORD-00055
  and RECORD-00583. The script names each removed id and the record it kept.
- `8876c2ef` (2026-02-27), "Remove 8 duplicate records", with
  `data/quality-reports/duplicate-report.txt` naming the kept record of each
  pair: RECORD-00108, 00521, and 00570.
- `fb8b2a08` (2026-03-01), "Remove TUMBLR-00062 (confirmed duplicate of
  RECORD-00662)".

Several records `084a33b0` kept were themselves removed later, so those
references follow the chain to the record that holds the work now:
RECORD-00610 (removed in `8876c2ef`, pair 3-3, kept RECORD-00340), RECORD-00607
(removed in `bc776997` under curator-approved #591, kept RECORD-00191),
RECORD-00606 (removed in `8876c2ef`, pair 3-6, kept RECORD-00387), and
RECORD-00093 (removed in `f6c12a3d`, kept RECORD-00751).

An id is re-pointed only when its removal commit names the surviving record and
that record still holds the same url or work. Otherwise the reference is
dropped. A re-pointed reference that would repeat an id already in the list, or
point a record at itself, is dropped too. Many print-twin rows listed their own
twin, so those references disappear instead of becoming self-references.

## Adjudication

| Removed id | Referring rows | Removed in | Why it is gone | Decision |
|---|---|---|---|---|
| RECORD-00006 | 3 | `084a33b0` | Same url as RECORD-00002 (`2005/03/08/nlsn_blg_p.html`), same title. | Re-point to RECORD-00002 |
| RECORD-00007 | 2 | `084a33b0` | Same url as RECORD-00003 (`2004/08/27/rnc_jitter_p.html`), same title. | Re-point to RECORD-00003 |
| RECORD-00008 | 5 | `084a33b0` | Same url as RECORD-00004 (`2005/06/10/frkn_nro_p.html`), same title. | Re-point to RECORD-00004 |
| RECORD-00015 | 5 | `084a33b0` | Same url as RECORD-00010 (`2006/09/20/rts_gft_p.html`), same title. | Re-point to RECORD-00010 |
| RECORD-00016 | 9 | `084a33b0` | Same url as RECORD-00011 (`2008/01/20/the_campaign_pr_p.html`), same title. | Re-point to RECORD-00011 |
| RECORD-00017 | 1 | `084a33b0` | Same url as RECORD-00012 (`2008/02/28/three_bizarre_v_p.html`), same title. | Re-point to RECORD-00012 |
| RECORD-00018 | 2 | `084a33b0` | Same url as RECORD-00013 (`2004/11/16/snclr_vision_p.html`), same title. | Re-point to RECORD-00013 |
| RECORD-00019 | 5 | `084a33b0` | Same url as RECORD-00014 (`2008/03/04/three_stories_f_p.html`). The removed row's title, "Three Stories That Went Awry", differed from the kept row's; the url names one post. | Re-point to RECORD-00014 |
| RECORD-00615 | 1 | `084a33b0` | Same Politico url and date as RECORD-00604. | Re-point to RECORD-00604 |
| RECORD-00616 | 14 | `084a33b0`, then `8876c2ef` | Same url and title as RECORD-00610 ("Audience Atomization Overcome"), which `8876c2ef` removed as a duplicate of RECORD-00340 (pair 3-3). | Re-point to RECORD-00340 |
| RECORD-00620 | 4 | `084a33b0`, then `bc776997` | Same url (`2006/06/27/ppl_frmr.html`) as RECORD-00607, which #591 removed as a duplicate of RECORD-00191 (`data/fixes/remove-record-00607.py`). | Re-point to RECORD-00191 |
| RECORD-00621 | 4 | `084a33b0` | Same Dick Tofel Substack url and date as RECORD-00601. | Re-point to RECORD-00601 |
| RECORD-00622 | 5 | `084a33b0` | Same url as RECORD-00600 ("Some more personal news", October 2025). | Re-point to RECORD-00600 |
| RECORD-00623 | 5 | `084a33b0` | Same url and title as RECORD-00609 ("Why Political Coverage Is Broken"). | Re-point to RECORD-00609 |
| RECORD-00627 | 8 | `084a33b0` | Same Dick Tofel Substack url as RECORD-00601. | Re-point to RECORD-00601 |
| RECORD-00628 | 3 | `084a33b0`, then `8876c2ef` | Same url as RECORD-00606, which `8876c2ef` removed as a duplicate of RECORD-00387 (pair 3-6, "he said, she said" journalism). | Re-point to RECORD-00387 |
| RECORD-00631 | 1 | `084a33b0`, then `f6c12a3d` | Same Vox transcript url as RECORD-00093, which `fix-duplicate-urls.js` removed as a duplicate of RECORD-00751. | Re-point to RECORD-00751 |
| RECORD-00611 | 2 | `084a33b0` | Shared an x.com url with RECORD-00602, which `c9902c6e` later removed as a corrupted duplicate of social rows (`data/verification-log.md`, "Record 00602 corrupted duplicate removal"). No curated record holds the work. | Drop |
| RECORD-00625 | 4 | `084a33b0` | Same as RECORD-00611. | Drop |
| RECORD-00055 | 9 | `f6c12a3d` | `fix-duplicate-urls.js`: duplicate of the pbs.org/newshour/brief segment kept as RECORD-00777. | Re-point to RECORD-00777 |
| RECORD-00583 | 2 | `f6c12a3d` | `fix-duplicate-urls.js`: duplicate of the current.org "The Pub #62" episode kept as RECORD-00772. | Re-point to RECORD-00772 |
| RECORD-00108 | 7 | `8876c2ef` | Pair 3-1: the archive.pressthink.org copy of "PressThink: An Introduction" (2003-09-01), a true duplicate of RECORD-00056. | Re-point to RECORD-00056 |
| RECORD-00521 | 4 | `8876c2ef` | Pair 3-4: a true duplicate of "Big Wigs From the Blogging & Journalism Conference" (2005-01-26), kept as RECORD-00200. | Re-point to RECORD-00200 |
| RECORD-00570 | 6 | `8876c2ef` | Pair 3-2: a duplicate of "Blog Storm Troopers or Pack Journalism at its Best?" (2005-02-10), then filed under RECORD-00429. The #863 split moved that post to RECORD-00918, as the notes on both rows record. | Re-point to RECORD-00918 |
| TUMBLR-00062 | 3 | `fb8b2a08` | Group 2B: the tmblr.co short-url capture of the Tumblr post held as RECORD-00662. | Re-point to RECORD-00662 |

## The fix

`data/fixes/fix-dangling-related-to.js` applies this table. The 23 re-point
targets and the two dropped ids are pinned in the script. A dangling id that is
not in the table stops the run, so a later removal has to be adjudicated before
the script can run. The script rewrites only the `related_to` cell of each affected row,
inside that row's own source text, and re-parses the file before writing it.
The diff therefore touches 101 `related_to` cells and no other field.

`tests/duplicate-adjudication-2026-08-27.test.js` began as a check on the seven
#867 ids alone. It now fails on any `related_to` token, in any curated row,
that resolves to no record.

## Left for a curator

- RECORD-00611 and RECORD-00625 were dropped. Their tweets may survive in
  `social_posts.csv`, but no removal record names one, so a curator would have
  to identify it before pointing at it.
- `social_posts.csv` also has a `related_to` column. There it mostly holds link
  URLs, not record ids, so it does not follow the same contract and is outside
  this issue.
