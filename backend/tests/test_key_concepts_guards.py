# -*- coding: utf-8 -*-
"""Tests for the key_concepts_updater dry-run + write-counter guards.

Two safety behaviors v1 adds:
  * --dry-run logs the cells it would write but calls no worksheet.update.
  * a live run that spends Gemini calls but writes zero cells fails (exit 1) --
    the "$0.53 wasted, AI ran but nothing saved" guard.
"""
from __future__ import annotations

import sys

import pytest

from rosen_scraper import key_concepts_updater as kc

# 37 columns covers raw_text (AH=33) and key_concepts (Q=16). A row with long
# raw_text and an empty key_concepts cell is the "needs analysis + fill" case.
_NCOLS = 37


class _FakeWorksheet:
    def __init__(self, values, fail_writes=False):
        self._values = values
        self._fail_writes = fail_writes
        self.updates = []

    def get_all_values(self):
        return self._values

    def update(self, values=None, range_name=None):
        if self._fail_writes:
            raise RuntimeError("sheet write failed")
        self.updates.append((range_name, values))


class _FakeSpreadsheet:
    def __init__(self, worksheet):
        self._ws = worksheet
        self.requested_tabs = []

    def worksheet(self, name):
        self.requested_tabs.append(name)
        return self._ws


@pytest.fixture(autouse=True)
def _no_io(monkeypatch):
    # Never read/write the progress file or sleep for rate limiting in tests.
    monkeypatch.setattr(kc, "load_progress", lambda: {
        "last_processed_row": 1, "total_processed": 0,
        "total_updated": 0, "last_run": None})
    monkeypatch.setattr(kc, "save_progress", lambda progress: None)
    monkeypatch.setattr(kc.time, "sleep", lambda seconds: None)


def _row_needing_fill():
    row = [""] * _NCOLS
    row[33] = "x" * 200       # raw_text: long enough to analyze
    row[16] = ""              # key_concepts: empty -> fill path
    return row


def _archive_header():
    header = [f"column_{index}" for index in range(_NCOLS)]
    header[16] = "key_concepts"
    header[33] = "raw_text"
    header[35] = "notes"
    header[36] = "colQ_changes"
    return header


def _worksheet_with_one_fillable_row():
    return _FakeWorksheet([_archive_header(), _row_needing_fill()])


def test_process_rows_defaults_to_current_archive_records_tab(monkeypatch):
    """The live workbook no longer has a ``test_runs`` tab."""
    monkeypatch.delenv("ROSEN_MASTER_SHEET_TAB", raising=False)
    spreadsheet = _FakeSpreadsheet(_FakeWorksheet([["h"] * _NCOLS]))

    kc.process_rows(
        spreadsheet, model=object(),
        schema={"taxonomy": {"key_concepts": []}},
        start_row=2, limit=1, resume=False, dry_run=True)

    assert spreadsheet.requested_tabs == ["archive_records"]


def test_process_rows_treats_empty_workflow_tab_variable_as_unset(monkeypatch):
    monkeypatch.setenv("ROSEN_MASTER_SHEET_TAB", "")
    spreadsheet = _FakeSpreadsheet(_FakeWorksheet([["h"] * _NCOLS]))

    kc.process_rows(
        spreadsheet, model=object(),
        schema={"taxonomy": {"key_concepts": []}},
        start_row=2, limit=1, resume=False, dry_run=True)

    assert spreadsheet.requested_tabs == ["archive_records"]


def test_process_rows_accepts_configured_master_tab(monkeypatch):
    monkeypatch.setenv("ROSEN_MASTER_SHEET_TAB", "staging_records")
    spreadsheet = _FakeSpreadsheet(_FakeWorksheet([["h"] * _NCOLS]))

    kc.process_rows(
        spreadsheet, model=object(),
        schema={"taxonomy": {"key_concepts": []}},
        start_row=2, limit=1, resume=False, dry_run=True)

    assert spreadsheet.requested_tabs == ["staging_records"]


def test_dry_run_counts_but_writes_nothing(monkeypatch):
    monkeypatch.setattr(kc, "analyze_key_concepts",
                        lambda model, rt, kcl, cur="": {
                            "concepts": ["Mindcasting"], "recommendations": ""})
    ws = _worksheet_with_one_fillable_row()
    summary = kc.process_rows(
        _FakeSpreadsheet(ws), model=object(),
        schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
        start_row=2, limit=1, resume=False, dry_run=True)

    assert summary["dry_run"] is True
    assert summary["gemini_calls"] == 1
    assert summary["writes"] >= 1          # it counted the cell it would write
    assert ws.updates == []                # but never wrote


