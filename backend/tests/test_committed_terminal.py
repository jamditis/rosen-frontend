# -*- coding: utf-8 -*-
"""Regression for #414 -- a record whose live push (SFTP) is not configured on
the runner must land in a TERMINAL status so the stuck-row sweeper stops
re-firing it forever.

``push_to_production()`` returns ``skipped`` when SFTP is not configured on the
runner. Before #414, ``process_submission`` wrote ``archived`` on skip, and
``sweep_stuck`` re-dispatches ``archived`` rows every 24h to force an SFTP retry
-- so a record on a runner without SFTP was re-fired on every sweep, each retry
skipping again. The fix writes the terminal ``committed`` status on skip (data
appended, just not pushed live) and keeps ``archived`` only for a genuine push
error that should be retried.

Two angles, both deliberately light:

- Behavioral on the sweeper: ``committed`` is terminal -- not in ``_THRESHOLDS``
  and never "stuck" at any age -- while ``archived`` stays a retry status.
  Importing ``sweep_stuck`` only pulls stdlib + ``requests`` (gspread / google
  are lazy-imported inside functions), so this runs without the heavy connector
  stack.
- Structural on ``process_submission``: importing it pulls gspread / Playwright
  at module load, so we read the source, confirm it compiles, and assert the
  skip branch writes ``committed`` while the genuine-error branch keeps
  ``archived``. Same pattern as the #432 credential-anchor test.
"""

from __future__ import annotations

import importlib
import pathlib
import sys

_BACKEND = pathlib.Path(__file__).resolve().parents[1]


def test_sweeper_treats_committed_as_terminal():
    """committed is never re-dispatched; archived still is (the retry path)."""
    sys.path.insert(0, str(_BACKEND / "scripts"))
    sweep_stuck = importlib.import_module("sweep_stuck")

    # committed is terminal: not a sweep status, and never "stuck" at any age.
    assert "committed" not in sweep_stuck._THRESHOLDS
    assert sweep_stuck._is_stuck("committed", 10 ** 9) is False

    # archived stays a retry status so a genuine push error still gets re-fired.
    assert "archived" in sweep_stuck._THRESHOLDS
    assert sweep_stuck._is_stuck("archived", 10 ** 9) is True


def test_skip_path_writes_committed_error_path_keeps_archived():
    """The skip branch writes committed; a real push error keeps archived."""
    src = (_BACKEND / "scripts" / "process_submission.py").read_text(encoding="utf-8")

    # The edit is syntactically valid Python.
    compile(src, "process_submission.py", "exec")

    # A skip (SFTP not configured) is gated on push.get('skipped') and writes
    # the terminal committed status -- both the writeback and the return value.
    assert "push.get('skipped')" in src
    assert "status='committed'" in src
    assert "'status': 'committed'" in src

    # A genuine push failure still writes/keeps archived so it is retried.
    assert "status='archived'" in src
    assert "'status': 'archived'" in src
