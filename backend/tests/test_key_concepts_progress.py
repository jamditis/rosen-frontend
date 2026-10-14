"""Durable key-concept progress at the Google Sheets write boundary."""

from __future__ import annotations

import copy
import json
import re

import pytest

from rosen_scraper import key_concepts_progress as progress
from rosen_scraper import key_concepts_updater as kc
from scripts.diagnostics.data_deduper import clean_and_dedupe_cell


class _Response:
    def __init__(self, text: str):
        self.text = text


class _Model:
    def __init__(self, concepts=None, recommendations=""):
        self.concepts = ["Mindcasting"] if concepts is None else concepts
        self.recommendations = recommendations
        self.prompts = []

    def generate_content(self, prompt):
        self.prompts.append(prompt)
        return _Response(
            json.dumps(
                {
                    "concepts": self.concepts,
                    "recommendations": self.recommendations,
                }
            )
        )


def _column_number(cell: str) -> int:
    letters = re.fullmatch(r"([A-Z]+)[0-9]+", cell).group(1)
    result = 0
    for letter in letters:
        result = result * 26 + ord(letter) - ord("A") + 1
    return result


class _Worksheet:
    def __init__(
        self,
        values,
        *,
        col_count=None,
        fail_batch=False,
        fail_growth=False,
        raise_after_batch=False,
    ):
        self.values = copy.deepcopy(values)
        self.col_count = col_count or max(map(len, values), default=0)
        self.fail_batch = fail_batch
        self.fail_growth = fail_growth
        self.raise_after_batch = raise_after_batch
        self.add_cols_calls = []
        self.batch_updates = []

    def get_all_values(self):
        return copy.deepcopy(self.values)

    def add_cols(self, columns):
        self.add_cols_calls.append(columns)
        if self.fail_growth:
            raise RuntimeError("grid growth failed")
        self.col_count += columns

    def batch_update(self, data, raw=True):
        if self.fail_batch:
            raise RuntimeError("atomic sheet write failed")
        next_values = copy.deepcopy(self.values)
        for update in data:
            cell = update["range"]
            match = re.fullmatch(r"[A-Z]+([0-9]+)", cell)
            assert match, f"test fake only accepts single-cell ranges: {cell}"
            row = int(match.group(1))
            column = _column_number(cell)
            assert column <= self.col_count, "write exceeds worksheet grid"
            while len(next_values) < row:
                next_values.append([])
            while len(next_values[row - 1]) < column:
                next_values[row - 1].append("")
            next_values[row - 1][column - 1] = update["values"][0][0]
        self.values = next_values
        self.batch_updates.append(copy.deepcopy(data))
        if self.raise_after_batch:
            raise RuntimeError("response lost after atomic apply")
        return {"totalUpdatedCells": len(data)}


class _Spreadsheet:
    def __init__(self, worksheet):
        self.worksheet_value = worksheet

    def worksheet(self, name):
        assert name == "archive_records"
        return self.worksheet_value


def _header(*, receipt=True):
    columns = ["id", "raw_text", "key_concepts", "notes", "colQ_changes"]
    if receipt:
        columns.append(progress.TASK_RECEIPT_COLUMN)
    return columns


def _row(record_id, marker, *, concepts="", notes="", changes="", receipt=""):
    return [record_id, marker * 200, concepts, notes, changes, receipt]


def _schema(*concepts):
    return {"taxonomy": {"key_concepts": list(concepts or ("Mindcasting",))}}


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(kc.time, "sleep", lambda seconds: None)


def _run(
    worksheet, model, *, schema=None, limit=1, dry_run=False, force_reprocess=False
):
    return kc.process_rows(
        _Spreadsheet(worksheet),
        model=model,
        schema=schema or _schema(),
        limit=limit,
        dry_run=dry_run,
        force_reprocess=force_reprocess,
        durable_progress=True,
    )


