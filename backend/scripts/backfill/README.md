# Backfill scripts

| File | What it fills | Source of truth |
|------|---------------|-----------------|
| `date_backfill.py` | `publication_date` | Google Sheets |
| `backfill_missing_dates.py` | `publication_date` | `data/archive_records-public.csv` |
| `backfill_worker.py` | `pull_quote`, `raw_text` | Google Sheets |
| `bulk_reprocessor.py` | every AI field | Google Sheets |
| `date_extraction.py` | nothing; shared URL date parser | — |

## Publication-date backfill

Use the preview-first CLI from `backend/`:

```bash
# Preview the enhanced strategy against the final worksheet
poetry run python -m scripts.backfill.date_backfill

# Preview rows 27-42 in a staging worksheet
poetry run python -m scripts.backfill.date_backfill \
  --strategy enhanced \
  --worksheet test_runs \
  --start-row 27 \
  --limit 16

# Write only after reviewing the printed plan
poetry run python -m scripts.backfill.date_backfill \
  --strategy publication \
  --worksheet test_runs \
  --start-row 27 \
  --limit 16 \
  --live
```

The command is non-executing unless `--live` is supplied. It loads Google and
the scraping dependencies only after the plan is validated.

The strategy is the resolver chain. Each resolver runs in order and the first
date wins:

| Strategy | Resolvers | Cost |
|----------|-----------|------|
| `simple` | URL | free, no network |
| `enhanced` | URL, page | one page fetch per undated record |
| `publication` | URL, page, Gemini | adds one AI call per remaining record |

`--start-row` is an inclusive Google Sheets row number; row 1 is reserved for
headers. `--limit` counts records from that row. All strategies share the same
row-window contract, including empty and shorter-than-requested worksheets.

## Consolidation notes (issue #189)

`simple_date_backfill.py`, `enhanced_date_backfill.py`, and
`publication_date_backfill.py` were three files that shared a constructor, a
sheet walk, a batched write, and a date normaliser. They are now one
`DateBackfiller` class whose `strategy` argument selects the resolver chain.
Nothing resisted the merge, so no strategy is kept separate.

Four differences had to be reconciled rather than simply copied. Each is a
widening: input the old code rejected may now succeed, and input it accepted
still behaves the same.

1. **Date formats.** The accepted-format list is the union of the three lists,
   with each list's relative order preserved, so no string changes meaning.
   `enhanced`'s stripping of `Published:` labels and trailing timezone names now
   applies to every strategy.
2. **Page reading.** `enhanced` read meta tags, `time` elements, class-named
   date elements, JSON-LD, and byline text. `publication` read a subset. The
   merged resolver uses the larger set for both.
3. **Missing columns.** `simple` and `enhanced` raised `ValueError` when the
   worksheet had no `url` or `title` header. The merged walk uses
   `publication`'s tolerant lookup instead. A missing `publication_date` column
   still stops the run, with a message.
4. **Column letters.** All three built the target cell with `chr(65 + index)`,
   which produces a non-letter past column Z. The merged walk converts the index
   properly, so a sheet with more than 26 columns writes to a real cell.

Console output is now one shared summary with a per-resolver count, replacing
three differing report blocks.

The former `scripts/run_date_backfill.py` wrapper was removed because it
silently selected the `enhanced` strategy, the `test_runs` worksheet, and row 2.
The former `scripts/run_backfill.py` wrapper was removed for the same reason:
it only set up `sys.path` and its name suggested a date backfill when it ran the
`pull_quote` / `raw_text` worker. Run that worker directly instead:

```bash
poetry run python -m scripts.backfill.backfill_worker
```

`backfill_missing_dates.py` moved here from `backend/scripts/`. It stays a
separate file because it is a different job: it writes hand-checked dates into
the repository CSV, while `date_backfill.py` infers dates into Google Sheets.
