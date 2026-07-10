# -*- coding: utf-8 -*-
"""Credential-free tests for the canonical smart-corrector driver."""

from __future__ import annotations

import os
import re
from pathlib import Path

import pytest

from scripts.corrector import (
    SMART_CORRECTOR_MARKER,
    RuntimeDependencies,
    _note,
    _notes_indicate_completion,
    build_parser,
    main,
    run_corrector,
)
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
    # The row is not completed (no AI fields land), so it counts as a per-row
    # failure for the exit code while still recording its distinct edge-case
    # reason. The note wrote cleanly, so it also counts as processed.
    assert stats["edge_cases"]["needs_transcription"] == 1
    assert stats["errors"] == 1
    assert stats["processed"] == 1
    assert stats["reprocessed"] == 0


def test_partial_result_with_transcription_flag_counts_as_needs_transcription():
    # The YouTube processor (when youtube-transcript-api is absent) and SoundCloud
    # (without an audio optimizer) fall back to status="partial" with
    # needs_transcription=True. Routing on the flag, not an exact status string,
    # keeps that shape on the needs-transcription path instead of mislabeling it
    # "Failed - Processor not available" and leaving the distinct stat at zero.
    records = make_records(1)
    worksheet = FakeWorksheet(records)
    categorized_text = []

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized_text.append(text),
        processors={
            "default": lambda url: {
                "status": "partial",
                "source": "youtube_metadata",
                "raw_text": "video description",
                "needs_transcription": True,
            }
        },
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.2, ["too short"]),
        schema={},
        dry_run=False,
    )

    note = next(
        value for row, column, value in worksheet.updates if row == 2 and column == 3
    )
    assert "[NEEDS_TRANSCRIPTION]" in note
    assert "Failed - Processor not available" not in note
    # No AI fields written, and the categorizer is never reached for this row.
    assert categorized_text == []
    assert not any(column == 2 for _, column, _ in worksheet.updates)
    assert stats["edge_cases"]["needs_transcription"] == 1
    assert stats["errors"] == 1


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
    # A write failure is a save error, not a processing error: the AI field WAS
    # produced, so it counts under write_errors only and leaves errors at 0.
    assert stats["errors"] == 0
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
def test_resume_retries_a_legacy_success_note_without_a_complete_prefix(legacy_note):
    # "Used cached text"/"Reprocessed via" were written by the retired drivers,
    # which recorded text extraction WITHOUT writing AI fields. Only the
    # consolidated corrector writes a "Complete -" note, and it writes it in the
    # same batch as the AI fields, so "Complete -" is proof the fields landed. A
    # legacy note that never says "Complete -" is not that proof, so --resume must
    # retry the row instead of skipping it and leaving its AI fields empty forever.
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

    assert categorized == ["record-index-0"]
    assert stats["processed"] == 1
    assert stats["skipped"] == 0


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
    # Accumulated notes are newline-separated and the newest (last) one wins.
    # Anchoring must not depend on the space after "Smart Corrector:": a newest
    # status written without that space still parses and wins over an earlier spaced
    # success note, so the row is retried rather than wrongly skipped.
    records = make_records(1)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Used cached text (Q:0.91)\n"
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
    # The mirror case: a stale "Needs reprocessing" note followed by a newer success
    # note on the next line counts as done, so resume skips the row.
    records = make_records(1)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Needs reprocessing\n"
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


def test_resume_skips_completed_rows_individually_not_just_the_leading_run():
    # A leading-offset scan counts completed rows from the top and stops at the
    # first incomplete row, so any completed row AFTER a failed one gets
    # reprocessed and re-paid for. Resume must decide per row: in
    # [complete, incomplete, complete] only the middle row is reprocessed and the
    # trailing completed row is still skipped.
    records = make_records(3)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Complete - Updated: summary"
    )
    records[1]["notes"] = "[2026-01-01 12:00] Smart Corrector: Needs reprocessing"
    records[2]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Complete - Updated: summary"
    )
    worksheet = FakeWorksheet(records)
    categorized = []

    stats = run_corrector(
        parse_row_range("2-4"),
        worksheet=worksheet,
        categorizer=lambda text, schema: categorized.append(text),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        resume=True,
    )

    assert categorized == ["record-index-1"]
    assert stats["skipped"] == 2
    assert stats["processed"] == 1


