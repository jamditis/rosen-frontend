# -*- coding: utf-8 -*-
"""Resolve shared Google Sheets service-account configuration without SDK imports."""

from __future__ import annotations

import os
from typing import Literal, Mapping, NamedTuple


CredentialSourceKind = Literal["inline_json", "file_path", "unset"]


class ServiceAccountSource(NamedTuple):
    """One resolved service-account source from the shared environment ladder."""

    kind: CredentialSourceKind
    value: str


def resolve_service_account_source(
    environ: Mapping[str, str] | None = None,
) -> ServiceAccountSource:
    """Resolve inline JSON before a file path, returning ``unset`` if neither exists."""
    env = os.environ if environ is None else environ
    key_json = env.get("ROSEN_SHEETS_SA_KEY_JSON", "").strip()
    if key_json:
        return ServiceAccountSource("inline_json", key_json)

    key_path = env.get("ROSEN_SHEETS_SA_KEY", "").strip()
    if key_path:
        return ServiceAccountSource("file_path", key_path)

    return ServiceAccountSource("unset", "")
