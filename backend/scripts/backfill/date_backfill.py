# -*- coding: utf-8 -*-
"""Unified, explicit CLI for the three publication-date backfill strategies.

The historical ``run_date_backfill.py`` wrapper silently selected the enhanced
strategy, the ``test_runs`` worksheet, and sheet row 2. This module makes those
choices visible and keeps execution preview-only unless ``--live`` is supplied.
The strategy implementations remain in their existing modules for now; this is
the common dispatch boundary that a later consolidation can fold inward.
"""

from __future__ import annotations

import argparse
import importlib
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, TypeVar

Strategy = Literal["simple", "enhanced", "publication"]
BackfillerLoader = Callable[[Strategy], type]
Row = TypeVar("Row")

_STRATEGIES: dict[Strategy, tuple[str, str]] = {
    "simple": ("simple_date_backfill", "SimpleDateBackfiller"),
    "enhanced": ("enhanced_date_backfill", "EnhancedDateBackfiller"),
    "publication": ("publication_date_backfill", "PublicationDateBackfiller"),
}


@dataclass(frozen=True)
class DateBackfillPlan:
    """The explicit choices for one date-backfill invocation."""

    strategy: Strategy
    worksheet: str
    start_row: int
    limit: int | None
    live: bool

    @property
    def end_row(self) -> int | None:
        if self.limit is None:
            return None
        return self.start_row + self.limit - 1


def select_row_window(
    rows: Sequence[Row], start_row: int, limit: int | None = None
) -> list[Row]:
    """Select data rows for an inclusive sheet-row start and optional limit."""
    if start_row < 2:
        raise ValueError("start_row must be 2 or greater")
    if limit is not None and limit <= 0:
        raise ValueError("limit must be greater than zero")

    start_index = start_row - 2
    selected = list(rows[start_index:])
    return selected if limit is None else selected[:limit]


def _sheet_row(value: str) -> int:
    try:
        row = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer sheet row") from exc
    if row < 2:
        raise argparse.ArgumentTypeError("must be 2 or greater (row 1 is headers)")
    return row


def _positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if number <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Preview or run a publication-date backfill strategy."
    )
    parser.add_argument(
        "--strategy",
        choices=tuple(_STRATEGIES),
        default="enhanced",
        help="Date extraction strategy (default: enhanced).",
    )
    parser.add_argument(
        "--worksheet",
        default="final",
        help="Google Sheets worksheet to target (default: final).",
    )
    parser.add_argument(
        "--start-row",
        type=_sheet_row,
        default=2,
        help="First inclusive sheet row; row 1 is headers (default: 2).",
    )
    parser.add_argument(
        "--limit",
        type=_positive_int,
        default=None,
        help="Maximum number of records to inspect from the start row.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Write to Google Sheets. Without this flag the command only previews its plan.",
    )
    return parser


def load_backfiller(strategy: Strategy) -> type:
    """Load a strategy class only after a live run has been approved."""
    module_name, class_name = _STRATEGIES[strategy]
    if __package__:
        module = importlib.import_module(f"{__package__}.{module_name}")
    else:  # Supports ``python scripts/backfill/date_backfill.py --help``.
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        module = importlib.import_module(module_name)
    return getattr(module, class_name)


def run_date_backfill(
    plan: DateBackfillPlan,
    *,
    backfiller_loader: BackfillerLoader = load_backfiller,
) -> dict[str, Any]:
    """Preview a plan or dispatch it to the selected historical strategy."""
    if plan.start_row < 2:
        raise ValueError("start_row must be 2 or greater")
    if plan.limit is not None and plan.limit <= 0:
        raise ValueError("limit must be greater than zero")
    if not plan.worksheet.strip():
        raise ValueError("worksheet must not be blank")

    result = {
        "strategy": plan.strategy,
        "worksheet": plan.worksheet,
        "start_row": plan.start_row,
        "end_row": plan.end_row,
        "limit": plan.limit,
        "live": plan.live,
        "executed": False,
    }
    if not plan.live:
        return result

    backfiller_class = backfiller_loader(plan.strategy)
    backfiller = backfiller_class(worksheet=plan.worksheet)

    if plan.strategy == "enhanced":
        backfiller.backfill_missing_dates(
            start_row=plan.start_row,
            end_row=plan.end_row,
        )
    else:
        backfiller.backfill_publication_dates(
            start_row=plan.start_row,
            max_rows=plan.limit,
        )

    result["executed"] = True
    return result


def _describe(plan: DateBackfillPlan) -> str:
    if plan.limit is None:
        rows = f"{plan.start_row}-end"
    else:
        rows = f"{plan.start_row}-{plan.end_row} ({plan.limit} records maximum)"
    mode = "LIVE" if plan.live else "PREVIEW"
    return (
        f"{mode}: strategy={plan.strategy}; worksheet={plan.worksheet}; "
        f"sheet rows={rows}"
    )


def main(
    argv: Sequence[str] | None = None,
    *,
    backfiller_loader: BackfillerLoader = load_backfiller,
) -> int:
    args = build_parser().parse_args(argv)
    plan = DateBackfillPlan(
        strategy=args.strategy,
        worksheet=args.worksheet.strip(),
        start_row=args.start_row,
        limit=args.limit,
        live=args.live,
    )
    print(_describe(plan))
    if not plan.live:
        print(
            "No Google Sheets connection was made. Add --live after reviewing this plan."
        )
    run_date_backfill(plan, backfiller_loader=backfiller_loader)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
