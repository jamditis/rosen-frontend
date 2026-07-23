# -*- coding: utf-8 -*-
"""Boundary checks for the current submission runtime."""

import pathlib

_BACKEND = pathlib.Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _BACKEND.parent


def test_action_scripts_do_not_import_the_legacy_flask_package():
    action_scripts = [
        "scripts/process_submission.py",
        "scripts/sync_sheet_to_archive.py",
    ]
    legacy_import_markers = (
        "from submission_server",
        "import submission_server",
    )

    for rel in action_scripts:
        source = (_BACKEND / rel).read_text(encoding="utf-8")
        assert not any(marker in source for marker in legacy_import_markers), (
            f"{rel} should import submission_runtime helpers, not the legacy "
            "submission_server Flask package"
        )


def test_legacy_flask_server_has_no_active_runtime_surface():
    legacy_paths = [
        _BACKEND / "submission_server",
        _PROJECT_ROOT / "automation" / "SETUP.md",
        _PROJECT_ROOT / "automation" / "systemd" / "rosen-submission-exec.sh",
        _PROJECT_ROOT / "automation" / "systemd" / "rosen-submission.env.example",
        _PROJECT_ROOT / "automation" / "systemd" / "rosen-submission.service",
    ]

    present = [str(path.relative_to(_PROJECT_ROOT)) for path in legacy_paths if path.exists()]
    assert present == [], f"deprecated Flask runtime surfaces remain active: {present}"


def test_flask_is_not_a_backend_runtime_dependency():
    pyproject = (_BACKEND / "pyproject.toml").read_text(encoding="utf-8")
    assert '"flask ' not in pyproject.lower()
