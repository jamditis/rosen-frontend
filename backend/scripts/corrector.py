# -*- coding: utf-8 -*-
"""Canonical, range-safe driver for the Rosen Archive smart corrector.

The processing core has no credential or network setup. Callers inject the
worksheet, categorizer, content detector, validator, and source processors so
row selection and sheet writes can be tested without Google credentials.
"""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol

try:
    from .corrector_range import RowRange, parse_row_range
except ImportError:  # pragma: no cover - supports direct script imports
    from corrector_range import RowRange, parse_row_range


AI_FIELDS = (
    "summary",
    "thematic_categories",
    "key_concepts",
    "tags",
    "pull_quote",
)
SMART_CORRECTOR_MARKER = "Smart Corrector:"
# A completed row's most recent smart-corrector status starts with one of these.
# The consolidated corrector writes "Complete - ..."; the five retired drivers
# wrote "Used cached text ..." or "Reprocessed via ..." with no "Complete -"
# prefix. Statuses that mean the row still needs work ("Incomplete - ...",
# "Needs reprocessing") deliberately stay out so --resume retries them.
COMPLETION_STATUS_PREFIXES = (
    "Complete -",
    "Used cached text",
    "Reprocessed via",
)
# A success prefix is necessary but not sufficient. "Used cached text" and
# "Reprocessed via" describe the text-extraction step, and a legacy driver could
# pair either with an inline failure (e.g. "Used cached text ... | AI error: ...")
# on a row whose AI analysis never landed. Any of these markers in the status
# means the row is not safely complete, so --resume must retry it rather than skip
# it and leave the AI fields empty.
INCOMPLETE_STATUS_MARKERS = (
    "Incomplete",
    "Needs reprocessing",
    "AI error",
    "AI analysis unavailable",
    "Budget limit",
    "Failed",
    "NEEDS_TRANSCRIPTION",
)
RAW_TEXT_TRUNCATE_AT = 49_000
TRUNCATION_SUFFIX = "... [TRUNCATED]"
DEFAULT_MAX_COST = 35.0
DEFAULT_CATEGORIZER_COST = 0.006


class Worksheet(Protocol):
    """The Google Worksheet operations used by the core."""

    def row_values(self, row: int) -> list[str]: ...

    def get_all_records(self) -> list[dict[str, Any]]: ...

    def batch_update(self, data: list[dict[str, Any]]) -> Any: ...


class BudgetTracker(Protocol):
    """The cost-tracker operations used to guard paid calls."""

    max_budget: float

    def estimate_cost(
        self,
        content_type: str,
        duration: float | None = None,
        text_length: int | None = None,
    ) -> float: ...

    def can_afford(self, estimated_cost: float) -> bool: ...

    def record_cost(
        self,
        cost_type: str,
        amount: float,
        operation: str = "",
        details: Mapping[str, Any] | None = None,
    ) -> Any: ...


Categorizer = Callable[[str, Mapping[str, Any]], Mapping[str, Any] | None]
Detector = Callable[[str], str]
Validator = Callable[[str, str, str], tuple[bool, float, list[str]]]
Processor = Callable[[str], Mapping[str, Any] | None]


@dataclass(frozen=True)
class RuntimeDependencies:
    """Concrete dependencies assembled only when the CLI runs."""

    worksheet: Worksheet
    categorizer: Categorizer
    processors: Mapping[str, Processor]
    detector: Detector
    validator: Validator
    schema: Mapping[str, Any]