def test_live_write_failure_does_not_abandon_later_rows():
    # A write can fail for one row without the whole sheet being unwritable.
    # Aborting on the first failure would abandon the good rows still ahead, and
    # because an abandoned row keeps its old notes, a later --resume would
    # reprocess and re-pay for it. So the run keeps going, counts every failed
    # save under write_errors, and lets main() exit non-zero on write_errors > 0.
    worksheet = FakeWorksheet(make_records(3), fail_batch=True)
    categorized = []

    def categorize(text, schema):
        categorized.append(text)
        return {"summary": f"Analyzed {text}"}

    stats = run_corrector(
        parse_row_range("2-4"),
        worksheet=worksheet,
        categorizer=categorize,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
    )

    assert categorized == ["record-index-0", "record-index-1", "record-index-2"]
    assert stats["write_errors"] == 3
    assert stats["processed"] == 0
    # A save error is not a processing error, so errors stays 0 even though every
    # write failed; write_errors is what drives the non-zero exit here.
    assert stats["errors"] == 0


def test_live_none_analysis_flags_ai_unavailable_and_counts_as_error():
    # A live run that was asked to write AI fields but got nothing back (the
    # categorizer raised) saved no requested output. That is a failure, not a
    # clean processed row: it bumps errors and ai_unavailable so the CLI can exit
    # non-zero, while still persisting the note so a later --resume retries it.
    worksheet = FakeWorksheet(make_records(1))

    def failing_categorizer(text, schema):
        raise RuntimeError("model unavailable")

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=failing_categorizer,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
    )

    assert stats["ai_unavailable"] == 1
    assert stats["errors"] == 1
    assert stats["processed"] == 1


@pytest.mark.parametrize(
    "empty_analysis",
    [{"error": "rate limited"}, {"summary": ""}, {}, {"tags": [""]}],
    ids=[
        "error-payload",
        "empty-field-value",
        "empty-mapping",
        "list-normalizes-empty",
    ],
)
def test_live_truthy_analysis_without_writable_fields_is_unavailable(empty_analysis):
    # A live categorizer can return a truthy mapping that yields no writable AI
    # field: an {"error": ...} payload, an all-empty value, {}, or a list like
    # {"tags": [""]} that normalizes to "" once blank items are dropped. Nothing
    # landed, so "Complete -" must NOT be written (a later --resume would skip the
    # row forever) and the run must count it as an AI-unavailable failure so the
    # CLI exits non-zero.
    worksheet = FakeWorksheet(make_records(1))

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: empty_analysis,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
    )

    assert stats["ai_unavailable"] == 1
    assert stats["errors"] == 1
    notes = [value for _row, column, value in worksheet.updates if column == 3]
    assert notes and "Complete -" not in notes[-1]
    assert "AI analysis unavailable" in notes[-1]


def test_disabled_ai_fields_mode_records_text_updated_not_complete():
    # The write_ai_fields=False text-only mode does its text work but writes no AI
    # fields by design. It must NOT stamp "Complete -": that marker is proof the AI
    # fields landed, so a later AI-mode --resume would skip this row and leave its
    # AI fields empty forever. It records "Text updated -" instead, which is not a
    # failure (errors/ai_unavailable stay 0) but also not AI-complete.
    worksheet = FakeWorksheet(make_records(1))

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=lambda text, schema: {"summary": "Would be written live"},
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
        dry_run=False,
        write_ai_fields=False,
    )

    assert stats["ai_unavailable"] == 0
    assert stats["errors"] == 0
    notes = [value for _row, column, value in worksheet.updates if column == 3]
    assert notes and "Text updated" in notes[-1]
    assert "Complete -" not in notes[-1]


def test_dry_run_none_analysis_is_not_counted_as_a_failure():
    # The ai_unavailable failure signal is live-only: a dry run writes nothing, so
    # a None analysis there is expected and must not bump errors/ai_unavailable.
    worksheet = FakeWorksheet(make_records(1))

    def failing_categorizer(text, schema):
        raise RuntimeError("model unavailable")

    stats = run_corrector(
        parse_row_range("2-2"),
        worksheet=worksheet,
        categorizer=failing_categorizer,
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
    )

    assert stats["ai_unavailable"] == 0
    assert stats["errors"] == 0


def test_resume_retries_a_complete_prefix_that_records_an_inline_failure():
    # A "Complete -" prefix is necessary but not sufficient. A note that claims
    # completion yet also records a failure (e.g. an "AI error" tail) is not
    # safely complete, so --resume must retry it rather than skip a row whose AI
    # fields never landed.
    records = make_records(1)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Complete - Used cached text (Q:0.9) "
        "| AI error: APIError: [429]"
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
    assert stats["skipped"] == 0


