# -*- coding: utf-8 -*-
"""Credential-free tests for the consolidated date backfill (issue #189).

The three strategy files are gone. One ``DateBackfiller`` walks the sheet and a
strategy name picks the resolver chain, so these tests drive the class with its
Google connection bypassed (``__new__`` plus a fake worksheet) and assert on the
cells it would write.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest

from scripts.backfill.date_backfill import (
    STRATEGY_SPECS,
    DateBackfiller,
    DateBackfillPlan,
    build_parser,
    normalize_date,
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

    def __init__(self, strategy, worksheet):
        self.strategy = strategy
        self.sh = FakeSpreadsheet()
        self.final_ws = self.sh.worksheet(worksheet)
        self.calls = []
        type(self).instances.append(self)

    def backfill(self, start_row=2, limit=None):
        self.calls.append((start_row, limit))
        return {"inspected": 0, "filled": 0}


class FakeWorksheet:
    def __init__(self, data):
        self.data = data
        self.updates = []

    def get_all_values(self):
        return self.data

    def batch_update(self, updates):
        self.updates.extend(updates)


def make_backfiller(strategy, sheet):
    """Build a backfiller without touching Google credentials."""
    backfiller = DateBackfiller.__new__(DateBackfiller)
    backfiller.strategy = strategy
    backfiller.spec = STRATEGY_SPECS[strategy]
    backfiller.final_ws = sheet
    backfiller._model = None
    return backfiller


@pytest.fixture(autouse=True)
def clear_instances():
    FakeBackfiller.instances.clear()


# --- CLI surface ---------------------------------------------------------


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


def test_parser_offers_every_strategy():
    for strategy in ("simple", "enhanced", "publication"):
        assert build_parser().parse_args(["--strategy", strategy]).strategy == strategy


def test_row_window_maps_sheet_rows_to_the_matching_input_records():
    rows = [f"sheet-row-{row}" for row in range(2, 31)]
    assert select_row_window(rows, 27, 2) == ["sheet-row-27", "sheet-row-28"]
    assert select_row_window(rows, 40, 5) == []


# --- dispatch ------------------------------------------------------------


def test_preview_does_not_build_a_backfiller():
    plan = DateBackfillPlan(
        strategy="enhanced",
        worksheet="test_runs",
        start_row=27,
        limit=16,
        live=False,
    )
    result = run_date_backfill(
        plan,
        backfiller_factory=lambda strategy, _worksheet: pytest.fail(
            f"preview built the {strategy} backfiller"
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


@pytest.mark.parametrize("strategy", ["simple", "enhanced", "publication"])
@pytest.mark.parametrize("limit", [16, None])
def test_live_dispatch_passes_one_window_to_every_strategy(strategy, limit):
    plan = DateBackfillPlan(
        strategy=strategy,
        worksheet="test_runs",
        start_row=27,
        limit=limit,
        live=True,
    )
    result = run_date_backfill(plan, backfiller_factory=FakeBackfiller)

    instance = FakeBackfiller.instances[-1]
    assert instance.strategy == strategy
    assert instance.sh.requested == ["test_runs"]
    assert instance.final_ws == "worksheet:test_runs"
    assert instance.calls == [(27, limit)]
    assert result["executed"] is True


def test_blank_worksheet_is_rejected_before_building_a_backfiller():
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
            backfiller_factory=lambda *_args: pytest.fail("a backfiller was built"),
        )


def test_unknown_strategy_is_rejected():
    plan = DateBackfillPlan(
        strategy="guess",
        worksheet="final",
        start_row=2,
        limit=None,
        live=True,
    )
    with pytest.raises(ValueError, match="unknown strategy"):
        run_date_backfill(
            plan,
            backfiller_factory=lambda *_args: pytest.fail("a backfiller was built"),
        )


# --- the shared sheet walk ------------------------------------------------


def test_backfill_reads_and_writes_the_same_sheet_rows():
    headers = ["url", "title", "excerpt", "publication_date"]
    rows = [[f"url-{row}", f"Title {row}", "", ""] for row in range(2, 31)]
    sheet = FakeWorksheet([headers, *rows])
    backfiller = make_backfiller("publication", sheet)
    seen = []
    backfiller.resolve_from_url = lambda url: seen.append(url) or "01/15/2020"
    backfiller.resolve_from_page = lambda _url: None
    backfiller.resolve_with_ai = lambda *_args: None

    summary = backfiller.backfill(start_row=27, limit=2)

    assert seen == ["url-27", "url-28"]
    assert [update["range"] for update in sheet.updates] == ["D27", "D28"]
    assert summary["filled"] == 2
    assert summary["by_source"] == {"url": 2}


def test_backfill_treats_a_header_only_sheet_as_a_noop(capsys):
    sheet = FakeWorksheet([["url", "title", "excerpt", "publication_date"]])
    backfiller = make_backfiller("simple", sheet)
    backfiller.resolve_from_url = lambda _url: None

    summary = backfiller.backfill(start_row=2, limit=10)

    output = capsys.readouterr().out
    assert sheet.updates == []
    assert summary["inspected"] == 0
    assert "Total inspected: 0" in output
    assert "Success rate: 0.0%" in output


def test_summary_uses_only_available_selected_rows(capsys):
    headers = ["url", "publication_date"]
    rows = [[f"url-{row}", ""] for row in range(2, 7)]
    sheet = FakeWorksheet([headers, *rows])
    backfiller = make_backfiller("enhanced", sheet)
    seen = []
    backfiller.resolve_from_url = lambda url: seen.append(url) or None
    backfiller.resolve_from_page = lambda _url: None

    summary = backfiller.backfill(start_row=5, limit=100)

    output = capsys.readouterr().out
    assert seen == ["url-5", "url-6"]
    assert summary["inspected"] == 2
    assert summary["not_found"] == 2
    assert "Inspecting 2 records" in output
    assert "No date found: 2" in output
    assert "No date found: 100" not in output


def test_rows_that_already_have_a_date_are_left_alone():
    headers = ["url", "publication_date"]
    sheet = FakeWorksheet([headers, ["url-2", "01/01/1999"], ["url-3", ""]])
    backfiller = make_backfiller("simple", sheet)
    seen = []
    backfiller.resolve_from_url = lambda url: seen.append(url) or "02/02/2002"

    summary = backfiller.backfill()

    assert seen == ["url-3"]
    assert [update["range"] for update in sheet.updates] == ["B3"]
    assert summary["already_dated"] == 1


def test_a_missing_publication_date_column_stops_the_run(capsys):
    sheet = FakeWorksheet([["url", "title"], ["url-2", "Title"]])
    backfiller = make_backfiller("simple", sheet)
    backfiller.resolve_from_url = lambda _url: pytest.fail("a row was resolved")

    summary = backfiller.backfill()

    assert summary["filled"] == 0
    assert sheet.updates == []
    assert "publication_date column not found" in capsys.readouterr().out


def test_the_target_cell_is_correct_past_column_z():
    headers = [f"col{index}" for index in range(27)] + ["publication_date", "url"]
    sheet = FakeWorksheet([headers, [""] * 27 + ["", "url-2"]])
    backfiller = make_backfiller("simple", sheet)
    backfiller.resolve_from_url = lambda _url: "03/04/2005"

    backfiller.backfill()

    assert [update["range"] for update in sheet.updates] == ["AB2"]


# --- resolver chains ------------------------------------------------------


@pytest.mark.parametrize(
    "strategy,expected",
    [
        ("simple", ("url",)),
        ("enhanced", ("url", "page")),
        ("publication", ("url", "page", "ai")),
    ],
)
def test_each_strategy_declares_its_resolver_chain(strategy, expected):
    assert STRATEGY_SPECS[strategy].resolvers == expected


def test_simple_never_reaches_the_network_or_the_model():
    headers = ["url", "publication_date"]
    sheet = FakeWorksheet([headers, ["url-2", ""]])
    backfiller = make_backfiller("simple", sheet)
    backfiller.resolve_from_url = lambda _url: None
    backfiller.resolve_from_page = lambda _url: pytest.fail("simple read a page")
    backfiller.resolve_with_ai = lambda *_args: pytest.fail("simple called the model")

    backfiller.backfill()

    assert sheet.updates == []


def test_enhanced_falls_back_to_the_page_but_not_the_model():
    headers = ["url", "publication_date"]
    sheet = FakeWorksheet([headers, ["url-2", ""]])
    backfiller = make_backfiller("enhanced", sheet)
    backfiller.resolve_from_url = lambda _url: None
    backfiller.resolve_from_page = lambda _url: "05/06/2007"
    backfiller.resolve_with_ai = lambda *_args: pytest.fail("enhanced called the model")

    summary = backfiller.backfill()

    assert summary["by_source"] == {"page": 1}


def test_publication_reaches_the_model_last_and_gets_the_record_context():
    headers = ["url", "title", "excerpt", "publication_date"]
    sheet = FakeWorksheet([headers, ["url-2", "A title", "An excerpt", ""]])
    backfiller = make_backfiller("publication", sheet)
    seen = []
    backfiller.resolve_from_url = lambda _url: None
    backfiller.resolve_from_page = lambda _url: None
    backfiller.resolve_with_ai = lambda *args: seen.append(args) or "07/08/2009"

    summary = backfiller.backfill()

    assert seen == [("url-2", "A title", "An excerpt")]
    assert summary["by_source"] == {"ai": 1}


# --- shared date normaliser ----------------------------------------------


@pytest.mark.parametrize(
    "raw,expected",
    [
        # Formats every historical strategy accepted.
        ("2020-01-15", "01/15/2020"),
        ("01/15/2020", "01/15/2020"),
        ("01-15-2020", "01/15/2020"),
        ("January 15, 2020", "01/15/2020"),
        ("Jan 15, 2020", "01/15/2020"),
        ("15 January 2020", "01/15/2020"),
        ("2020-01-15T09:30:00", "01/15/2020"),
        # Formats only one strategy accepted; the union keeps them all.
        ("2020-01-15 09:30:00", "01/15/2020"),
        ("2020-01-15T09:30:00.500Z", "01/15/2020"),
        ("2020-01-15T09:30:00Z", "01/15/2020"),
        ("15 Jan 2020", "01/15/2020"),
        ("Wednesday, January 15, 2020", "01/15/2020"),
        ("Wed, Jan 15, 2020", "01/15/2020"),
        # Label and timezone trimming now applies to every strategy.
        ("Published: 2020-01-15", "01/15/2020"),
        ("2020-01-15T09:30:00 UTC", "01/15/2020"),
        # Year and month only falls back to the first of the month.
        ("2020-01", "01/01/2020"),
        # Nothing usable.
        ("", None),
        (None, None),
        ("sometime last spring", None),
    ],
)
def test_normalize_date(raw, expected):
    assert normalize_date(raw) == expected


def test_month_before_day_is_preserved_for_ambiguous_slash_dates():
    assert normalize_date("01/02/2020") == "01/02/2020"


# --- retired entry points -------------------------------------------------


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


@pytest.mark.parametrize(
    "retired",
    [
        "scripts/run_date_backfill.py",
        "scripts/run_backfill.py",
        "scripts/backfill_missing_dates.py",
        "scripts/backfill/simple_date_backfill.py",
        "scripts/backfill/enhanced_date_backfill.py",
        "scripts/backfill/publication_date_backfill.py",
    ],
)
def test_consolidated_files_are_gone(retired):
    backend_dir = Path(__file__).resolve().parents[1]
    assert not (backend_dir / retired).exists()


@pytest.mark.parametrize(
    "module",
    [
        "scripts.backfill.date_backfill",
        "scripts.backfill.backfill_worker",
        "scripts.backfill.backfill_missing_dates",
    ],
)
def test_every_surviving_entry_point_is_reachable_as_a_module(module):
    # The retired run_* wrappers only existed to set up sys.path. Each entry
    # point must resolve under `python -m` without them.
    assert importlib.util.find_spec(module) is not None


def test_backend_guide_keeps_full_context_and_uses_the_canonical_cli():
    backend_dir = Path(__file__).resolve().parents[1]
    guide = (backend_dir / "README.md").read_text(encoding="utf-8")

    assert len(guide.splitlines()) > 450
    assert "python scripts/run_date_backfill.py" not in guide
    assert "python scripts/run_backfill.py" not in guide
    assert "python -m scripts.backfill.date_backfill" in guide
