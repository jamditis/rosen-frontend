# Backfill scripts

## Publication-date backfill

Use the maintained preview-first dispatcher from `backend/`:

```bash
# Preview the enhanced strategy against the final worksheet
poetry run python -m scripts.backfill.date_backfill

# Preview rows 27–42 in a staging worksheet
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

The command is non-executing unless `--live` is supplied. It loads Google and the selected strategy only after the plan is validated.

Available strategies:

- `simple` — URL-pattern extraction.
- `enhanced` — URL patterns plus page metadata and structured data.
- `publication` — URL and page extraction with a Gemini-assisted final fallback.

`--start-row` is an inclusive Google Sheets row number; row 1 is reserved for headers. `--limit` counts records from that row. The three strategies share the same row-window contract, including empty and shorter-than-requested worksheets.

The former `scripts/run_date_backfill.py` wrapper was removed because it silently selected the `enhanced` strategy, the `test_runs` worksheet, and row 2.
