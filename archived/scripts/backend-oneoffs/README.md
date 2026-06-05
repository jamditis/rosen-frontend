# Backend one-off scripts (archived)

These five scripts were one-off data migrations and repairs that ran once against
the archive CSVs and were never meant to recur. They were moved here from
`backend/scripts/` on 2026-06-05 as part of [#190](https://github.com/jamditis/rosen-frontend/issues/190)
(audit verdict under [#132](https://github.com/jamditis/rosen-frontend/issues/132):
these are completed one-offs, not parameterizable modules). They are retained for
provenance — to record how the archive data reached its current state — not for
reuse. Do not run them.

The current archive is 1,028 records in `data/archive_records-public.csv`; the
merges below brought it to 859, so they are long superseded.

## What each script did

| File | Ran | Against | What it addressed |
|------|-----|---------|-------------------|
| `merge_new_records.py` | 2025-12-03 | `data/archive_records-public.csv` | Merged 138 Tumblr + 62 newspaper-clipping records into the main archive, taking it from 659 to 859 records. Fixed source paths, no arguments. |
| `merge_thread_records.py` | 2025-12-03 | `data/archive_records-public.csv` | Added the 10 `THREAD-*` records from `thread_records.csv` with schema alignment. |
| `fix_entity_relationships.py` | 2026-01-06 | `data/extracted_relationships.csv` | Repaired the 14 unfixable entity-ID issues from the validation report (org names used as IDs, the placeholder `O000`, `N/A`, and `Concept`). Created 8 new entities and mapped 6 to existing ones. Companion guide: `README_FIX_RELATIONSHIPS.md`. |
| `fix_youtube_rows.py` | one-off | Google Sheet rows 31–38 | Replaced YouTube transcripts for a hardcoded row range with clean, deduplicated text. |
| `fix_remaining_edge_cases.py` | one-off | Google Sheet rows 35 and 42 | Cleaned up two leftover YouTube/SoundCloud transcript edge cases by hardcoded row. |

## Why they can't simply be re-run

`fix_youtube_rows.py` and `fix_remaining_edge_cases.py` import from
`scripts.diagnostics.smart_corrector...`, a path that does not resolve from
`backend/scripts/` (the working corrector scripts use `from diagnostics.smart_corrector...`).
They have been broken at import since a directory move, which is further evidence
they have not run in a long time. The merge scripts target fixed input paths and
hardcoded record counts. None of them take arguments or parameterize a recurring
behavior, so there was nothing to fold into a shared module.

The data states they targeted are part of the committed archive, so the scripts
are kept as history rather than as tools.
