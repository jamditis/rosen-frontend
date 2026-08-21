# -*- coding: utf-8 -*-
"""Tests for the dependency-free shared Sheets credential source resolver."""

from rosen_scraper.sheets_credentials import resolve_service_account_source


def test_inline_json_wins_over_file_path():
    source = resolve_service_account_source(
        {
            "ROSEN_SHEETS_SA_KEY_JSON": '  {"client_email": "bot@example.com"}  ',
            "ROSEN_SHEETS_SA_KEY": " /keys/ignored.json ",
        }
    )

    assert source.kind == "inline_json"
    assert source.value == '{"client_email": "bot@example.com"}'


def test_file_path_is_used_when_inline_json_is_blank():
    source = resolve_service_account_source(
        {
            "ROSEN_SHEETS_SA_KEY_JSON": "  ",
            "ROSEN_SHEETS_SA_KEY": " /keys/service-account.json ",
        }
    )

    assert source.kind == "file_path"
    assert source.value == "/keys/service-account.json"


def test_unset_when_neither_source_is_configured():
    assert resolve_service_account_source({}).kind == "unset"