def test_live_run_writes_the_cell(monkeypatch):
    monkeypatch.setattr(kc, "analyze_key_concepts",
                        lambda model, rt, kcl, cur="": {
                            "concepts": ["Mindcasting"], "recommendations": ""})
    ws = _worksheet_with_one_fillable_row()
    summary = kc.process_rows(
        _FakeSpreadsheet(ws), model=object(),
        schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
        start_row=2, limit=1, resume=False, dry_run=False)

    assert summary["dry_run"] is False
    assert summary["writes"] >= 1
    written_ranges = [r for r, _ in ws.updates]
    assert any(r.startswith("Q") for r in written_ranges)  # filled key_concepts


def test_failed_writes_abort_without_advancing_progress(monkeypatch):
    # Gemini runs, but a failed Sheets write must abort before the progress
    # cursor can skip the unsaved row on a later run.
    monkeypatch.setattr(kc, "analyze_key_concepts",
                        lambda model, rt, kcl, cur="": {
                            "concepts": ["Mindcasting"], "recommendations": ""})
    saved_progress = []
    monkeypatch.setattr(kc, "save_progress", saved_progress.append)
    ws = _FakeWorksheet([_archive_header(), _row_needing_fill()], fail_writes=True)

    with pytest.raises(RuntimeError, match="sheet write failed"):
        kc.process_rows(
            _FakeSpreadsheet(ws), model=object(),
            schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
            start_row=2, limit=1, resume=False, dry_run=False)

    assert ws.updates == []
    assert saved_progress == []


def test_process_rows_resolves_write_columns_from_header(monkeypatch):
    monkeypatch.setattr(kc, "analyze_key_concepts",
                        lambda model, rt, kcl, cur="": {
                            "concepts": ["Mindcasting"],
                            "recommendations": "False balance"})
    header = ["id", "raw_text", "notes", "key_concepts",
              "colQ_changes", "low_confidence"]
    row = ["R1", "x" * 200, "", "Mindcasting", "", "keep-me"]
    ws = _FakeWorksheet([header, row])

    summary = kc.process_rows(
        _FakeSpreadsheet(ws), model=object(),
        schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
        start_row=2, limit=1, resume=False, dry_run=False)

    assert summary["by_field"]["recommendations"] == 1
    assert ws.updates == [("E2", [["False balance"]])]


def test_duplicate_required_headers_fail_before_gemini(monkeypatch):
    gemini_called = False

    def _analyze(*args, **kwargs):
        nonlocal gemini_called
        gemini_called = True
        return {"concepts": [], "recommendations": ""}

    monkeypatch.setattr(kc, "analyze_key_concepts", _analyze)
    header = ["id", "raw_text", "notes", "notes", "key_concepts",
              "colQ_changes"]
    row = ["R1", "x" * 200, "", "", "", ""]

    with pytest.raises(ValueError, match="duplicate.*notes"):
        kc.process_rows(
            _FakeSpreadsheet(_FakeWorksheet([header, row])), model=object(),
            schema={"taxonomy": {"key_concepts": []}},
            start_row=2, limit=1, resume=False, dry_run=False)

    assert gemini_called is False


def test_missing_required_header_fails_before_gemini(monkeypatch):
    gemini_called = False

    def _analyze(*args, **kwargs):
        nonlocal gemini_called
        gemini_called = True
        return {"concepts": [], "recommendations": ""}

    monkeypatch.setattr(kc, "analyze_key_concepts", _analyze)
    header = ["id", "raw_text", "notes", "key_concepts"]
    row = ["R1", "x" * 200, "", ""]

    with pytest.raises(ValueError, match="missing.*colQ_changes"):
        kc.process_rows(
            _FakeSpreadsheet(_FakeWorksheet([header, row])), model=object(),
            schema={"taxonomy": {"key_concepts": []}},
            start_row=2, limit=1, resume=False, dry_run=False)

    assert gemini_called is False


def test_short_raw_text_preserves_existing_curator_notes():
    header = ["id", "raw_text", "notes", "key_concepts", "colQ_changes"]
    row = ["R1", "too short", "Curator audit trail", "", ""]
    ws = _FakeWorksheet([header, row])

    summary = kc.process_rows(
        _FakeSpreadsheet(ws), model=object(),
        schema={"taxonomy": {"key_concepts": []}},
        start_row=2, limit=1, resume=False, dry_run=False)

    assert summary["by_field"]["notes"] == 0
    assert ws.updates == []


def test_short_text_note_write_failure_aborts_without_advancing_progress(monkeypatch):
    saved_progress = []
    monkeypatch.setattr(kc, "save_progress", saved_progress.append)
    header = ["id", "raw_text", "notes", "key_concepts", "colQ_changes"]
    row = ["R1", "too short", "", "", ""]
    ws = _FakeWorksheet([header, row], fail_writes=True)

    with pytest.raises(RuntimeError, match="sheet write failed"):
        kc.process_rows(
            _FakeSpreadsheet(ws), model=object(),
            schema={"taxonomy": {"key_concepts": []}},
            start_row=2, limit=1, resume=False, dry_run=False)

    assert saved_progress == []


