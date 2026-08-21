# -*- coding: utf-8 -*-
"""Credential-free tests for the explicit date-backfill CLI (issue #189)."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

from scripts.backfill import date_backfill
from scripts.backfill.date_backfill import (
    DateBackfillPlan,
    build_parser,
    run_date_backfill,
    select_row_window,
)


class FakeSpreadsheet:
    def __init__(self):
        self.requested = []

    def worksheet(self, name):
        self.requested.append(name)
        return f"worksheet:{name}"


class FakeBackfiller:
    instances = []

    def __init__(self, *, worksheet="final"):
        self.sh = FakeSpreadsheet()
        self.final_ws = self.sh.worksheet(worksheet)
        self.calls = []
        type(self).instances.append(self)

    def backfill_publication_dates(self, start_row=2, max_rows=None):
        self.calls.append(("publication", start_row, max_rows))

    def backfill_missing_dates(self, start_row=2, end_row=None):
        self.calls.append(("enhanced", start_row, end_row))


class WorksheetAwareBackfiller(FakeBackfiller):
    def __init__(self, *, worksheet):
        self.sh = FakeSpreadsheet()
        self.final_ws = self.sh.worksheet(worksheet)
        self.calls = []
        type(self).instances.append(self)


class FakeWorksheet:
    def __init__(self, data):
        self.data = data
        self.updates = []

    def get_all_values(self):
        return self.data

    def batch_update(self, updates):
        self.updates.extend(updates)


@pytest.fixture(autouse=True)
def clear_instances():
    FakeBackfiller.instances.clear()


def _stub_strategy_dependencies(monkeypatch):
    gspread = ModuleType("gspread")
    gspread.service_account = lambda **_kwargs: None
    monkeypatch.setitem(sys.modules, "gspread", gspread)

    dotenv = ModuleType("dotenv")
    dotenv.load_dotenv = lambda: None
    monkeypatch.setitem(sys.modules, "dotenv", dotenv)

    requests = ModuleType("requests")
    requests.get = lambda *_args, **_kwargs: SimpleNamespace(content=b"")
    monkeypatch.setitem(sys.modules, "requests", requests)

    bs4 = ModuleType("bs4")
    bs4.BeautifulSoup = lambda *_args, **_kwargs: None
    monkeypatch.setitem(sys.modules, "bs4", bs4)

    google = ModuleType("google")
    google.__path__ = []
    genai = ModuleType("google.generativeai")
    genai.configure = lambda **_kwargs: None
    genai.GenerativeModel = lambda *_args, **_kwargs: object()
    google.generativeai = genai
    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.generativeai", genai)


def _load_strategy(monkeypatch, filename, module_name):
    backend_dir = Path(__file__).resolve().parents[1]
    backfill_dir = backend_dir / "scripts" / "backfill"
    _stub_strategy_dependencies(monkeypatch)
    monkeypatch.syspath_prepend(str(backfill_dir))
    monkeypatch.setitem(sys.modules, "date_backfill", date_backfill)

    spec = importlib.util.spec_from_file_location(module_name, backfill_dir / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_parser_defaults_to_a_non_executing_explicit_plan():
    args = build_parser().parse_args([])
    assert args.strategy == "enhanced"
    assert args.worksheet == "final"
    assert args.start_row == 2
    assert args.limit is None
    assert args.live is False


def test_parser_accepts_strategy_worksheet_and_bounded_rows():
    args = build_parser().parse_args(
        [
            "--strategy",
            "publication",
            "--worksheet",
            "test_runs",
            "--start-row",
            "27",
            "--limit",
            "16",
            "--live",
        ]
    )
    assert args.strategy == "publication"
    assert args.worksheet == "test_runs"
    assert args.start_row == 27
    assert args.limit == 16
    assert args.live is True


@pytest.mark.parametrize("bad_row", ["0", "1", "-1", "not-a-row"])
def test_parser_rejects_header_or_malformed_start_rows(bad_row):
    with pytest.raises(SystemExit):
        build_parser().parse_args(["--start-row", bad_row])


@pytest.mark.parametrize("bad_limit", ["0", "-1", "not-a-limit"])
def test_parser_rejects_non_positive_or_malformed_limits(bad_limit):
    with pytest.raises(SystemExit):
        build_parser().parse_args(["--limit", bad_limit])


def test_row_window_maps_sheet_rows_to_the_matching_input_records():
    rows = [f"sheet-row-{row}" for row in range(2, 31)]
    assert select_row_window(rows, 27, 2) == ["sheet-row-27", "sheet-row-28"]
    assert select_row_window(rows, 40, 5) == []


def test_preview_does_not_load_google_or_strategy_dependencies():
    plan = DateBackfillPlan(
        strategy="enhanced",
        worksheet="test_runs",
        start_row=27,
        limit=16,
        live=False,
    )
    result = run_date_backfill(
        plan,
        backfiller_loader=lambda strategy: pytest.fail(
            f"preview loaded the {strategy} strategy"
        ),
    )
    assert result == {
        "strategy": "enhanced",
        "worksheet": "test_runs",
        "start_row": 27,
        "end_row": 42,
        "limit": 16,
        "live": False,
        "executed": False,
    }


@pytest.mark.parametrize(
    "strategy,limit,expected_call",
    [
        ("simple", 16, ("publication", 27, 16)),
        ("publication", 16, ("publication", 27, 16)),
        ("enhanced", 16, ("enhanced", 27, 42)),
        ("enhanced", None, ("enhanced", 27, None)),
    ],
)
def test_live_dispatch_preserves_each_strategy_interface(
    strategy, limit, expected_call
):
    plan = DateBackfillPlan(
        strategy=strategy,
        worksheet="test_runs",
        start_row=27,
        limit=limit,
        live=True,
    )
    result = run_date_backfill(
        plan,
        backfiller_loader=lambda _selected: FakeBackfiller,
    )
    instance = FakeBackfiller.instances[-1]
    assert instance.sh.requested == ["test_runs"]
    assert instance.final_ws == "worksheet:test_runs"
    assert instance.calls == [expected_call]
    assert result["executed"] is True


def test_live_dispatch_opens_the_requested_worksheet_during_construction():
    plan = DateBackfillPlan(
        strategy="simple",
        worksheet="staging_only",
        start_row=2,
        limit=1,
        live=True,
    )

    run_date_backfill(
        plan,
        backfiller_loader=lambda _selected: WorksheetAwareBackfiller,
    )

    instance = WorksheetAwareBackfiller.instances[-1]
    assert instance.sh.requested == ["staging_only"]
    assert instance.final_ws == "worksheet:staging_only"


def test_blank_worksheet_is_rejected_before_loading_a_strategy():
    plan = DateBackfillPlan(
        strategy="enhanced",
        worksheet="   ",
        start_row=2,
        limit=None,
        live=True,
    )
    with pytest.raises(ValueError, match="worksheet must not be blank"):
        run_date_backfill(
            plan,
            backfiller_loader=lambda _strategy: pytest.fail("strategy was loaded"),
        )


def test_publication_strategy_reads_and_writes_the_same_sheet_rows(monkeypatch):
    module = _load_strategy(
        monkeypatch,
        "publication_date_backfill.py",
        "publication_date_backfill_test",
    )
    headers = ["url", "title", "excerpt", "publication_date"]
    rows = [[f"url-{row}", f"Title {row}", "", ""] for row in range(2, 31)]
    sheet = FakeWorksheet([headers, *rows])
    backfiller = module.PublicationDateBackfiller.__new__(
        module.PublicationDateBackfiller
    )
    backfiller.final_ws = sheet
    seen_urls = []
    backfiller.extract_date_from_url = lambda url: (
        seen_urls.append(url) or "01/15/2020"
    )
    backfiller.extract_date_from_web = lambda _url: None
    backfiller.extract_date_with_ai = lambda _url, _title, _excerpt: None

    backfiller.backfill_publication_dates(start_row=27, max_rows=2)

    assert seen_urls == ["url-27", "url-28"]
    assert [update["range"] for update in sheet.updates] == ["D27", "D28"]


def test_publication_strategy_treats_a_header_only_sheet_as_a_noop(monkeypatch, capsys):
    module = _load_strategy(
        monkeypatch,
        "publication_date_backfill.py",
        "publication_date_backfill_empty_test",
    )
    sheet = FakeWorksheet([["url", "title", "excerpt", "publication_date"]])
    backfiller = module.PublicationDateBackfiller.__new__(
        module.PublicationDateBackfiller
    )
    backfiller.final_ws = sheet
    backfiller.extract_date_from_url = lambda _url: None
    backfiller.extract_date_from_web = lambda _url: None
    backfiller.extract_date_with_ai = lambda _url, _title, _excerpt: None

    backfiller.backfill_publication_dates(start_row=2, max_rows=10)

    output = capsys.readouterr().out
    assert sheet.updates == []
    assert "Total inspected: 0" in output
    assert "Success rate: 0.0%" in output


def test_enhanced_summary_uses_only_available_selected_rows(monkeypatch, capsys):
    module = _load_strategy(
        monkeypatch,
        "enhanced_date_backfill.py",
        "enhanced_date_backfill_test",
    )
    headers = ["url", "publication_date"]
    rows = [[f"url-{row}", ""] for row in range(2, 7)]
    sheet = FakeWorksheet([headers, *rows])
    backfiller = module.EnhancedDateBackfiller.__new__(module.EnhancedDateBackfiller)
    backfiller.final_ws = sheet
    seen_urls = []
    backfiller.extract_date_from_url = lambda url: seen_urls.append(url) or None
    backfiller.extract_date_from_metadata = lambda _url: None

    backfiller.backfill_missing_dates(start_row=5, end_row=104)

    output = capsys.readouterr().out
    assert seen_urls == ["url-5", "url-6"]
    assert "Inspecting 2 records" in output
    assert "No date found: 2" in output
    assert "No date found: 100" not in output


def test_canonical_script_shows_help_without_installed_backfill_dependencies():
    backend_dir = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        [sys.executable, "-S", "scripts/backfill/date_backfill.py", "--help"],
        cwd=backend_dir,
        env={**os.environ, "PYTHONPATH": ""},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    for option in ("--strategy", "--worksheet", "--start-row", "--live"):
        assert option in result.stdout


def test_hardcoded_legacy_wrapper_is_removed():
    backend_dir = Path(__file__).resolve().parents[1]
    assert not (backend_dir / "scripts/run_date_backfill.py").exists()


def test_backend_guide_keeps_full_context_and_uses_the_canonical_cli():
    backend_dir = Path(__file__).resolve().parents[1]
    guide = (backend_dir / "README.md").read_text(encoding="utf-8")

    assert len(guide.splitlines()) > 450
    assert "python scripts/run_date_backfill.py" not in guide
    assert "python -m scripts.backfill.date_backfill" in guide
