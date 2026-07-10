# -*- coding: utf-8 -*-
"""Credential-free tests for the canonical smart-corrector driver."""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

from scripts.corrector import RuntimeDependencies, build_parser, main, run_corrector
from scripts.corrector_range import parse_row_range


HEADERS = [
    "url",
    "raw_text",
    "notes",
    "summary",
    "thematic_categories",
    "key_concepts",
    "tags",
    "pull_quote",
]


class FakeWorksheet:
    def __init__(self, records, *, fail_batch=False):
        self.records = records
        self.fail_batch = fail_batch
        self.batch_calls = []
        self.updates = []

    def row_values(self, row):
        assert row == 1
        return HEADERS

    def get_all_records(self):
        return self.records

    def update_cell(self, row, column, value):
        self.updates.append((row, column, value))

    def batch_update(self, updates):
        if self.fail_batch:
            raise RuntimeError("batch write failed")
        self.batch_calls.append(updates)
        for update in updates:
            match = re.fullmatch(r"([A-Z]+)([0-9]+)", update["range"])
            assert match is not None
            column = 0
            for letter in match.group(1):
                column = column * 26 + ord(letter) - ord("A") + 1
            self.updates.append((int(match.group(2)), column, update["values"][0][0]))


class FakeCostTracker:
    def __init__(self, max_budget, *, processor_cost=0.0):
        self.max_budget = max_budget
        self.processor_cost = processor_cost
        self.total_cost = 0.0
        self.operations = []

    def estimate_cost(self, content_type, duration=None, text_length=None):
        return self.processor_cost

    def can_afford(self, estimated_cost):
        return self.total_cost + estimated_cost <= self.max_budget

    def record_cost(self, cost_type, amount, operation="", details=None):
        self.total_cost += amount
        self.operations.append((cost_type, amount, operation))


class FakeCategorizer:
    def __init__(self, cost_per_call):
        self.cost_per_call = cost_per_call
        self.calls = []

    def __call__(self, text, schema):
        self.calls.append(text)
        return {"summary": f"Analyzed {text}"}


def valid_content(raw_text, url, content_type):
    return True, 1.0, []


def article_content(url):
    return "article"


def make_records(count):
    return [
        {
            "url": f"https://example.test/{index}",
            "raw_text": f"record-index-{index}",
            "notes": "",
        }
        for index in range(count)
    ]


def test_27_42_processes_indices_25_40_and_writes_sheet_rows_27_42():
    worksheet = FakeWorksheet(make_records(50))
    categorized_text = []

    def categorize(text, schema):
        categorized_text.append(text)
        return None

    stats = run_corrector(
        parse_row_range("27-42"),
        worksheet=worksheet,
        categorizer=categorize,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
    )

    assert categorized_text == [f"record-index-{index}" for index in range(25, 41)]
    assert [row for row, column, _ in worksheet.updates if column == 3] == list(
        range(27, 43)
    )
    assert stats["processed"] == 16


def test_live_run_writes_all_ai_fields_when_analysis_exists():
    worksheet = FakeWorksheet(make_records(1))

    def categorize(text, schema):
        assert text == "record-index-0"
        return {
            "summary": "A concise summary",
            "thematic_categories": ["Press criticism", "Public life"],
            "key_concepts": ["View from nowhere", "Public sphere"],
            "tags": ["journalism", "democracy"],
            "pull_quote": "The press has a public role.",
        }

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=categorize,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
    )

    assert (2, 4, "A concise summary") in worksheet.updates
    assert (2, 5, "Press criticism, Public life") in worksheet.updates
    assert (2, 6, "View from nowhere, Public sphere") in worksheet.updates
    assert (2, 7, "journalism, democracy") in worksheet.updates
    assert (2, 8, "The press has a public role.") in worksheet.updates
    assert stats["ai_fields_written"] == 5
    assert len(worksheet.batch_calls) == 1


def test_dry_run_is_the_default_and_never_writes():
    worksheet = FakeWorksheet(make_records(1))

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: {"summary": "Would be written live"},
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
    )

    assert worksheet.updates == []
    assert stats["processed"] == 1
    assert stats["ai_fields_written"] == 0


def test_write_ai_fields_can_be_disabled_explicitly():
    worksheet = FakeWorksheet(make_records(1))

    run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: {"summary": "Do not write this"},
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
        write_ai_fields=False,
    )

    assert not any(column == 4 for _, column, _ in worksheet.updates)
    assert any(column == 3 for _, column, _ in worksheet.updates)