def test_gemini_request_failure_aborts_without_advancing_progress(monkeypatch):
    saved_progress = []
    monkeypatch.setattr(kc, "save_progress", saved_progress.append)

    class _FailingModel:
        def generate_content(self, prompt):
            raise RuntimeError("Gemini request failed")

    with pytest.raises(RuntimeError, match="Gemini request failed"):
        kc.process_rows(
            _FakeSpreadsheet(_worksheet_with_one_fillable_row()),
            model=_FailingModel(),
            schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
            start_row=2, limit=1, resume=False, dry_run=False)

    assert saved_progress == []


def test_invalid_gemini_json_aborts_without_advancing_progress(monkeypatch):
    saved_progress = []
    monkeypatch.setattr(kc, "save_progress", saved_progress.append)

    class _Response:
        text = "not valid JSON"

    class _InvalidJsonModel:
        def generate_content(self, prompt):
            return _Response()

    with pytest.raises(ValueError):
        kc.process_rows(
            _FakeSpreadsheet(_worksheet_with_one_fillable_row()),
            model=_InvalidJsonModel(),
            schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
            start_row=2, limit=1, resume=False, dry_run=False)

    assert saved_progress == []


def test_progress_from_another_tab_does_not_skip_archive_rows(monkeypatch):
    monkeypatch.delenv("ROSEN_MASTER_SHEET_TAB", raising=False)
    monkeypatch.setattr(kc, "load_progress", lambda: {
        "sheet_name": "staging_records", "last_processed_row": 99,
        "total_processed": 10, "total_updated": 10, "last_run": None})
    monkeypatch.setattr(kc, "analyze_key_concepts",
                        lambda model, rt, kcl, cur="": {
                            "concepts": ["Mindcasting"], "recommendations": ""})
    ws = _worksheet_with_one_fillable_row()

    summary = kc.process_rows(
        _FakeSpreadsheet(ws), model=object(),
        schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
        start_row=None, limit=1, resume=True, dry_run=True)

    assert summary["processed"] == 1
    assert summary["writes"] == 1


def test_progress_from_same_tab_resumes_after_saved_row(monkeypatch):
    monkeypatch.delenv("ROSEN_MASTER_SHEET_TAB", raising=False)
    monkeypatch.setattr(kc, "load_progress", lambda: {
        "sheet_name": "archive_records", "last_processed_row": 2,
        "total_processed": 1, "total_updated": 1, "last_run": None})
    analyzed_text = []

    def _analyze(model, raw_text, key_concepts, current_concepts=""):
        analyzed_text.append(raw_text)
        return {"concepts": ["Mindcasting"], "recommendations": ""}

    monkeypatch.setattr(kc, "analyze_key_concepts", _analyze)
    first_row = _row_needing_fill()
    first_row[33] = "a" * 200
    second_row = _row_needing_fill()
    second_row[33] = "b" * 200
    ws = _FakeWorksheet([_archive_header(), first_row, second_row])

    summary = kc.process_rows(
        _FakeSpreadsheet(ws), model=object(),
        schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
        start_row=None, limit=1, resume=True, dry_run=True)

    assert summary["processed"] == 1
    assert analyzed_text == ["b" * 200]


def _stub_main_deps(monkeypatch, summary):
    monkeypatch.setattr(kc, "load_schema", lambda: {"taxonomy": {"key_concepts": []}})
    monkeypatch.setattr(kc, "setup_google_sheets", lambda: object())
    monkeypatch.setattr(kc, "setup_gemini", lambda: object())
    monkeypatch.setattr(kc, "process_rows", lambda *a, **k: summary)
    monkeypatch.setattr(sys, "argv", ["key_concepts_updater.py"])


def test_zero_writes_after_gemini_calls_fails(monkeypatch):
    _stub_main_deps(monkeypatch, {
        "processed": 3, "writes": 0, "gemini_calls": 3,
        "dry_run": False, "by_field": {}})
    assert kc.main() == 1


def test_writes_after_gemini_calls_succeeds(monkeypatch):
    _stub_main_deps(monkeypatch, {
        "processed": 3, "writes": 3, "gemini_calls": 3,
        "dry_run": False, "by_field": {"key_concepts": 3}})
    assert kc.main() == 0


def test_dry_run_zero_writes_does_not_fail(monkeypatch):
    # A dry run writes nothing by design -- it must not trip the guard.
    _stub_main_deps(monkeypatch, {
        "processed": 3, "writes": 0, "gemini_calls": 3,
        "dry_run": True, "by_field": {}})
    monkeypatch.setattr(sys, "argv", ["key_concepts_updater.py", "--dry-run"])
    assert kc.main() == 0