def test_small_live_runs_resume_by_receipt_after_process_restart():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
            _row("RECORD-00002", "b")[:-1],
        ]
    )

    first_model = _Model()
    first = _run(worksheet, first_model)
    assert first["processed"] == 1
    assert len(first_model.prompts) == 1
    assert "a" * 200 in first_model.prompts[0]

    assert worksheet.values[0][-1] == progress.TASK_RECEIPT_COLUMN
    receipt = json.loads(worksheet.values[1][-1])
    assert receipt["taskVersion"] == progress.KEY_CONCEPT_TASK_VERSION
    assert receipt["expectedConceptsHash"] == progress._sha256_text("Mindcasting")
    assert worksheet.values[1][2] == "Mindcasting"
    assert worksheet.add_cols_calls == [1]
    assert len(worksheet.batch_updates) == 1
    assert {update["range"] for update in worksheet.batch_updates[0]} == {
        "C2",
        "F1",
        "F2",
    }

    restarted_model = _Model()
    second = _run(worksheet, restarted_model)
    assert second["processed"] == 1
    assert len(restarted_model.prompts) == 1
    assert "b" * 200 in restarted_model.prompts[0]

    complete = _run(worksheet, _Model())
    assert complete["processed"] == 0
    assert worksheet.add_cols_calls == [1]


def test_default_limit_processes_one_batch_and_zero_is_unlimited():
    rows = [_header()]
    rows.extend(_row(f"RECORD-{index:05d}", "a") for index in range(1, 102))
    worksheet = _Worksheet(rows)
    default_model = _Model()

    limited = _run(worksheet, default_model, limit=None)

    assert limited["processed"] == kc.BATCH_SIZE
    assert len(default_model.prompts) == kc.BATCH_SIZE
    assert worksheet.values[100][-1]
    assert worksheet.values[101][-1] == ""

    unlimited_model = _Model()
    unlimited = _run(worksheet, unlimited_model, limit=0)

    assert unlimited["processed"] == 1
    assert len(unlimited_model.prompts) == 1
    assert worksheet.values[101][-1]


def test_negative_limit_fails_before_model_or_sheet_write():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
        ]
    )
    model = _Model()

    with pytest.raises(ValueError, match="limit must be zero or greater"):
        _run(worksheet, model, limit=-1)

    assert model.prompts == []
    assert worksheet.add_cols_calls == []
    assert worksheet.batch_updates == []


def test_dry_run_does_not_create_header_or_receipt():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
        ]
    )

    preview = _run(worksheet, _Model(), dry_run=True)
    assert preview["processed"] == 1
    assert worksheet.batch_updates == []
    assert worksheet.add_cols_calls == []
    assert worksheet.values[0] == _header(receipt=False)

    live_model = _Model()
    _run(worksheet, live_model)
    assert len(live_model.prompts) == 1
    assert worksheet.values[0][-1] == progress.TASK_RECEIPT_COLUMN


def test_fresh_receipt_column_preserves_unlabeled_data_and_grows_full_grid():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1] + ["curator-private"],
        ],
        col_count=6,
    )

    _run(worksheet, _Model())

    assert worksheet.add_cols_calls == [1]
    assert worksheet.col_count == 7
    assert worksheet.values[1][5] == "curator-private"
    assert worksheet.values[0][6] == progress.TASK_RECEIPT_COLUMN
    assert {update["range"] for update in worksheet.batch_updates[0]} == {
        "C2",
        "G1",
        "G2",
    }


def test_grid_growth_failure_stops_before_model_call():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
        ],
        col_count=5,
        fail_growth=True,
    )
    model = _Model()

    with pytest.raises(kc.SheetWriteError, match="grid.*grid growth failed"):
        _run(worksheet, model)

    assert model.prompts == []
    assert worksheet.batch_updates == []
    assert worksheet.values[0] == _header(receipt=False)


def test_empty_spacer_rows_are_ignored_but_nonempty_rows_require_ids():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
            ["", "", "", "", ""],
            _row("RECORD-00002", "b")[:-1],
        ]
    )
    model = _Model()

    summary = _run(worksheet, model, limit=2)

    assert summary["processed"] == 2
    assert len(model.prompts) == 2

    missing_id = _Worksheet(
        [
            _header(receipt=False),
            ["", "nonempty source", "", "", ""],
        ]
    )
    missing_id_model = _Model()
    with pytest.raises(ValueError, match="row 2.*missing stable id"):
        _run(missing_id, missing_id_model)
    assert missing_id_model.prompts == []