def test_reprocessed_text_is_written_and_analyzed_with_injected_processor():
    worksheet = FakeWorksheet(make_records(1))
    worksheet.records[0]["url"] = "https://www.youtube.com/watch?v=test"
    processor_calls = []

    def process_youtube(url):
        processor_calls.append(url)
        return {
            "status": "success",
            "source": "youtube",
            "raw_text": "Fresh transcript",
        }

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: {"summary": f"Analyzed {text}"},
        processors={"youtube": process_youtube},
        detector=lambda url: "video",
        validator=lambda raw_text, url, content_type: (False, 0.2, ["too short"]),
        schema={},
        dry_run=False,
    )

    assert processor_calls == ["https://www.youtube.com/watch?v=test"]
    assert (2, 2, "Fresh transcript") in worksheet.updates
    assert (2, 4, "Analyzed Fresh transcript") in worksheet.updates
    assert stats["reprocessed"] == 1


def test_reprocessed_text_over_cell_limit_is_truncated_without_losing_batch():
    worksheet = FakeWorksheet(make_records(1))
    recovered_text = "x" * 49_001
    categorized_text = []

    def categorize(text, schema):
        categorized_text.append(text)
        return {"summary": "Recovered summary"}

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=categorize,
        processors={
            "default": lambda url: {
                "status": "success",
                "source": "article",
                "raw_text": recovered_text,
            }
        },
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.2, ["too long"]),
        schema={},
        dry_run=False,
    )

    assert len(worksheet.batch_calls) == 1
    updates_by_range = {
        update["range"]: update["values"][0][0] for update in worksheet.batch_calls[0]
    }
    written_text = updates_by_range["B2"]
    assert written_text == recovered_text[:49_000] + "... [TRUNCATED]"
    assert len(written_text) <= 50_000
    assert written_text.endswith("... [TRUNCATED]")
    assert categorized_text == [written_text]
    assert updates_by_range["D2"] == "Recovered summary"
    assert "Smart Corrector: Complete -" in updates_by_range["C2"]
    assert stats["edge_cases"]["cell_limit"] == 1


def test_reprocessed_text_at_truncation_boundary_is_unchanged():
    worksheet = FakeWorksheet(make_records(1))
    recovered_text = "x" * 49_000

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: None,
        processors={
            "default": lambda url: {
                "status": "success",
                "source": "article",
                "raw_text": recovered_text,
            }
        },
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.2, ["too long"]),
        schema={},
        dry_run=False,
    )

    raw_text_update = next(
        value for row, column, value in worksheet.updates if row == 2 and column == 2
    )
    assert raw_text_update == recovered_text
    assert stats["edge_cases"]["cell_limit"] == 0


def test_invalid_article_uses_injected_default_processor():
    worksheet = FakeWorksheet(make_records(1))
    processor_calls = []

    def process_article(url):
        processor_calls.append(url)
        return {
            "status": "success",
            "source": "article",
            "raw_text": "Recovered article",
        }

    run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: {"summary": "Recovered summary"},
        processors={"default": process_article},
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.1, ["too short"]),
        schema={},
        dry_run=False,
    )

    assert processor_calls == ["https://example.test/0"]
    assert (2, 2, "Recovered article") in worksheet.updates


def test_needs_transcription_writes_actionable_note_and_distinct_stat():
    records = make_records(1)
    records[0]["url"] = "https://soundcloud.com/example/audio"
    worksheet = FakeWorksheet(records)
    categorized_text = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized_text.append(text),
        processors={
            "soundcloud": lambda url: {
                "status": "needs_transcription",
                "source": "soundcloud_audio",
                "needs_transcription": True,
            }
        },
        detector=lambda url: "audio",
        validator=lambda raw_text, url, content_type: (False, 0.2, ["too short"]),
        schema={},
        dry_run=False,
    )

    note = next(
        value for row, column, value in worksheet.updates if row == 2 and column == 3
    )
    assert "[NEEDS_TRANSCRIPTION] Requires audio transcription" in note
    assert "Failed - Processor not available" not in note
    assert categorized_text == []
    assert not any(column == 2 for _, column, _ in worksheet.updates)
    assert stats["edge_cases"]["needs_transcription"] == 1
    assert stats["errors"] == 0
    assert stats["processed"] == 1
    assert stats["reprocessed"] == 0