def run_corrector(
    row_range: RowRange,
    *,
    worksheet: Worksheet,
    categorizer: Categorizer,
    processors: Mapping[str, Processor],
    detector: Detector,
    validator: Validator,
    schema: Mapping[str, Any],
    dry_run: bool = True,
    write_ai_fields: bool = True,
    resume: bool = False,
    cost_tracker: BudgetTracker | None = None,
    categorizer_cost: float = DEFAULT_CATEGORIZER_COST,
    selection_end_row: int | None = None,
    selection_limit: int | None = None,
) -> dict[str, Any]:
    """Process a selected worksheet range with injected dependencies.

    ``dry_run`` defaults to ``True`` and suppresses every worksheet write.
    ``write_ai_fields`` defaults to the canonical behavior from the former
    ``run_smart_corrector_201_plus.py`` driver. When ``resume`` is true, the
    core skips the leading selected rows already marked by a prior smart-
    corrector note.
    """
    headers = worksheet.row_values(1)
    columns = {name: headers.index(name) + 1 for name in ("raw_text", "notes")}
    if write_ai_fields:
        columns.update({name: headers.index(name) + 1 for name in AI_FIELDS})

    selected = row_range.select(worksheet.get_all_records())
    if (
        selection_end_row is None
        and selection_limit is None
        and row_range.count is not None
        and selected
    ):
        selection_end_row = row_range.sheet_row(len(selected) - 1)
    resume_offset = _resume_offset(selected) if resume else 0
    stats = {
        "selected": len(selected),
        "processed": 0,
        "skipped": resume_offset,
        "cached": 0,
        "reprocessed": 0,
        "errors": 0,
        "write_errors": 0,
        "ai_fields_written": 0,
        "estimated_cost": 0.0,
        "budget_stopped": False,
        "budget_stop_row": None,
        "budget_note": "",
        "edge_cases": {
            "cell_limit": 0,
            "missing_content": 0,
            "needs_transcription": 0,
        },
    }

    for local_index in range(resume_offset, len(selected)):
        record = selected[local_index]
        row_number = row_range.sheet_row(local_index)
        url = str(record.get("url") or "").strip()
        if not url:
            stats["skipped"] += 1
            continue

        content_type = detector(url)
        existing_raw_text = str(record.get("raw_text") or "")
        is_valid, quality_score, _issues = _validate(
            validator, existing_raw_text, url, content_type
        )

        row_updates: list[tuple[int, Any]] = []
        analysis_text = existing_raw_text
        processor_analysis: Mapping[str, Any] | None = None
        if is_valid and quality_score >= 0.7:
            result_message = f"Used cached text (Q:{quality_score:.2f})"
        else:
            processor_cost = None
            if (
                cost_tracker is not None
                and _processor_name(content_type, url) == "default"
                and processors.get("default") is not None
            ):
                processor_cost = cost_tracker.estimate_cost(
                    content_type,
                    text_length=len(existing_raw_text) or None,
                )
                if not _authorize_cost(
                    cost_tracker,
                    processor_cost,
                    row_number=row_number,
                    selection_end_row=selection_end_row,
                    remaining_limit=(
                        len(selected) - local_index
                        if selection_limit is not None
                        else None
                    ),
                    stats=stats,
                ):
                    break
            result = _run_processor(processors, content_type, url)
            if processor_cost is not None:
                _record_cost(
                    cost_tracker,
                    processor_cost,
                    operation=f"Source processing for sheet row {row_number}",
                    stats=stats,
                )
            if result and result.get("status") == "needs_transcription":
                reason = str(result.get("error") or "Requires audio transcription")
                note = _note(f"[NEEDS_TRANSCRIPTION] {reason[:50]}")
                stats["edge_cases"]["needs_transcription"] += 1
                if _write_row(
                    worksheet,
                    row_number,
                    [(columns["notes"], note)],
                    dry_run=dry_run,
                ):
                    stats["processed"] += 1
                else:
                    stats["write_errors"] += 1
                continue
            if not result or result.get("status") != "success":
                error = (
                    result.get("error", "Processor not available")
                    if result
                    else "Processor not available"
                )
                note = _note(f"Failed - {str(error)[:50]}")
                stats["errors"] += 1
                if _write_row(
                    worksheet,
                    row_number,
                    [(columns["notes"], note)],
                    dry_run=dry_run,
                ):
                    stats["processed"] += 1
                else:
                    stats["write_errors"] += 1
                continue

            analysis_text = str(result.get("raw_text") or "")
            if not analysis_text:
                note = _note("Processing returned no content")
                stats["errors"] += 1
                stats["edge_cases"]["missing_content"] += 1
                if _write_row(
                    worksheet,
                    row_number,
                    [(columns["notes"], note)],
                    dry_run=dry_run,
                ):
                    stats["processed"] += 1
                else:
                    stats["write_errors"] += 1
                continue

            if len(analysis_text) > RAW_TEXT_TRUNCATE_AT:
                analysis_text = analysis_text[:RAW_TEXT_TRUNCATE_AT] + TRUNCATION_SUFFIX
                stats["edge_cases"]["cell_limit"] += 1

            row_updates.append((columns["raw_text"], analysis_text))
            stats["reprocessed"] += 1
            source = result.get("source", content_type)
            result_message = f"Reprocessed via {source} | {len(analysis_text)} chars"
            processor_analysis = {
                field: result[field] for field in AI_FIELDS if result.get(field)
            }

        if processor_analysis:
            analysis = processor_analysis
        else:
            if cost_tracker is not None and not _authorize_cost(
                cost_tracker,
                categorizer_cost,
                row_number=row_number,
                selection_end_row=selection_end_row,
                remaining_limit=(
                    len(selected) - local_index if selection_limit is not None else None
                ),
                stats=stats,
            ):
                if row_updates:
                    row_updates.append(
                        (
                            columns["notes"],
                            _note(
                                f"Incomplete - {result_message} | "
                                "Budget limit reached before AI analysis"
                            ),
                        )
                    )
                    if _write_row(
                        worksheet, row_number, row_updates, dry_run=dry_run
                    ):
                        stats["processed"] += 1
                    else:
                        stats["write_errors"] += 1
                        stats["errors"] += 1
                break
            if is_valid and quality_score >= 0.7:
                stats["cached"] += 1
            try:
                analysis = categorizer(analysis_text, schema)
            except Exception as exc:  # Preserve extracted text for a later resume.
                analysis = None
                result_message += f" | AI error: {str(exc)[:50]}"
            finally:
                if cost_tracker is not None:
                    _record_cost(
                        cost_tracker,
                        categorizer_cost,
                        operation=f"AI analysis for sheet row {row_number}",
                        stats=stats,
                    )

        written_fields: list[str] = []
        if analysis:
            analysis_updates, written_fields = _analysis_updates(
                columns,
                analysis,
                write_ai_fields=write_ai_fields,
            )
            row_updates.extend(analysis_updates)
            if written_fields:
                result_message += f" | Updated: {', '.join(written_fields)}"
            note = _note(f"Complete - {result_message}")
        else:
            note = _note(f"Incomplete - {result_message} | AI analysis unavailable")

        row_updates.append((columns["notes"], note))
        if _write_row(worksheet, row_number, row_updates, dry_run=dry_run):
            stats["processed"] += 1
            if not dry_run:
                stats["ai_fields_written"] += len(written_fields)
        else:
            stats["write_errors"] += 1
            stats["errors"] += 1

    return stats


