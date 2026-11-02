"""Recover two prepared preservation outputs through a durable local journal."""

import base64
import hashlib
import json
import os
import tempfile
from pathlib import Path

MAX_JOURNAL_BYTES = 256_000_000


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    if path.is_symlink():
        raise ValueError("Preservation outputs must not be symlinks")
    return sha(path.read_bytes()) if path.exists() else None


def atomic_bytes(path, data):
    """Make the bytes durable before replacing one directory entry."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=path.parent, prefix=".pressthink-", delete=False
        ) as output:
            temporary = Path(output.name)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def sync_directory(path):
    if os.name == "posix":
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def journal_path(history_path):
    return history_path.with_name(history_path.name + ".pending.json")


def recover(csv_path, history_path):
    """Roll forward only when both targets match the recorded old/new bytes."""
    pending = journal_path(history_path)
    if not pending.exists():
        return
    if pending.is_symlink() or pending.stat().st_size > MAX_JOURNAL_BYTES:
        raise ValueError("Invalid PressThink recovery journal")
    value = json.loads(pending.read_bytes())
    if (
        value.get("version") != 1
        or value.get("csv_target") != str(csv_path.resolve())
        or value.get("history_target") != str(history_path.resolve())
    ):
        raise ValueError("PressThink recovery journal belongs to another output")
    data = {}
    for key in ("csv_before", "csv_after", "history_after"):
        data[key] = base64.b64decode(value[key], validate=True)
        if sha(data[key]) != value[key + "_sha256"]:
            raise ValueError("PressThink recovery journal hash mismatch")
    targets = [
        (csv_path, "csv_before_sha256", "csv_after"),
        (history_path, "history_before_sha256", "history_after"),
    ]
    for target, before_key, after_key in targets:
        if file_sha(target) not in {value[before_key], value[after_key + "_sha256"]}:
            raise ValueError(
                "Preservation target changed outside the pending transaction"
            )
    backup = csv_path.with_name(csv_path.name + ".bak")
    if file_sha(backup) != value["csv_before_sha256"]:
        atomic_bytes(backup, data["csv_before"])
    for target, before_key, after_key in targets:
        current = file_sha(target)
        if current == value[after_key + "_sha256"]:
            continue
        if current != value[before_key]:
            raise ValueError("Preservation target changed during transaction recovery")
        atomic_bytes(target, data[after_key])
    pending.unlink()
    sync_directory(pending.parent)


def commit(
    csv_path, history_path, *, csv_before, history_before, csv_after, history_after
):
    """Persist a complete recovery plan before changing either live output."""
    pending = journal_path(history_path)
    if pending.exists():
        raise ValueError("Recover the existing PressThink transaction first")
    history_path.parent.mkdir(parents=True, exist_ok=True)
    value = {
        "version": 1,
        "csv_target": str(csv_path.resolve()),
        "history_target": str(history_path.resolve()),
        "history_before_sha256": (
            sha(history_before) if history_before is not None else None
        ),
    }
    for key, data in {
        "csv_before": csv_before,
        "csv_after": csv_after,
        "history_after": history_after,
    }.items():
        value[key] = base64.b64encode(data).decode("ascii")
        value[key + "_sha256"] = sha(data)
    payload = json.dumps(value).encode("utf-8")
    if len(payload) > MAX_JOURNAL_BYTES:
        raise ValueError("PressThink transaction exceeds the reviewed byte bound")
    atomic_bytes(pending, payload)
    recover(csv_path, history_path)