def test_successful_processor_without_content_counts_missing_content():
    worksheet = FakeWorksheet(make_records(1))

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: pytest.fail("empty content was categorized"),
        processors={"default": lambda url: {"status": "success", "raw_text": ""}},
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.2, ["too short"]),
        schema={},
        dry_run=False,
    )

    note = next(
        value for row, column, value in worksheet.updates if row == 2 and column == 3
    )
    assert "Smart Corrector: Processing returned no content" in note
    assert stats["edge_cases"]["missing_content"] == 1
    assert stats["errors"] == 1
    assert stats["processed"] == 1


@pytest.mark.parametrize(
    "url, content_type, processor_name",
    [
        ("https://soundcloud.com/example/audio", "audio", "soundcloud"),
        ("https://www.youtube.com/watch?v=test", "video", "youtube"),
        ("https://www.c-span.org/program/test", "video", "cspan"),
        ("https://x.com/example/status/1", "social", "twitter"),
        ("https://bsky.app/profile/example/post/1", "social", "default"),
        ("https://vimeo.com/123", "video", "default"),
    ],
)
def test_invalid_source_routes_to_the_injected_processor(
    url, content_type, processor_name
):
    records = make_records(1)
    records[0]["url"] = url
    worksheet = FakeWorksheet(records)
    processor_calls = []

    def process_source(processed_url):
        processor_calls.append(processed_url)
        return {"status": "success", "source": processor_name, "raw_text": "text"}

    run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: {"summary": "summary"},
        processors={processor_name: process_source},
        detector=lambda processed_url: content_type,
        validator=lambda raw_text, processed_url, detected_type: (
            False,
            0.1,
            ["too short"],
        ),
        schema={},
    )

    assert processor_calls == [url]


def test_resume_retries_a_leading_failed_row():
    records = make_records(1)
    records[0]["notes"] = "[2026-01-01 12:00] Smart Corrector: Failed - timeout"
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == ["record-index-0"]
    assert stats["processed"] == 1
    assert stats["skipped"] == 0


def test_live_row_uses_one_batch_and_does_not_report_failed_batch_complete():
    worksheet = FakeWorksheet(make_records(1), fail_batch=True)

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: {"summary": "Staged summary"},
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
    )

    assert worksheet.updates == []
    assert stats["processed"] == 0
    assert stats["write_errors"] == 1
    assert stats["errors"] == 1
    assert stats["ai_fields_written"] == 0


def test_resume_skips_a_leading_completed_row():
    records = make_records(1)
    records[0][
        "notes"
    ] = "[2026-01-01 12:00] Smart Corrector: Complete - Used cached text"
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == []
    assert stats["processed"] == 0
    assert stats["skipped"] == 1


@pytest.mark.parametrize(
    "legacy_note",
    [
        "[2026-01-01 12:00] Smart Corrector: Used cached text (Q:0.91)",
        "[2026-01-01 12:00] Smart Corrector: Reprocessed via article | 1234 chars",
    ],
)
def test_resume_skips_a_leading_row_with_a_legacy_completion_note(legacy_note):
    records = make_records(1)
    records[0]["notes"] = legacy_note
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == []
    assert stats["processed"] == 0
    assert stats["skipped"] == 1


@pytest.mark.parametrize(
    "unfinished_note",
    [
        "[2026-01-01 12:00] Smart Corrector: Needs reprocessing",
        "[2026-01-01 12:00] Smart Corrector: Incomplete - Reprocessed via article | 10 chars",
    ],
)
def test_resume_retries_a_leading_row_that_still_needs_work(unfinished_note):
    records = make_records(1)
    records[0]["notes"] = unfinished_note
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == ["record-index-0"]
    assert stats["processed"] == 1
    assert stats["skipped"] == 0


def test_resume_retries_when_newest_note_needs_work_despite_stale_success():
    # A legacy driver may leave several notes accumulated in one cell. Resume
    # must honour the newest status: a stale "Used cached text" success note
    # followed by a current "Needs reprocessing" note must not skip the row.
    records = make_records(1)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Used cached text (Q:0.91) "
        "[2026-02-01 09:00] Smart Corrector: Needs reprocessing"
    )
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == ["record-index-0"]
    assert stats["processed"] == 1
    assert stats["skipped"] == 0


@pytest.mark.parametrize(
    "note_with_inline_failure",
    [
        "[2026-01-01 12:00] Smart Corrector: Used cached text (Q:0.86) | AI error: APIError: [429]",
        "[2026-01-01 12:00] Smart Corrector: Reprocessed via article | 900 chars | AI analysis unavailable",
        "[2026-01-01 12:00] Smart Corrector: Used cached text (Q:0.9) | Budget limit reached before AI analysis",
    ],
)
def test_resume_retries_a_legacy_success_prefix_paired_with_a_failure(
    note_with_inline_failure,
):
    # "Used cached text"/"Reprocessed via" describe text extraction, not AI
    # completion. A legacy note that opens with one but records an inline failure
    # is not safely complete, so --resume must retry it rather than skip a row
    # whose AI fields never landed.
    records = make_records(1)
    records[0]["notes"] = note_with_inline_failure
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == ["record-index-0"]
    assert stats["processed"] == 1
    assert stats["skipped"] == 0


