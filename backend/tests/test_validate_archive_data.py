"""Regression tests for the archive data validator."""

from pathlib import Path
import importlib.util


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate_archive_data.py"
SPEC = importlib.util.spec_from_file_location("validate_archive_data", SCRIPT_PATH)
assert SPEC and SPEC.loader
validate_archive_data = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validate_archive_data)


def test_thread_ids_are_valid_archive_ids():
    """Thread containers use a documented archive ID prefix."""
    assert validate_archive_data.validate_id_format("THREAD-00001") == (True, None)


def test_entity_coverage_uses_the_archive_population(monkeypatch):
    """Archive extraction coverage must not use unrelated social rows as its denominator."""
    archive_rows = [{"id": "RECORD-00001"}, {"id": "RECORD-00002"}]
    social_rows = [{"id": f"TWTR-{index:05d}"} for index in range(100)]
    relationship_rows = [{"source_record_id": "RECORD-00001"}]

    def fake_load_csv(path):
        if path == validate_archive_data.ARCHIVE_CSV:
            return archive_rows, None
        if path == validate_archive_data.SOCIAL_CSV:
            return social_rows, None
        if path == validate_archive_data.RELATIONSHIPS_CSV:
            return relationship_rows, None
        raise AssertionError(f"Unexpected path: {path}")

    monkeypatch.setattr(validate_archive_data, "load_csv", fake_load_csv)
    report = validate_archive_data.ValidationReport()

    validate_archive_data.validate_entity_coverage(report)

    assert report.stats["Archive records with entities"] == "1/2 (50.0%)"
