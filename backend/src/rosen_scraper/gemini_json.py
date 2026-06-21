"""Shared parsing for Gemini responses that wrap JSON in a markdown code fence.

The scraper called Gemini from six sites, each with its own slightly different
"strip the ```json fence, then json.loads" snippet. This centralizes that into
one tolerant parser so the fence handling lives in a single place.

The fence shapes seen in practice — a ```json ... ``` block, a bare ``` ... ```
block, an unfenced JSON body, leading prose before the fence, and a missing
closing fence — all parse correctly. The first fenced block wins.

Edge note: a JSON *value* that itself contains a literal ``` sequence parses
under the old unconditional-replace snippets (which silently dropped the ticks)
but raises here, because the split treats the embedded ticks as a fence. That
input does not occur in the entity/category/concept data this parses, and
raising is caught by every caller exactly as a json.loads failure already was.
"""

import json
from typing import Any


def strip_gemini_fence(text: str) -> str:
    """Return the JSON body of a Gemini response, with any markdown fence removed.

    Strips a leading ```json (or bare ```) fence and its closing ```; unfenced
    text is returned stripped of surrounding whitespace. Call sites that reuse
    the cleaned string (e.g. to dump it on a validation failure) use this
    directly; most sites want parse_gemini_json below.
    """
    cleaned = text.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0].strip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0].strip()
    return cleaned


def parse_gemini_json(text: str) -> Any:
    """Parse a Gemini response body that may be wrapped in a markdown fence.

    Strips the fence (see strip_gemini_fence) then json.loads the remainder.
    Raises json.JSONDecodeError (or AttributeError on a non-str) on bad input,
    so the error handling at each call site is unchanged from the inline
    json.loads it replaces.
    """
    return json.loads(strip_gemini_fence(text))