def _authorize_cost(
    cost_tracker: BudgetTracker,
    estimated_cost: float,
    *,
    row_number: int,
    selection_end_row: int | None,
    remaining_limit: int | None,
    stats: dict[str, Any],
) -> bool:
    if cost_tracker.can_afford(estimated_cost):
        return True

    stats["budget_stopped"] = True
    stats["budget_stop_row"] = row_number
    end_row = selection_end_row or ""
    limit_arg = f" --limit {remaining_limit}" if remaining_limit is not None else ""
    stats["budget_note"] = (
        f"Budget limit reached before sheet row {row_number} "
        f"(next estimated call: ${estimated_cost:.4f}). Review recorded spend, "
        f"then rerun with --rows {row_number}-{end_row}{limit_arg} --resume "
        "and a higher --max-cost."
    )
    return False


def _record_cost(
    cost_tracker: BudgetTracker,
    amount: float,
    *,
    operation: str,
    stats: dict[str, Any],
) -> None:
    cost_tracker.record_cost("gemini_flash", amount, operation=operation)
    stats["estimated_cost"] = round(stats["estimated_cost"] + amount, 4)


def _validate(
    validator: Validator,
    raw_text: str,
    url: str,
    content_type: str,
) -> tuple[bool, float, list[str]]:
    if not raw_text:
        return False, 0.0, ["No raw_text found"]
    return validator(raw_text, url, content_type)


def _run_processor(
    processors: Mapping[str, Processor], content_type: str, url: str
) -> Mapping[str, Any] | None:
    processor_name = _processor_name(content_type, url)
    processor = processors.get(processor_name) or processors.get("default")
    if processor is None:
        return None
    try:
        return processor(url)
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


def _processor_name(content_type: str, url: str) -> str:
    lowered_url = url.lower()
    if content_type == "audio" and "soundcloud" in lowered_url:
        return "soundcloud"
    if content_type == "video":
        if "youtube" in lowered_url or "youtu.be" in lowered_url:
            return "youtube"
        if "c-span" in lowered_url:
            return "cspan"
    if content_type == "social" and (
        "twitter.com" in lowered_url or "x.com" in lowered_url
    ):
        return "twitter"
    return "default"


