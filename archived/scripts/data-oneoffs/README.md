# Data one-off scripts (archived)

These seven scripts were one-off data repairs that ran against the archive CSVs
in `data/` and were never meant to recur. They were moved here from `data/` on
2026-06-16 as part of [#380](https://github.com/jamditis/rosen-frontend/issues/380)
— the follow-up that extended the [#190](https://github.com/jamditis/rosen-frontend/issues/190)
`backend/scripts/` audit into the `data/` directory.

Audit verdict: each takes no arguments, is guarded by `if __name__ == "__main__"`,
and targets a specific, already-completed repair (named records or a fixed count of
rows). None parameterizes a recurring behavior, so there was nothing to fold into a
shared module. They are retained for provenance — to record how the archive data
reached its current state — not for reuse. Do not run them.

They were hardened to be safe to re-run in [#176](https://github.com/jamditis/rosen-frontend/issues/176)
(atomic CSV writes via `csv_safe_write.atomic_csv_write`), but the data states they
targeted are part of the committed archive, so re-running them is unnecessary.

## What each script did

| File | Against | What it addressed |
|------|---------|-------------------|
| `fix_p0_records.py` | `data/archive_records-public.csv` | Fixed five P0 records from `DATA_QUALITY_AUDIT_2026-02-06.md`: AI prompt leaks, hallucinated summaries/tags, wrong-article summaries, and a 20-year date error (RECORD-00637, -00633, -00602, -00592, -00159). |
| `fix_p0_extras.py` | `data/archive_records-public.csv` | Fixed two leftover P0 issues: a prompt leak in RECORD-00092's `responds_to` field and a "The New York Treview" typo in RECORD-00023. |
| `fix_generic_summaries.py` | `data/archive_records-public.csv` | Replaced generic author references ("The author argues…", "This article discusses…") with "Rosen …" in summary/excerpt fields, only where the record's author is Jay Rosen. |
| `fix_redundant_rosen.py` | `data/archive_records-public.csv` | Cleanup pass over `fix_generic_summaries.py`'s output: collapsed the redundant "Rosen discusses Jay Rosen's…" / "Rosen discusses Rosen's…" phrasings it created. Run after `fix_generic_summaries.py`. |
| `fix_sidebar_summaries.py` | `data/archive_records-public.csv` | Rebuilt summaries/excerpts for the 44 records whose summary was the PressThink sidebar boilerplate ("This collection of blog posts"), pulling the first few sentences from `raw_text` instead. |
| `fix_unknown_publishers.py` | `data/archive_records-public.csv` | Filled "Unknown" publisher fields from URL domain patterns via a domain→publisher map. |
| `fix_remaining_publishers.py` | `data/archive_records-public.csv` | Follow-up to `fix_unknown_publishers.py`: filled the remaining unknown publishers the first domain map missed (an extended domain map). |

## Why they can't simply be re-run

Each resolves its data files with `Path(__file__).parent / "archive_records-public.csv"`
and imports the `csv_safe_write` helper as a sibling. Both assumptions held in `data/`;
from this archived location the relative paths and the helper import no longer resolve,
so the scripts are broken at import here by design — further reason they are kept as
history rather than as tools. The live `data/` directory still holds `csv_safe_write.py`
for the standing data scripts that remain there.
