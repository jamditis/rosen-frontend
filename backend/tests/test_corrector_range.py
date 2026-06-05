# -*- coding: utf-8 -*-
"""Tests for scripts/corrector_range.py (issue #187).

These pin the one mapping the smart-corrector cluster disagreed on: record
index ``k`` in ``worksheet.get_all_records()`` is sheet row ``k + 2``. The
``test_27_42_*`` cases lock in the correct slice and demonstrate the off-by-one
that ``run_smart_corrector_27_42.py`` shipped (``all_records[26:42]`` written to
rows 27..42, reading row 28 and writing row 27).

The module is pure stdlib, so it imports directly under the pytest
``pythonpath = ["src", "."]`` config — no per-file sys.path hack.
"""

from __future__ import annotations

import pytest

from scripts.corrector_range import (
    HEADER_OFFSET,
    RowRange,
    index_for_sheet_row,
    parse_row_range,
    sheet_row_for_index,
)


# --- the offset, in both directions --------------------------------------- #


def test_header_offset_is_two():
    assert HEADER_OFFSET == 2


@pytest.mark.parametrize(
    "index, sheet_row",
    [(0, 2), (1, 3), (25, 27), (40, 42), (199, 201)],
)
def test_index_and_sheet_row_are_inverses(index, sheet_row):
    assert sheet_row_for_index(index) == sheet_row
    assert index_for_sheet_row(sheet_row) == index


def test_sheet_row_rejects_negative_index():
    with pytest.raises(ValueError):
        sheet_row_for_index(-1)


def test_index_for_sheet_row_rejects_header_and_above():
    # Row 1 is the header and rows below it do not exist; neither maps to a record.
    with pytest.raises(ValueError):
        index_for_sheet_row(1)
    with pytest.raises(ValueError):
        index_for_sheet_row(0)
    # Row 2 is the first data record.
    assert index_for_sheet_row(2) == 0


# --- parse_row_range: the documented grammar ------------------------------ #


def test_empty_spec_is_whole_sheet():
    r = parse_row_range(None)
    assert r == RowRange(start_index=0, count=None)
    assert parse_row_range("") == r
    assert parse_row_range("   ") == r


def test_empty_spec_with_limit_caps_count():
    assert parse_row_range(None, limit=200) == RowRange(start_index=0, count=200)


def test_first_n_form():
    r = parse_row_range(":25")
    assert r == RowRange(start_index=0, count=25)
    # First 25 records are sheet rows 2..26.
    assert r.start_sheet_row == 2
    assert r.sheet_row(24) == 26


def test_first_n_form_respects_smaller_limit():
    assert parse_row_range(":25", limit=10) == RowRange(start_index=0, count=10)
    # A larger limit does not widen an explicit count.
    assert parse_row_range(":25", limit=99) == RowRange(start_index=0, count=25)


def test_open_ended_form():
    r = parse_row_range("201-")
    assert r == RowRange(start_index=199, count=None)
    assert r.start_sheet_row == 201


def test_open_ended_form_with_limit_sets_count():
    # This is the issue's "--rows 201- --limit 50" example.
    r = parse_row_range("201-", limit=50)
    assert r == RowRange(start_index=199, count=50)
    assert r.start_sheet_row == 201
    assert r.sheet_row(49) == 250


# --- the 27-42 case: correct mapping vs the shipped off-by-one ------------- #


def test_27_42_maps_to_the_correct_slice():
    r = parse_row_range("27-42")
    assert r == RowRange(start_index=25, count=16)
    # Sheet rows 27..42 inclusive are record indices 25..40.
    records = list(range(100))
    assert r.select(records) == list(range(25, 41))
    assert r.start_sheet_row == 27
    assert r.sheet_row(0) == 27
    assert r.sheet_row(15) == 42


def test_27_42_is_not_the_old_off_by_one_slice():
    # run_smart_corrector_27_42.py used all_records[26:42] (indices 26..41) but
    # wrote results to rows 27..42, so it read row 28 and wrote row 27. The
    # correct slice for "rows 27-42" is [25:41].
    r = parse_row_range("27-42")
    records = list(range(100))
    correct = r.select(records)
    old_buggy = records[26:42]
    assert correct != old_buggy
    assert correct[0] == 25  # record index of sheet row 27
    assert old_buggy[0] == 26  # what the old script read for "row 27"


def test_single_row_range():
    r = parse_row_range("27-27")
    assert r == RowRange(start_index=25, count=1)
    assert r.select(list(range(100))) == [25]


# --- RowRange behaviour ---------------------------------------------------- #


def test_select_clamps_to_available_records():
    r = parse_row_range("201-", limit=50)
    # Only 5 records exist past the start; select must not over-read.
    five = list(range(199, 204))
    records = list(range(204))
    assert r.select(records) == five
    assert r.stop_index(204) == 204


def test_select_open_ended_runs_to_the_end():
    r = parse_row_range("201-")
    records = list(range(250))
    assert r.select(records) == list(range(199, 250))


def test_sheet_row_walks_with_local_index():
    r = parse_row_range("100-")
    assert [r.sheet_row(i) for i in range(3)] == [100, 101, 102]


def test_resume_offset_as_start_index():
    # _200 resumes by re-entering at a record index; RowRange models that as
    # the start index, and the sheet row stays correct.
    r = RowRange(start_index=24, count=None)  # resume after 24 processed records
    assert r.start_sheet_row == 26
    assert r.select(list(range(30))) == list(range(24, 30))


# --- rejected / malformed specs ------------------------------------------- #


@pytest.mark.parametrize("spec", ["42", "abc", "1.5", ":", "-", "27-x", "x-42"])
def test_malformed_specs_raise(spec):
    with pytest.raises(ValueError):
        parse_row_range(spec)


def test_bare_integer_is_rejected_as_ambiguous():
    # "42" could mean "first 42" or "row 42"; force the caller to be explicit.
    with pytest.raises(ValueError):
        parse_row_range("42")


@pytest.mark.parametrize(
    "spec",
    [
        "+27-42",  # leading sign
        "27-+42",
        "007-009",  # leading zeros — int() would silently normalise to 7..9
        ":007",
        "27-009",
        "1_0-20",  # underscore int literal — int() would read as 10
        ":1_0",
    ],
)
def test_non_canonical_integers_are_rejected(spec):
    # The whole point of this module is to kill silently-wrong row math, so a
    # token that int() would accept but the grammar never sanctioned must raise
    # rather than parse to a different row than it reads as.
    with pytest.raises(ValueError):
        parse_row_range(spec)


def test_inverted_range_raises():
    with pytest.raises(ValueError):
        parse_row_range("42-27")


def test_start_row_below_first_data_row_raises():
    # Row 1 is the header; a range cannot start there.
    with pytest.raises(ValueError):
        parse_row_range("1-10")


def test_zero_and_negative_limits_raise():
    with pytest.raises(ValueError):
        parse_row_range(":25", limit=0)
    with pytest.raises(ValueError):
        parse_row_range(":25", limit=-5)


def test_zero_first_n_raises():
    with pytest.raises(ValueError):
        parse_row_range(":0")


def test_row_range_rejects_bad_construction():
    with pytest.raises(ValueError):
        RowRange(start_index=-1)
    with pytest.raises(ValueError):
        RowRange(start_index=0, count=0)
    with pytest.raises(ValueError):
        RowRange(start_index=0, count=-3)
