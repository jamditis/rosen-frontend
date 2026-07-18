# -*- coding: utf-8 -*-
"""Canonical, range-safe driver for the Rosen Archive smart corrector.

The processing core has no credential or network setup. Callers inject the
worksheet, categorizer, content detector, validator, and source processors so
row selection and sheet writes can be tested without Google credentials.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlparse

from rosen_scraper.url_safety import pinned_resolution, resolve_and_validate

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
_MARKER_STEM = SMART_CORRECTOR_MARKER.rstrip(":")  # marker text without its colon
# Strip an echoed marker from a note body by matching the stem plus its WHOLE run of
# trailing colons. A plain str.replace of "Smart Corrector:" reconstructs the marker
# ("Smart Corrector::" -> "Smart Corrector:"), which at a line start forges a note
# boundary; matching ":+" removes every colon so no marker can survive in the body.
_MARKER_ECHO_RE = re.compile(re.escape(_MARKER_STEM) + r":+")
# Only the consolidated corrector writes a "Complete -" status, and it writes that
# note in the SAME batch_update as the AI-field values (see run_corrector), so a
# "Complete -" note is proof the AI fields landed. The retired drivers wrote
# "Used cached text ..." / "Reprocessed via ..." notes with no "Complete -" prefix
# and did not write AI fields; treating those as complete would skip a row on
# --resume and leave its AI fields permanently empty. So completion requires the
# "Complete -" prefix and nothing else.
COMPLETION_STATUS_PREFIX = "Complete -"
# Anchor the status to an actual note boundary at the start of the cell or a line.
# Every writer (this corrector and the retired drivers) overwrites the cell with a
# single note that opens at position 0, so a genuine "[YYYY-MM-DD HH:MM] Smart
# Corrector:" boundary only ever appears at a line start. Matching the marker
# anywhere would let an embedded copy inside a note body (a legacy Failed note or a
# manual edit whose text echoes a full boundary) be read as the last note and mask
# a failed row as complete. _note() sanitizes notes THIS run writes, but persisted
# cells are read raw, so the anchor is what protects against already-poisoned data.
_NOTE_STATUS_BOUNDARY = re.compile(
    r"^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\] " + re.escape(SMART_CORRECTOR_MARKER) + r"\s*",
    re.MULTILINE,
)
# A "Complete -" prefix is necessary but not sufficient: a legacy note could pair
# it with an inline failure (e.g. "Complete - ... | AI error: ...") on a row whose
# AI analysis never landed. Any of these markers in the status means the row is not
# safely complete, so --resume must retry it rather than skip it.
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
    stats = {
        "selected": len(selected),
        "processed": 0,
        "skipped": 0,
        "cached": 0,
        "reprocessed": 0,
        "errors": 0,
        "write_errors": 0,
        "ai_unavailable": 0,
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

    for local_index in range(len(selected)):
        record = selected[local_index]
        # Skip each already-completed row individually. A leading-offset scan that
        # stopped at the first incomplete row would reprocess (and re-pay for)
        # completed rows that follow a failed one, e.g. [Failed, Complete, Complete].
        if resume and _notes_indicate_completion(str(record.get("notes", ""))):
            stats["skipped"] += 1
            continue
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
                    resume=resume,
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
            if result and (
                result.get("needs_transcription")
                or result.get("status") == "needs_transcription"
            ):
                # Route on the needs_transcription FLAG as well as the status string:
                # processors signal this as status="needs_transcription" AND as
                # status="partial" with the flag set (e.g. the YouTube processor when
                # youtube-transcript-api is absent, or SoundCloud without an audio
                # optimizer). Matching either avoids missing the partial shape without
                # regressing the status-string case. This row cannot be completed
                # here: it writes an actionable note but lands no AI fields, so it
                # counts as a per-row failure for the exit code (main() keys off
                # errors) while its distinct edge-case stat records the specific
                # reason. Same shape as missing_content.
                reason = str(result.get("error") or "Requires audio transcription")
                note = _note(f"[NEEDS_TRANSCRIPTION] {reason[:50]}")
                stats["errors"] += 1
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
                resume=resume,
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

        # "Complete -" is proof the AI fields landed: it is written in the SAME
        # batch as those field values, so completion is defined by whether any
        # field actually landed, not by whether the categorizer returned something.
        if written_fields:
            result_message += f" | Updated: {', '.join(written_fields)}"
            note = _note(f"Complete - {result_message}")
        elif not write_ai_fields:
            # Text-only mode writes no AI fields by design. The row's text work is
            # done but it is NOT AI-complete, so it must not claim "Complete -" or a
            # later AI-mode --resume would skip a row whose AI fields never landed.
            note = _note(f"Text updated - {result_message}")
        else:
            # An AI-field run that saved no field (missing/None analysis, an empty
            # payload like {"error": ...}, or values that normalized to blank) did
            # not do its job, so mark it incomplete for --resume and count it so the
            # CLI exits non-zero.
            note = _note(f"Incomplete - {result_message} | AI analysis unavailable")
            if not dry_run:
                stats["errors"] += 1
                stats["ai_unavailable"] += 1

        row_updates.append((columns["notes"], note))
        if _write_row(worksheet, row_number, row_updates, dry_run=dry_run):
            stats["processed"] += 1
            if not dry_run:
                stats["ai_fields_written"] += len(written_fields)
        else:
            # A write can fail for this one row (a transient API error, a cell-level
            # rejection) without the whole sheet being unwritable. Aborting here would
            # abandon the good rows still ahead AND, because the abandoned rows keep
            # their old notes, a later --resume would reprocess and re-pay for them.
            # So record the failure and keep going; main() exits non-zero when
            # write_errors > 0 so the operator still sees that a row did not save.
            stats["write_errors"] += 1

    return stats


def _authorize_cost(
    cost_tracker: BudgetTracker,
    estimated_cost: float,
    *,
    row_number: int,
    selection_end_row: int | None,
    remaining_limit: int | None,
    resume: bool,
    stats: dict[str, Any],
) -> bool:
    if cost_tracker.can_afford(estimated_cost):
        return True

    stats["budget_stopped"] = True
    stats["budget_stop_row"] = row_number
    end_row = selection_end_row or ""
    limit_arg = f" --limit {remaining_limit}" if remaining_limit is not None else ""
    # Preserve the original run's resume mode. The budget stop happens before the
    # stop row is processed, so no new note lands and any old "Complete -" marker
    # stays. Adding --resume to a full-refresh continuation would then skip that
    # row instead of refreshing it; a resume run must keep --resume to go on
    # skipping already-complete rows.
    resume_arg = " --resume" if resume else ""
    stats["budget_note"] = (
        f"Budget limit reached before sheet row {row_number} "
        f"(next estimated call: ${estimated_cost:.4f}). Review recorded spend, "
        f"then rerun with --rows {row_number}-{end_row}{limit_arg}{resume_arg} "
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
    safe, reason, validated_ips = resolve_and_validate(url)
    if not safe:
        return {"status": "failed", "error": f"Unsafe URL: {reason}"}

    processor_name = _processor_name(content_type, url)
    processor = processors.get(processor_name) or processors.get("default")
    if processor is None:
        return None
    try:
        host = urlparse(url).hostname
        # Only provider-owned hosts selected by _processor_name reach the legacy
        # specialized processors. Arbitrary public hosts use the default scraper,
        # whose requests and Chromium paths validate every redirect/subrequest.
        # Pin the provider's initial connection here to close the remaining DNS
        # check-to-use window without weakening that stricter default path.
        with pinned_resolution(host, validated_ips):
            return processor(url)
    except Exception as exc:
        return {"status": "failed", "error": str(exc)}


def _processor_name(content_type: str, url: str) -> str:
    try:
        host = (urlparse(url).hostname or "").lower().rstrip(".")
    except ValueError:
        return "default"

    def is_host(*domains: str) -> bool:
        return any(host == domain or host.endswith(f".{domain}") for domain in domains)

    if content_type == "audio" and is_host("soundcloud.com"):
        return "soundcloud"
    if content_type == "video":
        if is_host("youtube.com", "youtu.be"):
            return "youtube"
        if is_host("c-span.org"):
            return "cspan"
    if content_type == "social" and is_host("twitter.com", "x.com"):
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
        if isinstance(value, list):
            # Drop empty/whitespace items so a list like [""] normalizes to "" and
            # is treated as no value, not a written-but-blank cell.
            value = ", ".join(str(item) for item in value if str(item).strip())
        # Gate on the FINAL cell value: an empty string, whitespace, or a list that
        # normalized to "" must not be counted as a written field, or a later
        # --resume would treat the blank cell as complete.
        if value is None or not str(value).strip():
            continue
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
    # Neutralize any smart-corrector marker inside the free-text body (e.g. a
    # processor error that echoes a prior note) so a later status scan cannot
    # mistake it for a real timestamped note boundary and read a failed row as
    # complete. Stripping the marker stem plus its trailing colon run (not a plain
    # str.replace, which would reconstruct the marker) leaves the timestamped prefix
    # this function writes as the only real marker.
    body = _MARKER_ECHO_RE.sub(_MARKER_STEM, message)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f"[{timestamp}] {SMART_CORRECTOR_MARKER} {body}"


def _notes_indicate_completion(notes: str) -> bool:
    """True when the row's most recent smart-corrector note marks it complete.

    A run overwrites the notes cell with a single note, but legacy cells may hold
    several accumulated notes. Take the status of the LAST timestamped note so a
    stale success note earlier in the cell cannot mask a current
    "Needs reprocessing"/"Incomplete" status, and so error text that merely
    contains the marker cannot be read as a status.
    """
    matches = list(_NOTE_STATUS_BOUNDARY.finditer(notes))
    if not matches:
        return False
    status = notes[matches[-1].end() :]
    if not status.startswith(COMPLETION_STATUS_PREFIX):
        return False
    return not any(marker in status for marker in INCOMPLETE_STATUS_MARKERS)


def _requested_end_row(rows: str | None) -> int | None:
    spec = (rows or "").strip()
    if spec.startswith(":"):
        return int(spec[1:]) + 1
    _start, separator, end = spec.partition("-")
    return int(end) if separator and end else None


def _resolve_rows(rows: str | None, start_row: str | None) -> str | None:
    """Map the legacy --start-row alias onto the canonical open-ended rows spec.

    ``start_row`` is the raw token, not a parsed int, so that ``parse_row_range``
    applies the same canonical validation it applies to ``--rows N-`` and rejects
    malformed tokens (underscores, signs, leading zeros) instead of argparse
    silently normalizing e.g. ``1_0`` to ``10``.
    """
    if start_row is not None:
        return f"{start_row}-"
    return rows


def _positive_finite_cost(raw: str) -> float:
    # --max-cost is a hard budget cap, so only a positive finite number is
    # meaningful. inf would silently disable the advertised stop; nan, zero, or a
    # negative value would stop before the first row yet exit 0 as a clean budget
    # stop despite doing no work. Reject them here so the bad value can never reach
    # the cost tracker.
    try:
        value = float(raw)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid float value: {raw!r}") from exc
    if not math.isfinite(value) or value <= 0:
        raise argparse.ArgumentTypeError(
            f"--max-cost must be a positive finite number (got {raw!r})"
        )
    return value


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
        metavar="N",
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
        type=_positive_finite_cost,
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
        f"AI unavailable {stats['ai_unavailable']}, "
        f"estimated cost ${stats['estimated_cost']:.4f}."
    )
    if stats["budget_stopped"]:
        print(stats["budget_note"])
    # A live run that hit a per-row processing failure (a "Failed" note, missing
    # content, or unavailable AI analysis -> stats["errors"]) or that could not save
    # a row (stats["write_errors"]) did not fully do its job, so exit non-zero
    # instead of masking it as success. ai_unavailable is a subset of errors, so
    # checking errors covers it. A clean budget stop is not a failure and does not
    # increment either counter, so it still exits zero.
    if not args.dry_run and (stats["errors"] or stats["write_errors"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
