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

    def worksheet(self, name):
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


def _worksheet_with_one_fillable_row():
    return _FakeWorksheet([["h"] * _NCOLS, _row_needing_fill()])


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


def test_failed_writes_do_not_count(monkeypatch):
    # Gemini runs but every Sheets write raises. The write counter must stay 0
    # so the zero-write guard fires -- it counts saved cells, not attempts.
    monkeypatch.setattr(kc, "analyze_key_concepts",
                        lambda model, rt, kcl, cur="": {
                            "concepts": ["Mindcasting"], "recommendations": ""})
    ws = _FakeWorksheet([["h"] * _NCOLS, _row_needing_fill()], fail_writes=True)
    summary = kc.process_rows(
        _FakeSpreadsheet(ws), model=object(),
        schema={"taxonomy": {"key_concepts": ["Mindcasting"]}},
        start_row=2, limit=1, resume=False, dry_run=False)

    assert summary["gemini_calls"] == 1     # the AI call happened (and cost money)
    assert summary["writes"] == 0           # but nothing landed -> guard must fire
    assert ws.updates == []


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
