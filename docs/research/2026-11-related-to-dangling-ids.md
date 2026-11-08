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

This checkout's git history is shallow. It starts at the 2026-10-26 graft, and
`git log -S` finds every one of these ids already present at the earliest
commit, `81bacb0`. No commit that removed one of them is reachable, so no
removal commit can be cited. The table rests on what the repository itself
records about each removal:

- `data/fixes/fix-duplicate-urls.js`, the executed duplicate-URL fix, which
  names each removed id and the record it kept.
- `data/quality-reports/duplicate-report.txt`, the duplicate audit, which gives
  a verdict, the kept record, and the removed record's title and date.
- The `notes` column, in particular the #863 split notes on RECORD-00429 and
  RECORD-00918.
- `data/verification-log.md` (the 2026-05-24 canonical-sheet diff, which found
  the 62 PressThink `_p.html` print twins removed by `data/dedup_records.py`
  and 25 ids changed by dedup re-IDs) and
  `backend/taxonomy_consolidation_changes.txt` (a 2025-12-02 snapshot that
  still lists the removed ids' tags).

An id is re-pointed only when one of the first three sources names the record
that replaced it, and that record still holds the same work. Otherwise the
reference is dropped. A re-pointed reference that would repeat an id already in
the list, or point a record at itself, is dropped too.

## Adjudication

| Removed id | Referring rows | Why it is gone | Decision |
|---|---|---|---|
| RECORD-00055 | 9 | Removed by `data/fixes/fix-duplicate-urls.js` as a duplicate of the pbs.org/newshour/brief segment it kept as RECORD-00777. | Re-point to RECORD-00777 |
| RECORD-00583 | 2 | Removed by `data/fixes/fix-duplicate-urls.js` as a duplicate of the current.org "The Pub #62" episode it kept as RECORD-00772. | Re-point to RECORD-00772 |
| RECORD-00108 | 7 | `duplicate-report.txt` pair 3-1: the archive.pressthink.org copy of "PressThink: An Introduction" (2003-09-01), a true duplicate of RECORD-00056, which still holds that title and date. | Re-point to RECORD-00056. Dropped from RECORD-00056 itself. |
| RECORD-00521 | 4 | `duplicate-report.txt` pair 3-4: a true duplicate of "Big Wigs From the Blogging & Journalism Conference" (2005-01-26), kept as RECORD-00200, which still holds it. | Re-point to RECORD-00200 |
| RECORD-00570 | 6 | `duplicate-report.txt` pair 3-2: a duplicate of "Blog Storm Troopers or Pack Journalism at its Best?" (2005-02-10), which was then filed under RECORD-00429. The #863 split moved that post to RECORD-00918, as the notes on both rows record. | Re-point to RECORD-00918 |
| TUMBLR-00062 | 3 | `duplicate-report.txt` group 2B: the tmblr.co short-URL capture of the same Tumblr post held as RECORD-00662 (jayrosen.tumblr.com/post/243813457). | Re-point to RECORD-00662 |
| RECORD-00006 | 3 | No removal record. Its row sat beside the PressThink `_p.html` records RECORD-00002 to RECORD-00005, and it most likely went in the print-twin dedup, but nothing names a survivor. | Drop |
| RECORD-00007 | 2 | Same as RECORD-00006. | Drop |
| RECORD-00008 | 5 | Same as RECORD-00006. | Drop |
| RECORD-00015 | 5 | No removal record. Its tags in the taxonomy snapshot match RECORD-00010 (Reuters, NewAssignment.Net), so it was probably that post's print twin. Of the other four referring rows, all but RECORD-00651 already list RECORD-00010. | Drop |
| RECORD-00016 | 9 | Same pattern, against RECORD-00011 (horse-race campaign coverage). | Drop |
| RECORD-00017 | 1 | No removal record and no matching survivor. | Drop |
| RECORD-00018 | 2 | Same pattern, against RECORD-00013 (Sinclair Broadcast Group). | Drop |
| RECORD-00019 | 5 | Same pattern, against RECORD-00014 (contrarianism, newsroom self-image). | Drop |
| RECORD-00611 | 2 | A 2021-and-later tweet or thread record from the RECORD-006xx batch. RECORD-00613 and RECORD-00614 from the same batch were removed as unrecoverable (`tests/csv-quality.test.js`). No survivor is named. | Drop |
| RECORD-00615 | 1 | RECORD-006xx batch, 2016 to 2020. No survivor is named. | Drop |
| RECORD-00616 | 14 | RECORD-006xx batch. An archived proposal (`docs/archived/21-STRUCTURE-PROPOSAL.md`) calls it "Audience Atomization Overcome", which RECORD-00340 holds now. The verification log instead lists it as a sheet-side quote-variant duplicate of RECORD-00606, which is also gone. The sources disagree and none records a merge. | Drop (curator may re-point; see below) |
| RECORD-00620 | 4 | RECORD-006xx batch. The same archived proposal calls it "The People Formerly Known as the Audience". Two survivors carry that work, RECORD-00070 (HuffPost) and RECORD-00191 (PressThink), and nothing says which replaced it. | Drop (curator may re-point; see below) |
| RECORD-00621 | 4 | RECORD-006xx batch. No survivor is named. | Drop |
| RECORD-00622 | 5 | RECORD-006xx batch. No survivor is named. | Drop |
| RECORD-00623 | 5 | RECORD-006xx batch, on horse-race coverage and the "church of the savvy". No survivor is named. | Drop |
| RECORD-00625 | 4 | RECORD-006xx batch. No survivor is named. | Drop |
| RECORD-00627 | 8 | RECORD-006xx batch. No survivor is named. | Drop |
| RECORD-00628 | 3 | RECORD-006xx batch, on "he said, she said" journalism. The verification log names it as a sheet-side quote-variant duplicate, but not what of. | Drop |
| RECORD-00631 | 1 | RECORD-006xx batch, a lecture on the White House press corps. No survivor is named. | Drop |

## The fix

`data/fixes/fix-dangling-related-to.js` applies this table. The ids and the six
re-point targets are pinned in the script. A dangling id that is not in the
table stops the run, so a later removal has to be adjudicated before the script
can run. The script rewrites only the `related_to` cell of each affected row,
inside that row's own source text, and re-parses the file before writing it.
The diff therefore touches 101 `related_to` cells and no other field.

`tests/duplicate-adjudication-2026-08-27.test.js` began as a check on the seven
#867 ids alone. It now fails on any `related_to` token, in any curated row,
that resolves to no record.

## Left for a curator

- RECORD-00616 and RECORD-00620 were dropped, not re-pointed, because the
  repository does not record what replaced them. If a curator confirms that
  RECORD-00616 was "Audience Atomization Overcome", its 14 referrers could
  point at RECORD-00340. If a curator picks between RECORD-00070 and
  RECORD-00191 for "The People Formerly Known as the Audience", the four
  RECORD-00620 referrers could point there.
- `social_posts.csv` also has a `related_to` column. There it mostly holds link
  URLs, not record ids, so it does not follow the same contract and is outside
  this issue.