def _analysis_updates(
    columns: Mapping[str, int],
    analysis: Mapping[str, Any],
    *,
    write_ai_fields: bool,
) -> tuple[list[tuple[int, Any]], list[str]]:
    if not write_ai_fields:
        return [], []

    updates = []
    written = []
    for field in AI_FIELDS:
        value = analysis.get(field)
        if not value:
            continue
        if isinstance(value, list):
            value = ", ".join(str(item) for item in value)
        updates.append((columns[field], value))
        written.append(field)
    return updates, written


def _write_row(
    worksheet: Worksheet,
    row_number: int,
    updates: list[tuple[int, Any]],
    *,
    dry_run: bool,
) -> bool:
    if dry_run:
        return True
    data = [
        {
            "range": f"{_column_name(column)}{row_number}",
            "values": [[value]],
        }
        for column, value in updates
    ]
    try:
        worksheet.batch_update(data)
    except Exception:
        return False
    return True


def _column_name(column: int) -> str:
    name = ""
    while column:
        column, remainder = divmod(column - 1, 26)
        name = chr(ord("A") + remainder) + name
    return name


def _note(message: str) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"[{timestamp}] {SMART_CORRECTOR_MARKER} {message}"


def _notes_indicate_completion(notes: str) -> bool:
    """True when the row's most recent smart-corrector status marks it complete.

    A run overwrites the notes cell with a single note, but legacy drivers may
    have left several accumulated notes in one cell. Anchor on the status that
    follows the LAST "Smart Corrector:" marker so a stale success note earlier in
    the cell cannot mask a current "Needs reprocessing"/"Incomplete" status and
    skip a row that still needs work.
    """
    marker_at = notes.rfind(SMART_CORRECTOR_MARKER)
    if marker_at == -1:
        return False
    # lstrip() absorbs the ": " (or a bare ":") between the marker and status,
    # so a legacy note without the space after the colon still anchors here.
    status = notes[marker_at + len(SMART_CORRECTOR_MARKER) :].lstrip()
    if not status.startswith(COMPLETION_STATUS_PREFIXES):
        return False
    return not any(marker in status for marker in INCOMPLETE_STATUS_MARKERS)


def _resume_offset(records: list[dict[str, Any]]) -> int:
    offset = 0
    for record in records:
        if not _notes_indicate_completion(str(record.get("notes", ""))):
            break
        offset += 1
    return offset


def _requested_end_row(rows: str | None) -> int | None:
    spec = (rows or "").strip()
    if spec.startswith(":"):
        return int(spec[1:]) + 1
    _start, separator, end = spec.partition("-")
    return int(end) if separator and end else None


def _resolve_rows(rows: str | None, start_row: int | None) -> str | None:
    """Map the legacy --start-row alias onto the canonical open-ended rows spec."""
    if start_row is not None:
        return f"{start_row}-"
    return rows


def build_parser(
    *, default_rows: str | None = None, default_limit: int | None = None
) -> argparse.ArgumentParser:
    """Build the shared CLI parser, including safe dry-run defaults."""
    parser = argparse.ArgumentParser(
        description="Run the range-safe Rosen Archive smart corrector."
    )
    row_selection = parser.add_mutually_exclusive_group()
    row_selection.add_argument(
        "--rows",
        default=default_rows,
        help="Sheet rows as :N, N-M, or N- (default: all data rows)",
    )
    row_selection.add_argument(
        "--start-row",
        type=int,
        default=None,
        help="Legacy alias for --rows N- (start at row N with no upper bound)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=default_limit,
        help="Maximum number of selected rows to process",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip leading selected rows with a smart-corrector completion marker",
    )
    parser.add_argument(
        "--max-cost",
        type=float,
        default=DEFAULT_MAX_COST,
        help=f"Maximum estimated paid-call cost in USD (default: {DEFAULT_MAX_COST:.2f})",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="Analyze without writing to the worksheet (default)",
    )
    mode.add_argument(
        "--live",
        dest="dry_run",
        action="store_false",
        help="Write raw text, AI fields, and notes to the worksheet",
    )
    parser.set_defaults(dry_run=True)
    return parser


