# Smart corrector diagnostics package

This directory contains the reusable diagnostics and media-processing helpers that support the archive’s canonical smart-corrector command.

## Supported entry point

Run the corrector from `backend/` through the single maintained CLI:

```bash
# Preview the first 10 records; dry run is the default
poetry run python -m scripts.corrector --rows :10

# Preview inclusive sheet rows 27 through 42
poetry run python -m scripts.corrector --rows 27-42

# Write an open-ended range, capped at 50 records and $10
poetry run python -m scripts.corrector --rows 201- --limit 50 --max-cost 10 --live
```

The former `smart_data_corrector.py` orchestrator and the range-specific `run_smart_corrector*.py` wrappers were retired. Their processing path is now represented by `backend/scripts/corrector.py`, which is range-safe and dry-run by default.

## CLI options

```text
--rows RANGE   Select :N, N-M, or N- (default: all data rows)
--limit N      Cap the selected record count
--resume       Skip leading rows with a completion marker
--max-cost USD Stop before a paid call would exceed this budget
--dry-run      Analyze without worksheet writes (default)
--live         Write raw text, AI fields, and notes
```

## Package contents

### Core diagnostics

- `content_detector.py` — content-type detection and domain overrides.
- `quality_validator.py` — raw-text quality scoring and issue detection.
- `audio_optimizer.py` — optional FFmpeg speed processing and timestamp normalization.
- `cost_tracker.py` — budget estimation, limits, and operation logging.

### Media processors

- `processors/soundcloud_processor.py` — SoundCloud metadata and description extraction.
- `processors/cspan_processor.py` — C-SPAN transcript fallbacks.
- `processors/youtube_processor.py` — YouTube caption extraction.
- `processors/twitter_processor.py` — Twitter/X thread extraction fallbacks.

### Output support

- `pdf_generator.py` — accessible, content-aware PDF generation.

## Architecture

```text
backend/scripts/corrector.py          canonical range-safe orchestrator
        |
        v
backend/scripts/diagnostics/smart_corrector/
├── content_detector.py
├── quality_validator.py
├── audio_optimizer.py
├── cost_tracker.py
├── processors/
│   ├── soundcloud_processor.py
│   ├── cspan_processor.py
│   ├── youtube_processor.py
│   └── twitter_processor.py
└── pdf_generator.py
```

The canonical command owns row selection, dry-run/live behavior, budget handling, and Google Sheets coordination. This package supplies focused processing helpers; it is not a second CLI or orchestration layer.

## Verification

From `backend/`:

```bash
poetry run pytest tests/test_corrector.py tests/test_corrector_range.py
poetry run ruff check scripts/corrector.py scripts/diagnostics/smart_corrector tests/test_corrector.py tests/test_corrector_range.py
```
