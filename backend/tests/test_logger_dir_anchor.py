# -*- coding: utf-8 -*-
"""Tests for #357 — ArchiveLogger must anchor a relative log_dir to the project
root, not the current working directory.

``init_logger("<bare name>")`` used to build its log tree under
``Path("<bare name>")``, which resolves relative to cwd, so running a script from
anywhere but ``backend/`` scattered the daily/weekly/monthly/errors/performance
tree into that cwd. The fix resolves a *relative* log_dir against
``rosen_scraper.path_utils.find_project_root``; an *absolute* log_dir is honored
unchanged and never consults the project root, so callers that already pass an
absolute path keep working in any environment.
"""

from __future__ import annotations

from pathlib import Path

import rosen_scraper.logger as logger_mod
from rosen_scraper.logger import init_logger


def test_relative_log_dir_anchored_to_project_root(tmp_path, monkeypatch):
    # Pin a fake project root and run from an unrelated cwd, so a cwd-relative
    # anchor and the project-root anchor land in clearly different places.
    fake_root = tmp_path / "backend_root"
    fake_root.mkdir()
    cwd = tmp_path / "elsewhere"
    cwd.mkdir()
    monkeypatch.setattr(logger_mod, "find_project_root", lambda: fake_root)
    monkeypatch.chdir(cwd)

    init_logger("rel357")

    expected = (fake_root / "rel357").resolve()
    assert logger_mod._global_logger.log_dir.resolve() == expected
    # The log tree was created under the project root...
    assert (expected / "daily").is_dir()
    # ...and NOT scattered into the cwd (the #357 bug).
    assert not (cwd / "rel357").exists()


def test_absolute_log_dir_is_honored(tmp_path, monkeypatch):
    # An absolute log_dir must pass through unchanged, and must not consult the
    # project root at all -- so callers passing an absolute path (the existing
    # logger tests, AI-write scripts) keep working even where no project root is
    # locatable.
    sentinel = tmp_path / "abs_logs"

    def _boom():
        raise AssertionError(
            "find_project_root must not be called for an absolute log_dir"
        )

    monkeypatch.setattr(logger_mod, "find_project_root", _boom)

    init_logger(str(sentinel))

    assert logger_mod._global_logger.log_dir == Path(str(sentinel))
    assert (sentinel / "daily").is_dir()
