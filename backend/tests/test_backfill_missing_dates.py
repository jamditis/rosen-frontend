# -*- coding: utf-8 -*-
"""Tests for the CSV date-override script moved into the backfill package (#189).

The script writes hand-checked dates into the archive CSV. It had no test
before the move, so the rules it encodes are locked in here: only empty dates
are filled, only listed record ids are touched, an empty override means "leave
this record undated", and a backup is written before any change.
"""

from __future__ import annotations

import csv

from scripts.backfill import backfill_missing_dates

FIELDS = ["id", "title", "publication_date"]


def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def read_csv(path):
    with open(path, "r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def test_default_csv_points_at_the_repository_archive():
    # The move one directory deeper changed how far up the repo root is.
    assert backfill_missing_dates.DEFAULT_CSV.name == "archive_records-public.csv"
    assert backfill_missing_dates.DEFAULT_CSV.exists()


def test_an_empty_date_is_filled_from_the_override_table(tmp_path):
    csv_path = write_csv(
        tmp_path / "records.csv",
        [{"id": "RECORD-00068", "title": "A book", "publication_date": ""}],
    )

    assert backfill_missing_dates.backfill_dates(csv_path) == 1
    assert read_csv(csv_path)[0]["publication_date"] == "1999-01-01"


def test_an_existing_date_is_never_overwritten(tmp_path):
    csv_path = write_csv(
        tmp_path / "records.csv",
        [{"id": "RECORD-00068", "title": "A book", "publication_date": "2001-05-05"}],
    )

    assert backfill_missing_dates.backfill_dates(csv_path) == 0
    assert read_csv(csv_path)[0]["publication_date"] == "2001-05-05"


def test_a_blank_override_leaves_the_record_undated(tmp_path):
    csv_path = write_csv(
        tmp_path / "records.csv",
        [{"id": "RECORD-00072", "title": "A profile", "publication_date": ""}],
    )

    assert backfill_missing_dates.backfill_dates(csv_path) == 0
    assert read_csv(csv_path)[0]["publication_date"] == ""


def test_records_outside_the_override_table_are_untouched(tmp_path):
    csv_path = write_csv(
        tmp_path / "records.csv",
        [{"id": "RECORD-99999", "title": "Unlisted", "publication_date": ""}],
    )

    assert backfill_missing_dates.backfill_dates(csv_path) == 0
    assert read_csv(csv_path)[0]["publication_date"] == ""


def test_a_backup_is_written_only_when_the_csv_changes(tmp_path):
    unchanged = write_csv(
        tmp_path / "unchanged.csv",
        [{"id": "RECORD-99999", "title": "Unlisted", "publication_date": ""}],
    )
    backfill_missing_dates.backfill_dates(unchanged)
    assert list(tmp_path.glob("unchanged_backup_*.csv")) == []

    changed = write_csv(
        tmp_path / "changed.csv",
        [{"id": "RECORD-00069", "title": "A listing", "publication_date": ""}],
    )
    backfill_missing_dates.backfill_dates(changed)
    assert len(list(tmp_path.glob("changed_backup_*.csv"))) == 1


def test_other_columns_survive_the_rewrite(tmp_path):
    csv_path = write_csv(
        tmp_path / "records.csv",
        [
            {"id": "RECORD-00068", "title": "A book", "publication_date": ""},
            {
                "id": "RECORD-00500",
                "title": "Kept, with a comma",
                "publication_date": "",
            },
        ],
    )

    backfill_missing_dates.backfill_dates(csv_path)
    rows = read_csv(csv_path)

    assert [row["id"] for row in rows] == ["RECORD-00068", "RECORD-00500"]
    assert rows[1]["title"] == "Kept, with a comma"