def test_resume_retries_when_the_marker_is_embedded_in_error_text():
    # The status is read from the last TIMESTAMPED note boundary, not a bare
    # search for the marker. An error string that quotes "Smart Corrector:
    # Complete -" inside a Failed note must not be mistaken for a completion.
    records = make_records(1)
    records[0]["notes"] = (
        "[2026-01-01 12:00] Smart Corrector: Failed - AI error: "
        "unexpected 'Smart Corrector: Complete - Updated: summary' in payload"
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
    assert stats["skipped"] == 0


def test_note_neutralizes_a_forged_completion_boundary_in_its_body():
    # The boundary regex rejects a bare marker, but an error string can echo a
    # FULLY-FORMED timestamped boundary ("[2026-01-01 12:00] Smart Corrector:
    # Complete - ..."). If _note wrote that verbatim into a Failed note, a later
    # status scan would find the forged boundary as the LAST boundary and read the
    # failed row as complete -> --resume skips it forever. _note strips the marker
    # out of the body so its own timestamped prefix is the only real boundary.
    forged = "Failed - [2026-01-01 12:00] Smart Corrector: Complete - Updated: summary"
    note = _note(forged)

    # The written note carries exactly one real marker: _note's own prefix.
    assert note.count(SMART_CORRECTOR_MARKER) == 1
    # And it reads as NOT complete, because its status is "Failed - ...", not the
    # forged "Complete -" that the embedded text tried to smuggle in.
    assert _notes_indicate_completion(note) is False


def test_note_strip_does_not_reconstruct_the_marker_from_a_double_colon():
    # A plain str.replace of the marker RECONSTRUCTS it: "Smart Corrector::" ->
    # "Smart Corrector:". If that echo sits at a line start in an error body, the
    # reconstructed boundary would be read as the last note and mask the failed row
    # as complete. Stripping the whole colon run leaves no marker in the body, so
    # _note's own prefix stays the only boundary and the row reads as failed.
    forged = (
        "Failed - see\n"
        "[2026-01-01 12:00] Smart Corrector:: Complete - Updated: summary"
    )
    note = _note(forged)

    assert note.count(SMART_CORRECTOR_MARKER) == 1
    assert _notes_indicate_completion(note) is False


def test_notes_indicate_completion_ignores_a_boundary_embedded_in_persisted_text():
    # _note only sanitizes notes THIS run writes; notes already in the sheet (a
    # legacy driver's Failed note, or a manual edit) are read raw. If such a note
    # embeds a fully-formed boundary mid-body, the anchored regex does not treat it
    # as a note start, so the cell has no completion boundary and --resume
    # reprocesses the row instead of skipping it. Without the anchor, the embedded
    # boundary would be read as the last note and its "Complete -" status would mask
    # the failed row as complete.
    poisoned = (
        "Failed - API returned "
        "[2026-01-01 12:00] Smart Corrector: Complete - Updated: summary"
    )
    assert _notes_indicate_completion(poisoned) is False


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
        ("27-42", [], "--rows 35-42 and a higher --max-cost."),
        ("27-42", ["--limit", "10"], "--rows 35-42 --limit 2 and a higher --max-cost."),
        ("27-", ["--limit", "10"], "--rows 35- --limit 2 and a higher --max-cost."),
    ],
)
def test_cli_budget_hint_preserves_bounds_and_omits_resume_for_a_full_refresh(
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
    # A run without --resume is a full refresh. The budget stop happens BEFORE the
    # stop row is processed, so no new note is written and any old "Complete -"
    # marker stays in place. If the continuation hint added --resume, the rerun
    # would skip that very row (and downstream complete rows) instead of refreshing
    # them, so the hint for a full refresh must not add --resume.
    assert "--resume" not in output


def test_cli_budget_hint_keeps_resume_for_a_resume_run(monkeypatch, capsys):
    # A --resume run is continuing an interrupted pass, so its continuation hint
    # must keep --resume to go on skipping already-complete rows.
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
        ["--rows", "27-42", "--resume", "--max-cost", "0.0481"],
        environment_loader=lambda dotenv_path: None,
        runtime_builder=lambda: runtime,
    )

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "--rows 35-42 --resume and a higher --max-cost." in output


def test_start_row_is_a_legacy_alias_and_conflicts_with_rows():
    parser = build_parser()

    # --start-row keeps the raw token (no argparse type=int) so the shared range
    # parser can apply the same validation it applies to --rows N-.
    parsed = parser.parse_args(["--start-row", "251"])
    assert parsed.start_row == "251"

    with pytest.raises(SystemExit):
        parser.parse_args(["--rows", "27-42", "--start-row", "251"])


