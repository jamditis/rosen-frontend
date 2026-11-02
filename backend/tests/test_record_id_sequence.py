"""Article identities survive retirement, failed writes and replay."""

import json

import pytest

from scripts import record_id_sequence as sequence


def seed(tmp_path, high_water=2):
    csv_path = tmp_path / "data" / "archive.csv"
    csv_path.parent.mkdir()
    sequence.sequence_path(csv_path).write_text(
        json.dumps({"version": 1, "high_water": high_water})
    )
    return csv_path


def test_retired_and_preferred_ids_are_never_reused(tmp_path):
    path = seed(tmp_path)
    assert sequence.reserve(path, {"RECORD-00001"}, "RECORD-00002") == "RECORD-00003"
    assert sequence.reserve(path, set()) == "RECORD-00004"
    assert sequence.reserve(path, set(), "RECORD-00009") == "RECORD-00009"
    assert sequence.reserve(path, set(), "RECORD-00009") == "RECORD-00010"


def test_replay_reloads_advanced_main_reservations(tmp_path):
    path = seed(tmp_path)
    tentative = sequence.reserve(path, {"RECORD-00001"})
    # Main reserved this ID, then its record was retired before the reset.
    sequence.sequence_path(path).write_text('{"version":1,"high_water":3}')
    assert sequence.reserve(path, {"RECORD-00001"}, tentative) == "RECORD-00004"


def test_current_csv_and_source_history_can_raise_the_floor(tmp_path):
    path = seed(tmp_path)
    assert (
        sequence.high_water(path, {"RECORD-00020", "RECORD-00007", "BSKY-90000"}) == 20
    )
    sequence.advance(path, 20, expected=2)
    assert sequence.reserve(path, set()) == "RECORD-00021"
    sequence.advance(path, 1)
    assert sequence.high_water(path) == 21


@pytest.mark.parametrize(
    "state",
    [
        None,
        "broken",
        '{"version":1,"high_water":true}',
        '{"version":1,"high_water":-1}',
    ],
)
def test_corrupt_or_missing_state_stops_before_output(tmp_path, state):
    path = seed(tmp_path)
    if state is None:
        sequence.sequence_path(path).unlink()
    else:
        sequence.sequence_path(path).write_text(state)
    before = sequence.sequence_path(path).read_bytes() if state is not None else None
    with pytest.raises((ValueError, FileNotFoundError)):
        sequence.reserve(path, set())
    assert not path.exists()
    assert (
        sequence.sequence_path(path).read_bytes() if state is not None else None
    ) == before


def test_pending_transaction_and_lost_race_fail_without_advancing(tmp_path):
    path = seed(tmp_path)
    pending = tmp_path / "preservation/pressthink/versions.jsonl.pending.json"
    pending.parent.mkdir(parents=True)
    pending.write_text("pending")
    with pytest.raises(ValueError, match="pending source"):
        sequence.reserve(path, set())
    assert sequence.high_water(path) == 2
    pending.unlink()
    sequence.advance(path, 4)
    with pytest.raises(ValueError, match="changed"):
        sequence.advance(path, 5, expected=2)
    assert sequence.high_water(path) == 4
