"""Regression tests for the legacy clipping batch integrator."""

from integrate_clippings import CSV_COLUMNS, convert_to_csv_row


def test_clipping_rows_publish_with_explicit_review_state():
    row = convert_to_csv_row(
        {
            "title": "A clipping",
            "publication_date": "07/20/2026",
            "original_publication": "Local News",
        },
        "CLIP-00001",
    )

    assert CSV_COLUMNS[-2:] == ["low_confidence", "needs_review"]
    assert list(row) == CSV_COLUMNS
    assert row["verified"] == "TRUE"
    assert row["low_confidence"] == ""
    assert row["needs_review"] == "true"