@pytest.mark.parametrize("bad_token", ["1_0", "01", "+5"])
def test_start_row_rejects_malformed_tokens_through_the_range_parser(bad_token):
    # Because --start-row carries the raw token, the shared range parser rejects
    # the same malformed forms it rejects for --rows N-. argparse type=int would
    # have silently read "1_0" as 10 and started at the wrong row.
    runtime = RuntimeDependencies(
        worksheet=FakeWorksheet(make_records(1)),
        categorizer=FakeCategorizer(cost_per_call=0.0),
        processors={},
        detector=article_content,
        validator=valid_content,
        schema={},
    )

    with pytest.raises(SystemExit):
        main(
            ["--start-row", bad_token, "--live"],
            environment_loader=lambda dotenv_path: None,
            runtime_builder=lambda: runtime,
        )


@pytest.mark.parametrize("bad_value", ["inf", "-inf", "nan", "0", "0.0", "-5", "-0.01"])
def test_max_cost_rejects_non_positive_or_non_finite_values(bad_value):
    # The budget cap is only meaningful as a positive, finite number. type=float
    # would have accepted inf (disabling the advertised hard stop) and nan/zero/
    # negative (a stop before the first row that exits 0 as a clean budget stop
    # despite doing no work). Reject them at the boundary so the bad state can
    # never reach the cost tracker.
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["--max-cost", bad_value])


@pytest.mark.parametrize("good_value", ["0.0481", "35", "35.0", "1000"])
def test_max_cost_accepts_positive_finite_values(good_value):
    parser = build_parser()
    parsed = parser.parse_args(["--max-cost", good_value])
    assert parsed.max_cost == float(good_value)


def test_live_run_exits_nonzero_when_ai_is_unavailable(monkeypatch, capsys):
    # The CLI must not mask a live run that saved no AI output as success. A
    # categorizer that fails leaves ai_unavailable set, and main() returns 1.
    def failing_categorizer(text, schema):
        raise RuntimeError("model unavailable")

    runtime = RuntimeDependencies(
        worksheet=FakeWorksheet(make_records(1)),
        categorizer=failing_categorizer,
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
        ["--rows", "2-2", "--live"],
        environment_loader=lambda dotenv_path: None,
        runtime_builder=lambda: runtime,
    )

    output = capsys.readouterr().out
    assert exit_code == 1
    assert "AI unavailable 1" in output


def test_live_run_exits_nonzero_on_a_processing_failure(monkeypatch, capsys):
    # A per-row processing failure ("Failed - ..." note) increments errors but not
    # write_errors or ai_unavailable, and its note still writes cleanly, so the row
    # counts as processed. The exit code must key off errors (not just write_errors
    # or ai_unavailable), or a run that failed to process a row masks as success.
    runtime = RuntimeDependencies(
        worksheet=FakeWorksheet(make_records(1)),
        categorizer=lambda text, schema: {"summary": "unused"},
        processors={"default": lambda url: {"status": "failed", "error": "boom"}},
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.1, ["too short"]),
        schema={},
    )
    monkeypatch.setattr(
        "scripts.corrector.build_cost_tracker",
        lambda max_cost: FakeCostTracker(max_budget=max_cost),
    )

    exit_code = main(
        ["--rows", "2-2", "--live"],
        environment_loader=lambda dotenv_path: None,
        runtime_builder=lambda: runtime,
    )

    output = capsys.readouterr().out
    assert exit_code == 1
    assert "errors 1" in output
    assert "write errors 0" in output


def test_live_run_exits_nonzero_on_needs_transcription(monkeypatch, capsys):
    # A needs-transcription row lands no AI fields, so a live run made up only of
    # such rows has not finished its work. It must exit non-zero (like the
    # processing-failure and ai-unavailable paths), or automation keying off the
    # exit code treats an incomplete run as a success.
    runtime = RuntimeDependencies(
        worksheet=FakeWorksheet(make_records(1)),
        categorizer=lambda text, schema: {"summary": "unused"},
        processors={
            "default": lambda url: {
                "status": "needs_transcription",
                "error": "audio requires a transcript",
            }
        },
        detector=article_content,
        validator=lambda raw_text, url, content_type: (False, 0.1, ["too short"]),
        schema={},
    )
    monkeypatch.setattr(
        "scripts.corrector.build_cost_tracker",
        lambda max_cost: FakeCostTracker(max_budget=max_cost),
    )

    exit_code = main(
        ["--rows", "2-2", "--live"],
        environment_loader=lambda dotenv_path: None,
        runtime_builder=lambda: runtime,
    )

    output = capsys.readouterr().out
    assert exit_code == 1
    assert "errors 1" in output
    assert "needs transcription 1" in output


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
    # --start-row is a full-refresh (no --resume), so its continuation hint omits it.
    assert "--rows 35- --limit 2 and a higher --max-cost." in output


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
    # run_corrector defaults resume=False (a full refresh), so the continuation
    # hint omits --resume; adding it would skip the stop row on the rerun.
    assert "--rows 4-4 and a higher --max-cost." in stats["budget_note"]
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