def test_resume_retries_when_newest_note_omits_space_after_marker():
    # Anchoring must not depend on the space after "Smart Corrector:". A newest
    # status written without that space still wins over an earlier spaced success
    # note, so the row is retried rather than wrongly skipped.
    records = make_records(1)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Used cached text (Q:0.91) "
        "[2026-02-01 09:00] Smart Corrector:Needs reprocessing"
    )
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == ["record-index-0"]
    assert stats["processed"] == 1
    assert stats["skipped"] == 0


def test_resume_skips_when_newest_note_completes_after_a_stale_retry():
    # The mirror case: a stale "Needs reprocessing" note followed by a current
    # success note counts as done, so resume skips the row.
    records = make_records(1)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Needs reprocessing "
        "[2026-02-01 09:00] Smart Corrector: Complete - Updated: summary"
    )
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == []
    assert stats["processed"] == 0
    assert stats["skipped"] == 1


def test_cli_defaults_to_dry_run_and_supports_requested_flags():
    parser = build_parser()

    defaults = parser.parse_args([])
    assert defaults.dry_run is True
    assert defaults.rows is None
    assert defaults.limit is None
    assert defaults.resume is False
    assert defaults.max_cost == 35.0

    live = parser.parse_args(
        [
            "--rows",
            "27-42",
            "--limit",
            "10",
            "--resume",
            "--max-cost",
            "2.5",
            "--live",
        ]
    )
    assert live.rows == "27-42"
    assert live.limit == 10
    assert live.resume is True
    assert live.max_cost == 2.5
    assert live.dry_run is False

    explicit_dry_run = parser.parse_args(["--dry-run"])
    assert explicit_dry_run.dry_run is True


@pytest.mark.parametrize(
    "rows_spec, limit_args, expected_hint",
    [
        ("27-42", [], "--rows 35-42 --resume"),
        ("27-42", ["--limit", "10"], "--rows 35-42 --limit 2 --resume"),
        ("27-", ["--limit", "10"], "--rows 35- --limit 2 --resume"),
    ],
)
def test_cli_budget_hint_preserves_row_bounds_and_remaining_limit(
    monkeypatch, capsys, rows_spec, limit_args, expected_hint
):
    runtime = RuntimeDependencies(
        worksheet=FakeWorksheet(make_records(50)),
        categorizer=FakeCategorizer(cost_per_call=0.006),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
    )
    monkeypatch.setattr(
        "scripts.corrector.build_cost_tracker",
        lambda max_cost: FakeCostTracker(max_budget=max_cost),
    )

    exit_code = main(
        ["--rows", rows_spec, *limit_args, "--max-cost", "0.0481"],
        environment_loader=lambda dotenv_path: None,
        runtime_builder=lambda: runtime,
    )

    output = capsys.readouterr().out
    assert exit_code == 0
    assert expected_hint in output
    assert "--rows 35- --resume" not in output


def test_start_row_is_a_legacy_alias_and_conflicts_with_rows():
    parser = build_parser()

    parsed = parser.parse_args(["--start-row", "251"])
    assert parsed.start_row == 251

    with pytest.raises(SystemExit):
        parser.parse_args(["--rows", "27-42", "--start-row", "251"])


def test_start_row_drives_open_ended_selection(monkeypatch, capsys):
    runtime = RuntimeDependencies(
        worksheet=FakeWorksheet(make_records(50)),
        categorizer=FakeCategorizer(cost_per_call=0.006),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
    )
    monkeypatch.setattr(
        "scripts.corrector.build_cost_tracker",
        lambda max_cost: FakeCostTracker(max_budget=max_cost),
    )

    exit_code = main(
        ["--start-row", "27", "--limit", "10", "--max-cost", "0.0481"],
        environment_loader=lambda dotenv_path: None,
        runtime_builder=lambda: runtime,
    )

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "--rows 35- --limit 2 --resume" in output


