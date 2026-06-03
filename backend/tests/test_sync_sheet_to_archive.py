# -*- coding: utf-8 -*-
"""Tests for scripts/sync_sheet_to_archive.py -- the sheet -> archive merge.

The merge must be additive and never destructive: enrichment columns take the
sheet's non-empty value, fill-only columns (raw_text, publication_date,
word_count) fill only empty CSV cells, and raw_text is never blanked or
shortened. A dry run must write nothing and never open a PR.

Tests exercise the pure merge functions directly and run() with the sheet read
and CSV path mocked, so no Google API, git, or gh is touched.
"""
from __future__ import annotations

import csv
import importlib.util
import pathlib
import sys

import pytest

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# The script imports submission_server (config/paths), which pulls flask in.
pytest.importorskip("flask")


def _load_module():
    path = _BACKEND / "scripts" / "sync_sheet_to_archive.py"
    spec = importlib.util.spec_from_file_location("sync_sheet_to_archive", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


sync = _load_module()


# ---------- sheet_rows_by_id ------------------------------------------------


def test_sheet_rows_by_id_indexes_and_skips_blank():
    values = [
        ["id", "key_concepts", "raw_text"],
        ["RECORD-1", "View from Nowhere", "body one"],
        ["", "orphan", "no id"],
        ["RECORD-2", "", ""],
    ]
    by_id = sync.sheet_rows_by_id(values)
    assert set(by_id) == {"RECORD-1", "RECORD-2"}
    assert by_id["RECORD-1"]["key_concepts"] == "View from Nowhere"


def test_sheet_rows_by_id_requires_id_column():
    with pytest.raises(ValueError):
        sync.sheet_rows_by_id([["title", "url"], ["t", "u"]])


def test_sheet_rows_by_id_empty():
    assert sync.sheet_rows_by_id([]) == {}
    assert sync.sheet_rows_by_id([["id", "x"]]) == {}  # header only


# ---------- merge_enrichment ------------------------------------------------

FIELDS = ["id", "key_concepts", "thematic_categories", "raw_text",
          "publication_date", "notes"]


def test_enrichment_fills_and_overwrites_but_never_blanks():
    rows = [{"id": "R1", "key_concepts": "", "thematic_categories": "old cat",
             "raw_text": "", "publication_date": "", "notes": "keep"}]
    sheet = {"R1": {"key_concepts": "Mindcasting", "thematic_categories": "new cat",
                    "raw_text": ""}}
    merged, stats = sync.merge_enrichment(rows, sheet, FIELDS)
    # Filled empty enrichment cell, and the sheet's value won over the old one.
    assert merged[0]["key_concepts"] == "Mindcasting"
    assert merged[0]["thematic_categories"] == "new cat"
    # notes is not an enrichment/fill column, so it is untouched.
    assert merged[0]["notes"] == "keep"
    assert stats["rows_changed"] == 1
    assert stats["writes_by_field"]["key_concepts"] == 1


def test_empty_sheet_value_does_not_blank_csv():
    rows = [{"id": "R1", "key_concepts": "Existing", "thematic_categories": "",
             "raw_text": "", "publication_date": "", "notes": ""}]
    sheet = {"R1": {"key_concepts": "", "thematic_categories": ""}}
    merged, stats = sync.merge_enrichment(rows, sheet, FIELDS)
    assert merged[0]["key_concepts"] == "Existing"  # not blanked
    assert stats["rows_changed"] == 0


def test_raw_text_filled_only_when_empty_and_never_shortened():
    rows = [
        {"id": "R1", "key_concepts": "", "thematic_categories": "",
         "raw_text": "A long existing body that must survive", "publication_date": "",
         "notes": ""},
        {"id": "R2", "key_concepts": "", "thematic_categories": "",
         "raw_text": "", "publication_date": "", "notes": ""},
    ]
    sheet = {
        "R1": {"raw_text": "short"},          # shorter -> must NOT overwrite
        "R2": {"raw_text": "filled in body"},  # empty CSV -> fill is allowed
    }
    merged, stats = sync.merge_enrichment(rows, sheet, FIELDS)
    assert merged[0]["raw_text"] == "A long existing body that must survive"
    assert merged[1]["raw_text"] == "filled in body"
    assert stats["writes_by_field"].get("raw_text") == 1


def test_rows_not_in_sheet_are_untouched():
    rows = [{"id": "R9", "key_concepts": "", "thematic_categories": "",
             "raw_text": "", "publication_date": "", "notes": ""}]
    merged, stats = sync.merge_enrichment(rows, {}, FIELDS)
    assert stats["matched"] == 0
    assert stats["rows_changed"] == 0


def test_limit_caps_rows_changed():
    rows = [{"id": f"R{i}", "key_concepts": "", "thematic_categories": "",
             "raw_text": "", "publication_date": "", "notes": ""} for i in range(5)]
    sheet = {f"R{i}": {"key_concepts": "Mindcasting"} for i in range(5)}
    merged, stats = sync.merge_enrichment(rows, sheet, FIELDS, limit=2)
    assert stats["rows_changed"] == 2
    assert stats["limit_reached"] is True
    assert stats["matched"] == 5
    # Only the first two rows got the value; the rest stayed empty.
    assert [r["key_concepts"] for r in merged] == [
        "Mindcasting", "Mindcasting", "", "", ""]


def test_merge_enrichment_sanitizes_formula_injection_in_enrichment():
    # Enrichment values are sheet-editor controlled; a leading formula trigger
    # must be neutralized before it lands in the committed archive CSV.
    rows = [{"id": "R1", "key_concepts": "", "thematic_categories": "",
             "raw_text": "", "publication_date": "", "notes": ""}]
    sheet = {"R1": {"key_concepts": '=HYPERLINK("http://evil.example","x")',
                    "thematic_categories": "@SUM(1+1)"}}
    merged, _ = sync.merge_enrichment(rows, sheet, FIELDS)
    assert merged[0]["key_concepts"] == "'=HYPERLINK(\"http://evil.example\",\"x\")"
    assert merged[0]["thematic_categories"] == "'@SUM(1+1)"


def test_merge_enrichment_sanitizes_formula_injection_in_fill_only():
    # Fill-only columns (raw_text) are sheet-sourced too and must be neutralized.
    rows = [{"id": "R1", "key_concepts": "", "thematic_categories": "",
             "raw_text": "", "publication_date": "", "notes": ""}]
    sheet = {"R1": {"raw_text": "=2+5+cmd|'/c calc'!A0"}}
    merged, _ = sync.merge_enrichment(rows, sheet, FIELDS)
    assert merged[0]["raw_text"] == "'=2+5+cmd|'/c calc'!A0"


def test_merge_enrichment_does_not_over_escape_safe_values():
    rows = [{"id": "R1", "key_concepts": "", "thematic_categories": "",
             "raw_text": "", "publication_date": "", "notes": ""}]
    sheet = {"R1": {"key_concepts": "View from Nowhere"}}
    merged, _ = sync.merge_enrichment(rows, sheet, FIELDS)
    assert merged[0]["key_concepts"] == "View from Nowhere"


# ---------- CSV round trip --------------------------------------------------


def test_write_csv_atomic_preserves_header(tmp_path):
    csv_path = tmp_path / "archive.csv"
    fieldnames = ["id", "title", "raw_text", "low_confidence"]
    rows = [{"id": "R1", "title": "T", "raw_text": "body", "low_confidence": ""}]
    sync.write_csv_atomic(csv_path, fieldnames, rows)
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == fieldnames
        out = list(reader)
    assert out[0]["raw_text"] == "body"


# ---------- run() dry-run ---------------------------------------------------


class _FakeWorksheet:
    def __init__(self, values):
        self._values = values

    def get_all_values(self):
        return self._values


class _FakeSheet:
    def __init__(self, values):
        self._ws = _FakeWorksheet(values)

    def worksheet(self, tab):
        return self._ws


def _seed_csv(tmp_path):
    csv_path = tmp_path / "archive_records-public.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "key_concepts", "raw_text"])
        writer.writeheader()
        writer.writerow({"id": "R1", "key_concepts": "", "raw_text": "orig body"})
    return csv_path


def test_dry_run_writes_nothing_and_opens_no_pr(tmp_path, monkeypatch):
    csv_path = _seed_csv(tmp_path)
    before = csv_path.read_bytes()

    sheet_values = [
        ["id", "key_concepts", "raw_text"],
        ["R1", "Mindcasting", "should not overwrite"],
    ]
    monkeypatch.setattr(sync, "open_spreadsheet",
                        lambda *a, **k: _FakeSheet(sheet_values))

    # Fail loudly if dry-run ever reaches the deploy tail.
    def _boom(*a, **k):
        raise AssertionError("dry run must not deploy")

    monkeypatch.setattr(sync, "regen_json", _boom)
    monkeypatch.setattr(sync, "run_node_tests", _boom)
    monkeypatch.setattr(sync, "open_sync_pr", _boom)

    result = sync.run(dry_run=True, csv_path=csv_path)

    assert result["status"] == "dry_run"
    assert result["rows_changed"] == 1            # it would change R1
    assert result["exit_code"] == 0
    assert csv_path.read_bytes() == before        # but wrote nothing


def test_nothing_to_sync_when_sheet_matches(tmp_path, monkeypatch):
    csv_path = _seed_csv(tmp_path)
    # Sheet adds no new non-empty enrichment and offers a shorter raw_text only.
    sheet_values = [
        ["id", "key_concepts", "raw_text"],
        ["R1", "", "x"],
    ]
    monkeypatch.setattr(sync, "open_spreadsheet",
                        lambda *a, **k: _FakeSheet(sheet_values))
    monkeypatch.setattr(sync, "open_sync_pr",
                        lambda *a, **k: (_ for _ in ()).throw(
                            AssertionError("should not open a PR")))

    result = sync.run(dry_run=False, csv_path=csv_path)
    assert result["status"] == "nothing_to_sync"
    assert result["exit_code"] == 0
