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
"""

import os
import shutil
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def atomic_csv_write(path, encoding="utf-8"):
    """Yield a writable handle that atomically replaces ``path`` on success.

    Drop-in replacement for ``open(path, "w", encoding=..., newline="")``: the
    handle is opened with ``newline=""`` so csv.writer / csv.DictWriter behave
    correctly. If the ``with`` block raises, ``path`` is left exactly as it was
    and the temp file is removed.
    """
    path = Path(path)
    tmp = path.with_name(path.name + ".tmp")
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
