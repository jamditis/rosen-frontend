# -*- coding: utf-8 -*-
"""Boundary checks for the current submission runtime."""

import pathlib

_BACKEND = pathlib.Path(__file__).resolve().parents[1]


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