def test_budget_stops_before_an_unaffordable_categorizer_call():
    worksheet = FakeWorksheet(make_records(3))
    categorizer = FakeCategorizer(cost_per_call=0.5)
    cost_tracker = FakeCostTracker(max_budget=1.0)

    stats = run_corrector(
        parse_row_range("2-4"),
        worksheet=worksheet,
        categorizer=categorizer,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
        cost_tracker=cost_tracker,
        categorizer_cost=categorizer.cost_per_call,
    )

    assert categorizer.calls == ["record-index-0", "record-index-1"]
    assert cost_tracker.total_cost == 1.0
    assert len(worksheet.batch_calls) == 2
    assert stats["processed"] == 2
    assert stats["cached"] == 2
    assert stats["budget_stopped"] is True
    assert stats["budget_stop_row"] == 4
    assert "--rows 4-4 --resume" in stats["budget_note"]
    assert "--max-cost" in stats["budget_note"]


@pytest.mark.parametrize("dry_run", [False, True], ids=["live", "dry-run"])
def test_budget_stop_after_recovery_persists_text_only_in_live_mode(dry_run):
    worksheet = FakeWorksheet(make_records(1))
    categorizer = FakeCategorizer(cost_per_call=0.5)
    cost_tracker = FakeCostTracker(max_budget=0.75, processor_cost=0.5)

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=categorizer,
        processors={
            "default": lambda url: {
                "status": "success",
                "source": "article",
                "raw_text": "Recovered article",
            }
        },
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.1, ["too short"]),
        schema={},
        dry_run=dry_run,
        cost_tracker=cost_tracker,
        categorizer_cost=categorizer.cost_per_call,
    )

    assert categorizer.calls == []
    assert stats["budget_stopped"] is True
    assert stats["budget_stop_row"] == 2
    if dry_run:
        assert worksheet.batch_calls == []
        assert worksheet.updates == []
    else:
        assert len(worksheet.batch_calls) == 1
        updates_by_range = {
            update["range"]: update["values"][0][0]
            for update in worksheet.batch_calls[0]
        }
        assert updates_by_range["B2"] == "Recovered article"
        assert "Smart Corrector: Incomplete - Reprocessed via article" in updates_by_range[
            "C2"
        ]
        assert "Budget limit reached before AI analysis" in updates_by_range["C2"]
        assert not any(cell in updates_by_range for cell in ("D2", "E2", "F2", "G2", "H2"))


def test_budget_stops_before_paid_default_processor_call():
    worksheet = FakeWorksheet(make_records(1))
    cost_tracker = FakeCostTracker(max_budget=0.5, processor_cost=0.75)

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: pytest.fail("categorizer was called"),
        processors={
            "default": lambda url: pytest.fail("unaffordable processor was called")
        },
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.1, ["too short"]),
        schema={},
        cost_tracker=cost_tracker,
    )

    assert cost_tracker.operations == []
    assert stats["processed"] == 0
    assert stats["budget_stopped"] is True
    assert stats["budget_stop_row"] == 2


def test_cli_loads_backend_dotenv_before_resolving_runtime_settings(monkeypatch):
    events = []
    runtime = RuntimeDependencies(
        worksheet=FakeWorksheet([]),
        categorizer=lambda text, schema: None,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
    )

    def load_environment(dotenv_path):
        events.append(("environment", dotenv_path))
        monkeypatch.setenv("CORRECTOR_TEST_SETTING", "loaded-from-backend-dotenv")

    def build_runtime():
        events.append(("runtime", os.environ["CORRECTOR_TEST_SETTING"]))
        return runtime

    exit_code = main(
        [],
        environment_loader=load_environment,
        runtime_builder=build_runtime,
    )

    backend_dir = Path(__file__).resolve().parents[1]
    assert events == [
        ("environment", backend_dir / ".env"),
        ("runtime", "loaded-from-backend-dotenv"),
    ]
    assert exit_code == 0


@pytest.mark.parametrize(
    "script_name, default_call",
    [
        ("run_smart_corrector.py", "main()"),
        ("run_smart_corrector_25.py", 'main(default_rows=":25")'),
        ("run_smart_corrector_27_42.py", 'main(default_rows="27-42")'),
        ("run_smart_corrector_200.py", 'main(default_rows=":200")'),
        (
            "run_smart_corrector_201_plus.py",
            'main(default_rows="201-", default_limit=50)',
        ),
    ],
)
def test_legacy_corrector_driver_is_a_credential_free_shim(script_name, default_call):
    script = Path(__file__).resolve().parents[1] / "scripts" / script_name
    source = script.read_text(encoding="utf-8")

    assert (
        "from scripts.corrector import main" in source
        or "from .corrector import main" in source
    )
    assert default_call in source
    assert "gspread" not in source
    assert "Credentials" not in source
