# -*- coding: utf-8 -*-
"""Regression tests for the maintenance dedup job's live-sheet wiring."""
from __future__ import annotations

import importlib.util
import pathlib

import pytest


_BACKEND = pathlib.Path(__file__).resolve().parents[1]


def _load_module():
    path = _BACKEND / "scripts" / "diagnostics" / "data_deduper.py"
    spec = importlib.util.spec_from_file_location("data_deduper_sheet_config", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _FakeWorksheet:
    def __init__(self, values):
        self._values = values
        self.batch_updates = []

    def get_all_values(self):
        return self._values

    def batch_update(self, updates):
        self.batch_updates.extend(updates)


class _FailingWorksheet(_FakeWorksheet):
    def batch_update(self, updates):
        raise RuntimeError("sheet write failed")


class _FakeSpreadsheet:
    def __init__(self, worksheet):
        self._worksheet = worksheet
        self.requested_tabs = []

    def worksheet(self, name):
        self.requested_tabs.append(name)
        if name != "archive_records":
            raise AssertionError(f"unexpected worksheet request: {name}")
        return self._worksheet


class _FakeClient:
    def __init__(self, spreadsheet):
        self._spreadsheet = spreadsheet

    def open(self, name):
        return self._spreadsheet


class _LegacySpreadsheet:
    def __init__(self, entities_worksheet):
        self._entities_worksheet = entities_worksheet

    def worksheet(self, name):
        if name != "entities":
            raise AssertionError(f"unexpected worksheet request: {name}")
        return self._entities_worksheet


def test_dedup_processes_present_columns_when_legacy_columns_are_absent():
    module = _load_module()
    header = ["id", "thematic_categories", "key_concepts", "tags"]
    worksheet = _FakeWorksheet([header, ["R1", "News, News", "", ""]])

    writes = module.run_deduplication(
        worksheet, worksheet.get_all_values()[1:], header, dry_run=True)

    assert writes == 1


def test_live_sheet_write_failure_is_not_reported_as_success():
    module = _load_module()
    header = ["id", "thematic_categories", "key_concepts", "tags"]
    worksheet = _FailingWorksheet([header, ["R1", "News, News", "", ""]])

    with pytest.raises(RuntimeError, match="sheet write failed"):
        module.run_deduplication(
            worksheet, worksheet.get_all_values()[1:], header, dry_run=False)


def test_legacy_entity_write_failure_is_not_reported_as_success(monkeypatch):
    module = _load_module()
    monkeypatch.setattr(module, "COLUMNS_TO_SEARCH_FOR_MENTIONS", ["title"])
    entities = _FailingWorksheet([
        ["entity_name", "entity_mentions"],
        ["Jay Rosen", ""],
    ])

    with pytest.raises(RuntimeError, match="sheet write failed"):
        module.update_entity_mentions(
            _LegacySpreadsheet(entities),
            [["R1", "Jay Rosen archive"]],
            ["id", "title"],
            dry_run=False,
        )


def test_main_defaults_to_archive_records_and_skips_legacy_entity_pass(monkeypatch):
    module = _load_module()
    monkeypatch.delenv("ROSEN_MASTER_SHEET_TAB", raising=False)
    worksheet = _FakeWorksheet([
        ["id", "thematic_categories", "key_concepts", "tags"],
        ["R1", "News, News", "", ""],
    ])
    spreadsheet = _FakeSpreadsheet(worksheet)
    monkeypatch.setattr(
        module, "get_gspread_client", lambda *a, **k: _FakeClient(spreadsheet))

    def _legacy_pass_must_not_run(*args, **kwargs):
        raise AssertionError("legacy entity-mentions pass must be opt-in")

    monkeypatch.setattr(module, "update_entity_mentions", _legacy_pass_must_not_run)

    assert module.main(["--dry-run", "--limit", "1"]) == 0
    assert spreadsheet.requested_tabs == ["archive_records"]


def test_main_treats_empty_workflow_tab_variable_as_unset(monkeypatch):
    module = _load_module()
    monkeypatch.setenv("ROSEN_MASTER_SHEET_TAB", "")
    worksheet = _FakeWorksheet([
        ["id", "thematic_categories", "key_concepts", "tags"],
        ["R1", "News, News", "", ""],
    ])
    spreadsheet = _FakeSpreadsheet(worksheet)
    monkeypatch.setattr(
        module, "get_gspread_client", lambda *a, **k: _FakeClient(spreadsheet))

    assert module.main(["--dry-run", "--limit", "1"]) == 0
    assert spreadsheet.requested_tabs == ["archive_records"]