def test_dedup_rewrite_stays_complete_but_curator_edit_invalidates_receipt():
    worksheet = _Worksheet(
        [
            _header(),
            _row(
                "RECORD-00001",
                "a",
                concepts="Mindcasting; False balance, Mindcasting",
            ),
        ]
    )
    first_model = _Model(recommendations="N/A")
    _run(worksheet, first_model)

    assert "Current assigned concepts: False balance, Mindcasting" in (
        first_model.prompts[0]
    )
    worksheet.values[1][2] = clean_and_dedupe_cell(worksheet.values[1][2])
    assert worksheet.values[1][2] == "False balance, Mindcasting"

    restarted_model = _Model()
    complete = _run(worksheet, restarted_model)

    assert complete["processed"] == 0
    assert restarted_model.prompts == []

    worksheet.values[1][2] = "False balance"
    model = _Model(concepts=["False balance"], recommendations="N/A")
    _run(worksheet, model)

    assert len(model.prompts) == 1
    assert "a" * 200 in model.prompts[0]
    assert "Current assigned concepts: False balance" in model.prompts[0]


def test_taxonomy_rule_model_and_force_changes_invalidate_receipt(monkeypatch):
    for change in ("taxonomy", "rule", "model", "force"):
        monkeypatch.setattr(kc, "KEY_CONCEPT_RULE_VERSION", "1.0.0")
        monkeypatch.setattr(kc, "KEY_CONCEPT_MODEL_VERSION", "gemini-2.0-flash-lite")
        worksheet = _Worksheet(
            [
                _header(),
                _row("RECORD-00001", "a"),
            ]
        )
        _run(worksheet, _Model())
        model = _Model(recommendations="N/A")
        if change == "taxonomy":
            _run(worksheet, model, schema=_schema("Mindcasting", "False balance"))
        elif change == "rule":
            monkeypatch.setattr(kc, "KEY_CONCEPT_RULE_VERSION", "2.0.0")
            _run(worksheet, model)
        elif change == "model":
            monkeypatch.setattr(kc, "KEY_CONCEPT_MODEL_VERSION", "gemini-next")
            _run(worksheet, model)
        else:
            _run(worksheet, model, force_reprocess=True)
        assert len(model.prompts) == 1, change
        if change == "force":
            restarted = _Model()
            summary = _run(worksheet, restarted, force_reprocess=True)
            assert summary["processed"] == 0
            assert restarted.prompts == []


def test_changed_source_text_invalidates_receipt():
    worksheet = _Worksheet(
        [
            _header(),
            _row("RECORD-00001", "a"),
        ]
    )
    _run(worksheet, _Model())
    worksheet.values[1][1] = "changed source " * 20

    model = _Model(recommendations="N/A")
    _run(worksheet, model)
    assert len(model.prompts) == 1
    assert "changed source" in model.prompts[0]


def test_atomic_batch_failure_writes_neither_output_nor_receipt():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
        ],
        fail_batch=True,
    )
    model = _Model()

    with pytest.raises(kc.SheetWriteError, match="atomic sheet write failed"):
        _run(worksheet, model)

    assert worksheet.values[0] == _header(receipt=False)
    assert worksheet.values[1][2] == ""
    assert worksheet.batch_updates == []


def test_restart_skips_receipt_when_atomic_write_landed_before_response_error():
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
        ],
        raise_after_batch=True,
    )
    first_model = _Model()

    with pytest.raises(kc.SheetWriteError, match="response lost after atomic apply"):
        _run(worksheet, first_model)

    assert len(first_model.prompts) == 1
    assert worksheet.values[0][-1] == progress.TASK_RECEIPT_COLUMN
    assert worksheet.values[1][-1]

    worksheet.raise_after_batch = False
    restarted_model = _Model()
    complete = _run(worksheet, restarted_model)

    assert complete["processed"] == 0
    assert restarted_model.prompts == []


def test_empty_model_result_is_recorded_as_a_durable_no_concepts_result():
    worksheet = _Worksheet(
        [
            _header(),
            _row("RECORD-00001", "a"),
            _row("RECORD-00002", "b"),
        ]
    )

    first = _run(worksheet, _Model(concepts=[]))
    assert first["gemini_calls"] == 1
    assert first["by_field"]["progress_receipt"] == 1
    assert json.loads(worksheet.values[1][-1])["expectedConceptsHash"] == (
        progress._sha256_text("")
    )

    restarted = _Model()
    _run(worksheet, restarted)
    assert len(restarted.prompts) == 1
    assert "b" * 200 in restarted.prompts[0]


