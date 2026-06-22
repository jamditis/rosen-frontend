"""Shared parsing for Gemini responses that wrap JSON in a markdown code fence.

The scraper called Gemini from six sites, each with its own slightly different
"strip the ```json fence, then json.loads" snippet. This centralizes that into
one tolerant parser so the fence handling lives in a single place.

The fence shapes seen in practice all parse correctly: a ```json ... ``` block,
a bare ``` ... ``` block, an unfenced JSON body, leading prose before the fence,
a missing closing fence, and trailing prose after the closing fence.

The body is located by JSON grammar rather than string surgery: once any leading
fence is dropped, json.JSONDecoder().raw_decode reads exactly one JSON value and
reports where it ended. That keeps a literal ``` *inside* a value (e.g. a quoted
code snippet), which sits before the end index, while ignoring a closing fence or
commentary *after* it. The old inline `replace('```', '')` snippets parsed an
embedded ``` only by silently deleting it from the value, and the `split('```')`
ones broke on either an embedded ``` or trailing prose.
"""

import json
from typing import Any, Optional

_DECODER = json.JSONDecoder()


def _first_json_slice(text: str) -> Optional[str]:
    """Return the substring of the first JSON value in text, or None if none.

    Uses raw_decode, which parses one value from the start and reports its end,
    so trailing bytes after the value are dropped and bytes inside it are kept.
    """
    try:
        _, end = _DECODER.raw_decode(text)
    except json.JSONDecodeError:
        return None
    return text[:end]


def strip_gemini_fence(text: str) -> str:
    """Return the JSON body of a Gemini response, with any markdown fence removed.

    Drops a leading ```json (or bare ```) fence and any prose before it, then
    returns exactly the first JSON value found, so a trailing closing fence and
    commentary are discarded while a ``` inside the value is kept. Falls back to
    the raw stripped text when no JSON value decodes (e.g. a truncated body), so
    the caller's json.loads still raises on it as the inline code did. Reuse
    sites dump this string on a validation failure; most sites want
    parse_gemini_json below.
    """
    cleaned = text.strip()

    # Unfenced JSON (including a value that contains ```) decodes as-is.
    body = _first_json_slice(cleaned)
    if body is not None:
        return body

    # Otherwise drop a leading fence (and any prose before it), then retry.
    if "```json" in cleaned:
        cleaned = cleaned.split("```json", 1)[1].lstrip()
    elif "```" in cleaned:
        cleaned = cleaned.split("```", 1)[1].lstrip()
    body = _first_json_slice(cleaned)
    if body is not None:
        return body

    # No decodable JSON. Trim a trailing fence so the dumped string is at least
    # fence-free, and let the caller's json.loads report the real failure.
    cleaned = cleaned.rstrip()
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].rstrip()
    return cleaned


def parse_gemini_json(text: str) -> Any:
    """Parse a Gemini response body that may be wrapped in a markdown fence.

    Strips the fence (see strip_gemini_fence) then json.loads the remainder.
    Raises json.JSONDecodeError (or AttributeError on a non-str) on bad input,
    so the error handling at each call site is unchanged from the inline
    json.loads it replaces.
    """
    return json.loads(strip_gemini_fence(text))
