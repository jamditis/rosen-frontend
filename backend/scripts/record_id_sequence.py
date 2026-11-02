"""Reserve canonical article IDs before writes; deletion never frees an ID."""

import fcntl
import json
import os
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path


def sequence_path(csv_path):
    return Path(csv_path).with_name("record-id-sequence.json")


def numeric_id(record_id):
    match = re.fullmatch(r"RECORD-(\d+)", record_id)
    return int(match[1]) if match else 0


def high_water(csv_path, existing_ids=()):
    """Missing or malformed state requires recovery, never an inferred reset."""
    path = sequence_path(csv_path)
    if path.is_symlink():
        raise ValueError("Record ID sequence must not be a symlink")
    state = json.loads(path.read_text(encoding="utf-8"))
    if (
        not isinstance(state, dict)
        or set(state) != {"version", "high_water"}
        or state["version"] != 1
        or type(state["high_water"]) is not int
        or state["high_water"] < 0
    ):
        raise ValueError("Invalid record ID sequence; restore its verified state")
    return max(state["high_water"], *(numeric_id(rid) for rid in existing_ids), 0)


def assert_no_pending_capture(csv_path):
    pending = (
        Path(csv_path).parent.parent
        / "preservation/pressthink/versions.jsonl.pending.json"
    )
    if pending.exists():
        raise ValueError(
            "Recover the pending PressThink transaction before other CSV writes"
        )


@contextmanager
def locked_sequence(csv_path):
    path = sequence_path(csv_path)
    with path.with_name(path.name + ".lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield path


def advance(csv_path, value, *, expected=None):
    """Persist a monotonic reservation. Gaps after a failed write are safe."""
    with locked_sequence(csv_path) as path:
        current = high_water(csv_path)
        if expected is not None and current != expected:
            raise ValueError(
                "Record ID reservations changed; retry from current source"
            )
        if value <= current:
            return
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as out:
                temporary = Path(out.name)
                out.write(
                    (json.dumps({"version": 1, "high_water": value}) + "\n").encode()
                )
                out.flush()
                os.fchmod(out.fileno(), 0o644)
                os.fsync(out.fileno())
            os.replace(temporary, path)
            descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()


def reserve(csv_path, existing_ids, preferred=""):
    assert_no_pending_capture(csv_path)
    current = high_water(csv_path)
    highest = high_water(csv_path, existing_ids)
    number = numeric_id(preferred)
    chosen = number if number > highest else highest + 1
    advance(csv_path, chosen, expected=current)
    return f"RECORD-{chosen:05d}"
