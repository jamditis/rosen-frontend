# -*- coding: utf-8 -*-
"""Compatibility wrapper for the legacy Flask submission package."""

from submission_runtime.sftp_push import (
    _PUSH_FILES as _PUSH_FILES,
    _read_env as _read_env,
    push_to_production as push_to_production,
)
