"""
Atomic, backup-first CSV writes for the data-maintenance scripts.

The one-off scripts in this directory rewrite archive_records-public.csv (and a
couple of sibling CSVs) in place. A plain ``open(path, "w")`` truncates the file
the instant it is opened, so a crash mid-write — or a buggy re-run — destroys
the only copy of the archive's source data. ``atomic_csv_write`` makes those
rewrites safe:

  1. The current file is copied to ``<name>.bak`` before anything is written.
  2. New content is written to a ``<name>.tmp`` sibling.
  3. ``os.replace`` swaps the temp file into place in a single atomic step.

A crash leaves the original file untouched (only the discarded .tmp is lost),
and the .bak gives one level of undo for an unwanted run. See issue #145.

The archive-specific read/write functions require Node and the root npm
dependencies. They use the exporter parser and preserve untouched row bytes,
including bare LF within CRLF-delimited records; Python csv cannot safely parse
those files (#870).
"""

import hashlib
import json
import os
import shutil
import subprocess
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def atomic_csv_write(path, encoding="utf-8", expected_sha256=None):
    """Yield a writable handle that atomically replaces ``path`` on success.

    Drop-in replacement for ``open(path, "w", encoding=..., newline="")``: the
    handle is opened with ``newline=""`` so csv.writer / csv.DictWriter behave
    correctly. If the ``with`` block raises, ``path`` is left exactly as it was
    and the temp file is removed.
    """
    path = Path(path)
    tmp = path.with_name(path.name + ".tmp")
    if expected_sha256 is not None:
        try:
            current_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        except FileNotFoundError as error:
            raise RuntimeError(
                "CSV changed during maintenance; retry with the current file"
            ) from error
        if current_sha256 != expected_sha256:
            raise RuntimeError(
                "CSV changed during maintenance; retry with the current file"
            )
    if path.exists():
        shutil.copy2(path, path.with_name(path.name + ".bak"))
    handle = open(tmp, "w", encoding=encoding, newline="")
    try:
        yield handle
        handle.close()
        os.replace(tmp, path)
    except BaseException:
        handle.close()
        if tmp.exists():
            tmp.unlink()
        raise


def _archive_csv_bridge(operation, path, payload=None):
    """Run the Node CSV bridge without text-mode newline conversion."""
    bridge = Path(__file__).parent / "lib" / "python-csv-maintenance.js"
    try:
        result = subprocess.run(
            ["node", str(bridge), operation, str(path)],
            input=None if payload is None else json.dumps(payload).encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError(
            "Archive CSV maintenance requires Node.js and the root npm dependencies. "
            "Install Node.js, then run `npm ci` from the repository root."
        ) from error
    except subprocess.CalledProcessError as error:
        detail = error.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(
            "Archive CSV maintenance bridge failed. Run `npm ci` from the repository "
            f"root and retry. Bridge output: {detail or 'no diagnostic'}"
        ) from error
    return result.stdout


def read_archive_csv(path):
    """Read columns and records with the same parser as the Node exporter."""
    return json.loads(_archive_csv_bridge("read", path))


def write_archive_csv(path, fieldnames, rows):
    """Validate raw-row surgery before the existing backup and atomic replace."""
    path = Path(path)
    response = _archive_csv_bridge("render", path, [fieldnames, rows])
    source_sha256, separator, result = response.partition(b"\n")
    if (
        not separator
        or len(source_sha256) != 64
        or any(byte not in b"0123456789abcdef" for byte in source_sha256)
    ):
        raise RuntimeError("Archive CSV maintenance bridge returned invalid metadata")
    expected_sha256 = source_sha256.decode("ascii")
    current = path.read_bytes()
    if hashlib.sha256(current).hexdigest() != expected_sha256:
        raise RuntimeError("CSV changed during maintenance; retry with the current file")
    if result == current:
        return
    # This second comparison narrows the write boundary under the maintenance
    # scripts' single-writer contract. It does not provide a cross-process lock.
    with atomic_csv_write(path, expected_sha256=expected_sha256) as destination:
        destination.write(result.decode("utf-8"))
