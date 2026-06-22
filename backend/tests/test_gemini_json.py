"""Tests for backend/src/rosen_scraper/gemini_json.py.

parse_gemini_json replaces six near-identical inline "unfence then json.loads"
snippets across the scraper. These cases cover every fence shape those snippets
handled, plus shapes they broke on: a value containing a literal ``` (fenced and
unfenced) and a fenced block followed by trailing prose. raw_decode locates the
JSON value by grammar, so the embedded ticks survive and the trailing bytes drop.
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


def test_unfenced_value_with_literal_backticks():
    # An unfenced body whose value contains ``` parses verbatim: raw_decode reads
    # the whole value, ticks included. The old replace('```','') snippets parsed
    # it only by silently deleting the backticks from the value.
    obj = {"note": "use ```code``` here"}
    assert parse_gemini_json(json.dumps(obj)) == obj


def test_fenced_value_with_literal_backticks():
    # A fenced body whose value contains ``` survives: raw_decode stops at the end
    # of the value, so the ``` inside it is kept and only the closing fence after
    # it is dropped. The old split('```') snippets truncated at the first tick.
    obj = {"note": "use ```code``` here"}
    assert parse_gemini_json(f"```json\n{json.dumps(obj)}\n```") == obj


def test_fenced_then_trailing_prose():
    # A fenced block followed by commentary parses: raw_decode ends at the closing
    # brace and ignores the closing fence and the prose after it.
    assert parse_gemini_json(f"```json\n{BODY}\n```\nLet me know if you need more.") == PAYLOAD


def test_bare_fenced_then_trailing_prose():
    assert parse_gemini_json(f"```\n{BODY}\n```\nThanks!") == PAYLOAD


def test_strip_returns_cleaned_body():
    # The reuse sites (entity_extractor, categorizer) dump this string on a
    # validation failure, so the stripper must return the fence-free body.
    assert strip_gemini_fence(f"```json\n{BODY}\n```") == BODY
    assert strip_gemini_fence(BODY) == BODY