def test_malformed_receipt_and_duplicate_ids_fail_before_model_call():
    malformed = _Worksheet(
        [
            _header(),
            _row("RECORD-00001", "a", receipt="not json"),
        ]
    )
    malformed_model = _Model()
    with pytest.raises(ValueError, match="row 2.*malformed"):
        _run(malformed, malformed_model)
    assert malformed_model.prompts == []

    invalid_hash_receipt = json.dumps(
        {
            "schemaVersion": progress.RECEIPT_SCHEMA_VERSION,
            "taskKey": "urn:rosen-stewardship:task:" + "0" * 64,
            "taskVersion": progress.KEY_CONCEPT_TASK_VERSION,
            "ruleVersion": progress.KEY_CONCEPT_RULE_VERSION,
            "modelVersion": progress.KEY_CONCEPT_MODEL_VERSION,
            "inputHash": "invalid",
            "contextHash": "0" * 64,
            "expectedConceptsHash": "0" * 64,
        }
    )
    invalid_hash = _Worksheet(
        [
            _header(),
            _row("RECORD-00001", "a", receipt=invalid_hash_receipt),
        ]
    )
    invalid_hash_model = _Model()
    with pytest.raises(ValueError, match="row 2.*inputHash"):
        _run(invalid_hash, invalid_hash_model)
    assert invalid_hash_model.prompts == []

    duplicates = _Worksheet(
        [
            _header(),
            _row("RECORD-00001", "a"),
            _row("RECORD-00001", "b"),
        ]
    )
    duplicate_model = _Model()
    with pytest.raises(ValueError, match="row 3.*duplicate.*RECORD-00001"):
        _run(duplicates, duplicate_model)
    assert duplicate_model.prompts == []


def test_receipt_copied_to_another_id_is_stale_without_blocking_original():
    worksheet = _Worksheet(
        [
            _header(),
            _row("RECORD-00001", "a"),
        ]
    )
    _run(worksheet, _Model())
    original_receipt = worksheet.values[1][-1]
    worksheet.values.append(
        _row("RECORD-00002", "a", concepts="Mindcasting", receipt=original_receipt)
    )
    model = _Model(recommendations="N/A")

    summary = _run(worksheet, model)

    assert summary["processed"] == 1
    assert len(model.prompts) == 1
    assert worksheet.values[1][-1] == original_receipt
    assert worksheet.values[2][-1] != original_receipt


def test_manual_cursor_mode_remains_available(monkeypatch):
    worksheet = _Worksheet(
        [
            _header(receipt=False),
            _row("RECORD-00001", "a")[:-1],
        ]
    )
    updates = []

    def update(values=None, range_name=None):
        updates.append((range_name, values))

    worksheet.update = update
    monkeypatch.setattr(
        kc,
        "load_progress",
        lambda: {
            "sheet_name": "archive_records",
            "last_processed_row": 1,
            "total_processed": 0,
            "total_updated": 0,
            "last_run": None,
        },
    )
    monkeypatch.setattr(kc, "save_progress", lambda progress: None)

    summary = kc.process_rows(
        _Spreadsheet(worksheet),
        model=_Model(),
        schema=_schema(),
        start_row=2,
        limit=1,
        resume=True,
        dry_run=False,
        durable_progress=False,
    )

    assert summary["processed"] == 1
    assert updates[0][0] == "C2"
    assert worksheet.batch_updates == []


@pytest.mark.parametrize(
    (
        "record_id",
        "raw_text",
        "current_concepts",
        "taxonomy",
        "force",
        "expected_input_hash",
        "expected_task_key",
    ),
    [
        (
            "RECORD-00001",
            "source text",
            "Mindcasting",
            ["Mindcasting", "False balance"],
            False,
            "502b56d028e67cf952171dc098201e27b004e5d858854621fa2e6848549fc4ed",
            "9ad57290e1fe09a601058a3d9149c2f955b49b1de55d8637af68c9fd121e1675",
        ),
        (
            "BSKY-90001",
            "“Press” \U0001f5de\ufe0f \U00010400",
            "Mindcasting \U0001f9e0",
            ["Mindcasting", "視点 \U0001f4f0"],
            True,
            "fcc2822b130bcdae008e025fd149228f45991b4cbaa145a812cc04b5b592ea95",
            "1e9a88b958de7a71b9c881443aecf1d686281df0821c4856360da867ba8bfe5b",
        ),
    ],
)
def test_task_key_matches_independent_canonical_fixtures(
    record_id,
    raw_text,
    current_concepts,
    taxonomy,
    force,
    expected_input_hash,
    expected_task_key,
):
    task = progress.key_concept_task(
        record_id,
        raw_text,
        current_concepts,
        taxonomy,
        force,
    )

    assert task.input_hash == expected_input_hash
    assert task.task_key == "urn:rosen-stewardship:task:" + expected_task_key
