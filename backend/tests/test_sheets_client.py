# -*- coding: utf-8 -*-
"""Tests for rosen_scraper.sheets_client -- the shared env-first Sheets access.

The resolver must prefer ROSEN_SHEETS_SA_KEY_JSON (the CI secret), then
ROSEN_SHEETS_SA_KEY (a path), then a local fallback file -- the same order as
submission_server.sheets_callback, so the runner and the submission workflow
share one secret.
"""
from __future__ import annotations

import json

import pytest

from rosen_scraper import sheets_client


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    monkeypatch.delenv("ROSEN_SHEETS_SA_KEY_JSON", raising=False)
    monkeypatch.delenv("ROSEN_SHEETS_SA_KEY", raising=False)


def test_inline_json_wins(monkeypatch):
    seen = {}

    def fake_from_info(info, scopes):
        seen["info"] = info
        seen["scopes"] = scopes
        return "CREDS_FROM_INFO"

    monkeypatch.setattr(sheets_client.Credentials,
                        "from_service_account_info", fake_from_info)
    monkeypatch.setenv("ROSEN_SHEETS_SA_KEY_JSON",
                       json.dumps({"client_email": "bot@x.iam"}))
    # A path is also set, but the inline JSON must take precedence.
    monkeypatch.setenv("ROSEN_SHEETS_SA_KEY", "/should/not/be/used.json")

    creds = sheets_client.load_credentials()

    assert creds == "CREDS_FROM_INFO"
    assert seen["info"]["client_email"] == "bot@x.iam"
    assert "https://www.googleapis.com/auth/spreadsheets" in seen["scopes"]
    assert "https://www.googleapis.com/auth/drive" in seen["scopes"]


def test_file_path_env_used_when_no_inline(monkeypatch):
    seen = {}

    def fake_from_file(path, scopes):
        seen["path"] = path
        return "CREDS_FROM_FILE"

    monkeypatch.setattr(sheets_client.Credentials,
                        "from_service_account_file", fake_from_file)
    monkeypatch.setenv("ROSEN_SHEETS_SA_KEY", "/keys/sa.json")

    creds = sheets_client.load_credentials(fallback_file="ignored.json")

    assert creds == "CREDS_FROM_FILE"
    assert seen["path"] == "/keys/sa.json"


def test_falls_back_to_local_file(monkeypatch):
    seen = {}

    def fake_from_file(path, scopes):
        seen["path"] = path
        return "CREDS_FROM_FALLBACK"

    monkeypatch.setattr(sheets_client.Credentials,
                        "from_service_account_file", fake_from_file)

    creds = sheets_client.load_credentials(fallback_file="google_credentials.json")

    assert creds == "CREDS_FROM_FALLBACK"
    assert seen["path"] == "google_credentials.json"


def test_bad_inline_json_raises(monkeypatch):
    monkeypatch.setenv("ROSEN_SHEETS_SA_KEY_JSON", "{not valid json")
    with pytest.raises(json.JSONDecodeError):
        sheets_client.load_credentials()


def test_get_gspread_client_authorizes(monkeypatch):
    monkeypatch.setattr(sheets_client, "load_credentials",
                        lambda fallback_file=sheets_client.DEFAULT_FALLBACK_FILE: "CREDS")
    captured = {}

    def fake_authorize(creds):
        captured["creds"] = creds
        return "CLIENT"

    monkeypatch.setattr(sheets_client.gspread, "authorize", fake_authorize)

    client = sheets_client.get_gspread_client()

    assert client == "CLIENT"
    assert captured["creds"] == "CREDS"


def test_open_spreadsheet_uses_env_name(monkeypatch):
    class _Client:
        def open(self, name):
            return f"SHEET::{name}"

    monkeypatch.setattr(sheets_client, "get_gspread_client",
                        lambda fallback_file=sheets_client.DEFAULT_FALLBACK_FILE: _Client())
    monkeypatch.setenv("SPREADSHEET_NAME", "My Master Sheet")

    assert sheets_client.open_spreadsheet() == "SHEET::My Master Sheet"