def build_runtime_dependencies() -> RuntimeDependencies:
    """Load credentials and concrete smart-corrector components for the CLI."""
    import gspread
    from google.oauth2.service_account import Credentials
    from rosen_scraper import dispatcher
    from rosen_scraper.categorizer import summarize_and_classify

    try:
        from .diagnostics.smart_corrector import (
            AudioOptimizer,
            ContentDetector,
            QualityValidator,
        )
        from .diagnostics.smart_corrector.processors import (
            CSpanProcessor,
            SoundCloudProcessor,
            TwitterProcessor,
            YouTubeEnhancedProcessor,
        )
    except ImportError:  # pragma: no cover - supports direct script imports
        from diagnostics.smart_corrector import (
            AudioOptimizer,
            ContentDetector,
            QualityValidator,
        )
        from diagnostics.smart_corrector.processors import (
            CSpanProcessor,
            SoundCloudProcessor,
            TwitterProcessor,
            YouTubeEnhancedProcessor,
        )

    backend_dir = Path(__file__).resolve().parents[1]
    with (backend_dir / "schema.json").open(encoding="utf-8-sig") as schema_file:
        schema = json.load(schema_file)

    credential_setting = Path(
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
    )
    credentials_path = (
        credential_setting
        if credential_setting.is_absolute()
        else backend_dir / credential_setting
    )
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    credentials = Credentials.from_service_account_file(
        str(credentials_path), scopes=scopes
    )
    client = gspread.authorize(credentials)
    sheet_name = os.getenv("SPREADSHEET_NAME", "📎Rosen Archive URL List")
    worksheet = client.open(sheet_name).worksheet("test_runs")

    audio_optimizer = AudioOptimizer(speed_factor=2.0)
    detector = ContentDetector()
    validator = QualityValidator()

    def dispatch_default(url: str) -> Mapping[str, Any] | None:
        result = dispatcher.dispatch_url(url, schema)
        if result is None:
            return {"status": "failed", "error": "Processing returned no data"}
        if "status" not in result:
            return {"status": "success", **result}
        return result

    return RuntimeDependencies(
        worksheet=worksheet,
        categorizer=summarize_and_classify,
        processors={
            "soundcloud": SoundCloudProcessor(audio_optimizer=audio_optimizer).process,
            "cspan": CSpanProcessor().process,
            "youtube": YouTubeEnhancedProcessor().process,
            "twitter": TwitterProcessor(playwright_fallback=True).process,
            "default": dispatch_default,
        },
        detector=detector.detect,
        validator=validator.validate,
        schema=schema,
    )


def build_cost_tracker(max_cost: float) -> BudgetTracker:
    """Construct the legacy cost tracker without coupling it to the core."""
    try:
        from .diagnostics.smart_corrector import CostTracker
    except ImportError:  # pragma: no cover - supports direct script imports
        from diagnostics.smart_corrector import CostTracker

    return CostTracker(max_budget=max_cost)


def main(
    argv: list[str] | None = None,
    *,
    default_rows: str | None = None,
    default_limit: int | None = None,
    environment_loader: Callable[[Path], Any] | None = None,
    runtime_builder: Callable[[], RuntimeDependencies] | None = None,
) -> int:
    """Run the CLI with optional range defaults for legacy shims."""
    parser = build_parser(default_rows=default_rows, default_limit=default_limit)
    args = parser.parse_args(argv)
    rows_spec = _resolve_rows(args.rows, args.start_row)
    try:
        row_range = parse_row_range(rows_spec, limit=args.limit)
    except ValueError as exc:
        parser.error(str(exc))

    if environment_loader is None:
        from dotenv import load_dotenv

        environment_loader = load_dotenv

    backend_dir = Path(__file__).resolve().parents[1]
    environment_loader(backend_dir / ".env")
    runtime = (runtime_builder or build_runtime_dependencies)()
    cost_tracker = build_cost_tracker(args.max_cost)
    stats = run_corrector(
        row_range,
        worksheet=runtime.worksheet,
        categorizer=runtime.categorizer,
        processors=runtime.processors,
        detector=runtime.detector,
        validator=runtime.validator,
        schema=runtime.schema,
        dry_run=args.dry_run,
        write_ai_fields=True,
        resume=args.resume,
        cost_tracker=cost_tracker,
        selection_end_row=_requested_end_row(rows_spec),
        selection_limit=args.limit,
    )
    mode = "Dry run" if args.dry_run else "Live run"
    print(
        f"{mode}: processed {stats['processed']} rows, "
        f"skipped {stats['skipped']}, errors {stats['errors']}, "
        f"write errors {stats['write_errors']}, "
        f"missing content {stats['edge_cases']['missing_content']}, "
        f"needs transcription {stats['edge_cases']['needs_transcription']}, "
        f"AI fields written {stats['ai_fields_written']}, "
        f"estimated cost ${stats['estimated_cost']:.4f}."
    )
    if stats["budget_stopped"]:
        print(stats["budget_note"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
