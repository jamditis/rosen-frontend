#!/usr/bin/env python3
"""Single source for the archive's controlled vocabularies.

`backend/schema.json` is canonical: its `taxonomy` block lists the thematic
categories, eras, key concepts, content formats, and scopes every record is
validated against. The authoring scripts and the ADDING-RECORDS guide used to
keep their own hardcoded copies of these lists. Duplicated lists drift: a copy
can be edited without the others and nothing catches it. Loading them from one
place means a stale copy fails test_taxonomy_single_source instead of shipping.

To add or remove a thematic category, edit `taxonomy.thematic_categories` in
backend/schema.json and the mirrored list in ADDING-RECORDS.md, which a test
keeps in step; the reviewer and auto-categorizer then follow with no code edit.
Eras, concepts, formats, and scopes have no doc mirror, so those are a
schema.json edit alone.
"""
from __future__ import annotations

import json
from pathlib import Path

# schema.json lives in backend/, one level up from this scripts/ directory.
SCHEMA_PATH = Path(__file__).resolve().parents[1] / "schema.json"


def _taxonomy() -> dict:
    """Return the taxonomy block of schema.json, failing loud if it is unusable.

    An unreadable or malformed schema leaves every taxonomy-aware script with no
    allow-list, so it raises rather than defaulting to an empty vocabulary that
    would silently accept or reject every value.
    """
    try:
        with SCHEMA_PATH.open(encoding="utf-8-sig") as schema_file:
            schema = json.load(schema_file)
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"schema.json not found at {SCHEMA_PATH}; the taxonomy has no source. "
            "Restore backend/schema.json before running taxonomy-aware scripts."
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"schema.json at {SCHEMA_PATH} is not valid JSON ({exc}). "
            "Fix the taxonomy source before continuing."
        ) from exc

    taxonomy = schema.get("taxonomy")
    if not isinstance(taxonomy, dict):
        raise RuntimeError(
            f"schema.json at {SCHEMA_PATH} has no 'taxonomy' object; "
            "cannot load the controlled vocabularies."
        )
    return taxonomy


def _names(key: str) -> list[str]:
    """Return the ordered names under taxonomy.<key>.

    Entries may be plain strings or {"name": ..., "description": ...} objects;
    both shapes appear in schema.json. An empty or malformed list raises, so a
    truncated schema cannot quietly disable a whole allow-list.
    """
    items = _taxonomy().get(key)
    if not isinstance(items, list) or not items:
        raise RuntimeError(
            f"schema.json taxonomy.{key} is missing or empty; refusing to run "
            "with an unguarded vocabulary."
        )
    names = [item["name"] if isinstance(item, dict) else item for item in items]
    if any(not isinstance(name, str) or not name.strip() for name in names):
        raise RuntimeError(
            f"schema.json taxonomy.{key} contains a blank or non-string name."
        )
    return names


def thematic_categories() -> list[str]:
    """Canonical thematic-category names, in schema order."""
    return _names("thematic_categories")


def eras() -> list[str]:
    """Canonical era names, in schema order."""
    return _names("era")


def key_concepts() -> list[str]:
    """Canonical key-concept names, in schema order."""
    return _names("key_concepts")


def content_formats() -> list[str]:
    """Canonical content-format names, in schema order."""
    return _names("content_format")


def scopes() -> list[str]:
    """Canonical scope names, in schema order."""
    return _names("scope")
