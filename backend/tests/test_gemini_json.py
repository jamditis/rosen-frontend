"""Tests for backend/src/rosen_scraper/gemini_json.py.

parse_gemini_json replaces six near-identical inline "unfence then json.loads"
snippets across the scraper. These cases cover every fence shape those snippets
handled, plus the documented edge where a value containing literal ``` raises.
"""

import json

import pytest

from rosen_scraper.gemini_json import parse_gemini_json, strip_gemini_fence

PAYLOAD = {"entities": [{"id": "P1", "name": "Jay Rosen", "prominence": 9}], "relationships": []}
BODY = json.dumps(PAYLOAD)


def test_unfenced_json():
    assert parse_gemini_json(BODY) == PAYLOAD


def test_json_fenced():
    assert parse_gemini_json(f"```json\n{BODY}\n```") == PAYLOAD


def test_bare_fenced():
    assert parse_gemini_json(f"```\n{BODY}\n```") == PAYLOAD


def test_leading_prose_before_fence():
    # The stricter inline snippets failed on this; the shared parser recovers it.
    assert parse_gemini_json(f"Here is the JSON:\n```json\n{BODY}\n```") == PAYLOAD


def test_missing_closing_fence():
    assert parse_gemini_json(f"```json\n{BODY}") == PAYLOAD


def test_surrounding_whitespace():
    assert parse_gemini_json(f"   ```json\n{BODY}\n```   \n") == PAYLOAD


def test_concepts_shape():
    obj = {"concepts": ["press criticism", "view from nowhere"], "recommendations": ""}
    assert parse_gemini_json(f"```json\n{json.dumps(obj)}\n```") == obj


def test_invalid_json_raises():
    with pytest.raises(json.JSONDecodeError):
        parse_gemini_json("not json at all")


def test_value_with_literal_backticks_raises():
    # Documented edge: a value containing ``` is treated as a fence and raises,
    # rather than being silently corrupted as the old replace('```','') did.
    with pytest.raises(json.JSONDecodeError):
        parse_gemini_json('{"note": "use ```code``` here"}')


def test_strip_returns_cleaned_body():
    # The reuse sites (entity_extractor, categorizer) dump this string on a
    # validation failure, so the stripper must return the fence-free body.
    assert strip_gemini_fence(f"```json\n{BODY}\n```") == BODY
    assert strip_gemini_fence(BODY) == BODY
