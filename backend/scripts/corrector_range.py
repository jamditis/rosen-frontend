# -*- coding: utf-8 -*-
"""Row-range selection for the canonical smart-corrector driver (issue #187).

The five former ``backend/scripts/run_smart_corrector*.py`` drivers each
reimplemented one step: turn a human row range into a slice of
``worksheet.get_all_records()`` and a sheet row number for each selected
record. They did not agree on the math.

``get_all_records()`` returns the data rows only, so record index ``k`` maps to
sheet row ``k + 2`` — sheet row 1 is the header, sheet row 2 is the first data
record. Three drivers (``run_smart_corrector_25``, ``_200``, ``_201_plus``) use
that mapping; ``_200`` spells it out (``row_num = i + 2  # +2 for header row and
0-indexing``). ``run_smart_corrector_27_42.py`` does not: it slices
``all_records[26:42]`` but writes results to rows 27..42, so it reads sheet row
28 and writes its result one row up, to row 27 — a one-row attribution shift.

This module is the single, tested source of that mapping. It is pure stdlib,
with no Google Sheets or network imports, so the boundary math is unit-testable
without credentials. ``scripts.corrector`` uses ``RowRange`` for every slice
and target sheet row; the numbered legacy drivers delegate to that CLI.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# A row or count token: a positive base-10 integer with no sign and no leading
# zero. int() would accept "+27", "007", and "1_0" and silently normalise them
# to a different form than the caller typed — a silently-wrong row is the exact
# failure this module exists to prevent — so the spec is held to canonical
# decimal.
_INT_RE = re.compile(r"[1-9][0-9]*")

# Sheet row 1 is the header; record index 0 (the first row of
# get_all_records()) is sheet row 2. This offset is the one fact the cluster
# disagreed on, so it lives in exactly one place.
HEADER_OFFSET = 2


def sheet_row_for_index(index: int) -> int:
    """Return the 1-based sheet row for a 0-based get_all_records() index."""
    if index < 0:
        raise ValueError(f"record index must be >= 0, got {index}")
    return index + HEADER_OFFSET


def index_for_sheet_row(sheet_row: int) -> int:
    """Return the 0-based get_all_records() index for a 1-based sheet row.

    Rejects the header row and anything above it: only data rows (>= 2) map to
    a record.
    """
    if sheet_row < HEADER_OFFSET:
        raise ValueError(
            f"sheet row must be >= {HEADER_OFFSET} (row 1 is the header), "
            f"got {sheet_row}"
        )
    return sheet_row - HEADER_OFFSET


@dataclass(frozen=True)
class RowRange:
    """A contiguous run of data records selected from get_all_records().

    ``start_index`` is 0-based into get_all_records(); ``count`` is the number
    of records to take, or ``None`` for "through the last record".
    """

    start_index: int
    count: int | None = None

    def __post_init__(self) -> None:
        if self.start_index < 0:
            raise ValueError(f"start_index must be >= 0, got {self.start_index}")
        if self.count is not None and self.count <= 0:
            raise ValueError(f"count must be > 0 when set, got {self.count}")

    @property
    def start_sheet_row(self) -> int:
        """1-based sheet row of the first selected record."""
        return sheet_row_for_index(self.start_index)

    def stop_index(self, total: int) -> int:
        """Exclusive stop index into a list of ``total`` records, clamped."""
        if self.count is None:
            return total
        return min(self.start_index + self.count, total)

    def select(self, all_records: list) -> list:
        """Return the slice of ``all_records`` this range selects."""
        return all_records[self.start_index : self.stop_index(len(all_records))]

    def sheet_row(self, local_index: int) -> int:
        """Return the sheet row for the ``local_index``-th record in this range."""
        if local_index < 0:
            raise ValueError(f"local index must be >= 0, got {local_index}")
        return sheet_row_for_index(self.start_index + local_index)


def parse_row_range(spec: str | None, *, limit: int | None = None) -> RowRange:
    """Parse a ``--rows`` spec into a RowRange.

    Grammar (all bounds are 1-based sheet rows, so the first data record is
    row 2):

      ``None`` / ``""``   whole sheet, optionally capped by ``limit``
      ``":25"``           first 25 data records (sheet rows 2..26)
      ``"27-42"``         sheet rows 27..42 inclusive
      ``"201-"``          sheet row 201 through the end (or ``limit`` records)

    ``limit`` caps the record count: for an open-ended spec it sets the count,
    and for a bounded spec it shrinks the count when it is smaller. A bare
    integer is rejected — ``42`` is ambiguous between "first 42" and "row 42",
    so the caller must say ``:42`` or ``42-``.
    """
    if limit is not None and limit <= 0:
        raise ValueError(f"limit must be > 0 when set, got {limit}")

    spec = (spec or "").strip()

    if spec == "":
        return RowRange(start_index=0, count=limit)

    if spec.startswith(":"):
        n = _parse_int(spec[1:], "row count")  # _parse_int guarantees n >= 1
        count = n if limit is None else min(n, limit)
        return RowRange(start_index=0, count=count)

    if "-" in spec:
        start_text, _, end_text = spec.partition("-")
        start_row = _parse_int(start_text, "start row")
        start_index = index_for_sheet_row(start_row)
        if end_text.strip() == "":
            # Open-ended: limit, if any, supplies the count.
            return RowRange(start_index=start_index, count=limit)
        end_row = _parse_int(end_text, "end row")
        if end_row < start_row:
            raise ValueError(f"end row {end_row} is before start row {start_row}")
        count = end_row - start_row + 1
        if limit is not None:
            count = min(count, limit)
        return RowRange(start_index=start_index, count=count)

    raise ValueError(f"unrecognised row spec {spec!r}; use ':N', 'N-M', or 'N-'")


def _parse_int(text: str, what: str) -> int:
    """Parse a positive base-10 integer, rejecting signs and leading zeros."""
    text = text.strip()
    if not _INT_RE.fullmatch(text):
        raise ValueError(
            f"{what} must be a positive integer with no leading zero, got {text!r}"
        )
    return int(text)
