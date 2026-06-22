# -*- coding: utf-8 -*-
"""
Shared scaffolding for the content processors (#490).

The processors (article, video, twitter, bluesky, tumblr, clipping, audio) each
carried their own copy of a few small transforms: a word-boundary truncation, an
ISO-date reformat, an HTML-to-text clean, and the AI-analysis field merge. This
module holds the single canonical version of each, so the processors share one
definition instead of drifting copies.

The pieces here are deliberately small and stateless. Where the processors
genuinely differ, the difference is kept rather than flattened:
  - match-anchored vs unanchored date parsing is a parameter (`anchored`),
  - the article-vs-video/dispatcher merge policy is a parameter (`clobber`),
  - twitter's thinner inline get_text is left in place (it intentionally skips
    the decompose/unescape that `clean_html` does),
  - each entry point keeps its own return shape (the `Processor` protocol below
    documents only the dispatched class contract; it changes no behavior).
See issue #490.
"""

import html
import re
from datetime import datetime
from typing import Any, Dict, Optional, Protocol, runtime_checkable

from bs4 import BeautifulSoup

# yyyy-mm-dd, e.g. the date prefix of an ISO timestamp (2014-08-20T21:24:05Z) or
# a date embedded in a filename. Compiled once; the processors built this pattern
# inline on every call.
_ISO_DATE_RE = re.compile(r'(\d{4})-(\d{2})-(\d{2})')


def us_date_from_iso(value: Any, *, anchored: bool = True) -> Optional[str]:
    """Reformat the yyyy-mm-dd in `value` as mm/dd/yyyy, or None if absent.

    anchored=True matches only at the start of the string (re.match — for an ISO
    timestamp whose date is the prefix); anchored=False searches anywhere
    (re.search — for a date embedded in a filename or free text). `value` is
    coerced to str, mirroring the processors' inline `re.match(..., str(x))`.
    """
    text = str(value)
    match = _ISO_DATE_RE.match(text) if anchored else _ISO_DATE_RE.search(text)
    if not match:
        return None
    return f"{match.group(2)}/{match.group(3)}/{match.group(1)}"


def iso_to_ymd(created_at: str) -> Optional[str]:
    """Reformat an ISO timestamp as yyyy-mm-dd, falling back to its first 10
    characters (or None when too short to hold a date). Mirrors Bluesky's
    created-at handling: a trailing 'Z' is normalised to '+00:00' so
    datetime.fromisoformat accepts it, and any parse failure degrades to the
    leading slice rather than raising.
    """
    try:
        dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return created_at[:10] if len(created_at) >= 10 else None


def truncate_on_word_boundary(text: str, length: int) -> str:
    """Trim `text` to at most `length` characters on a word boundary, adding
    '...'. Returns `text` unchanged when it is already within `length`.

    This is the shared kernel of the processors' excerpt/truncate helpers; the
    surrounding logic (clipping's headline skip, tumblr's HTML pre-clean) stays
    in each caller.
    """
    if len(text) > length:
        return text[:length].rsplit(' ', 1)[0] + '...'
    return text


def clean_html(html_content: str) -> str:
    """Strip HTML to plain text: drop script/style, keep block-level newlines,
    collapse blank lines, and unescape entities. The canonical version of
    tumblr's `_clean_html`.

    Twitter keeps its own thinner inline `get_text(separator='\\n', strip=True)`,
    which deliberately skips the decompose and unescape steps here (#490).
    """
    if not html_content:
        return ''

    soup = BeautifulSoup(html_content, 'html.parser')

    # Remove script and style elements
    for element in soup(['script', 'style']):
        element.decompose()

    # Get text with newlines preserved for block elements
    text = soup.get_text(separator='\n')

    # Clean up whitespace
    lines = [line.strip() for line in text.split('\n')]
    text = '\n'.join(line for line in lines if line)

    # Decode HTML entities
    text = html.unescape(text)

    return text.strip()


def merge_ai_fields(
    record: Dict[str, Any], ai_data: Optional[Dict[str, Any]], *, clobber: bool
) -> Dict[str, Any]:
    """Merge AI-analysis fields into `record` in place and return it.

    clobber=True overwrites existing keys (dict.update — video, twitter,
    bluesky); clobber=False fills only blank or missing keys (article, which
    keeps scraped values over AI guesses). A falsy `ai_data` is a no-op, so
    callers can drop their own "if result:" guard. This `clobber` parameter is
    the merge-policy distinction the #490 caveat flags as load-bearing.
    """
    if not ai_data:
        return record
    if clobber:
        record.update(ai_data)
    else:
        for key, value in ai_data.items():
            if not record.get(key):
                record[key] = value
    return record


@runtime_checkable
class Processor(Protocol):
    """The contract the URL dispatcher relies on for a class-based processor: a
    `process(url)` method returning a status envelope —
    `{'status': 'success' | 'failed', ...}`. Twitter and Bluesky implement it.

    This is a type only; it adds no runtime behaviour. The module-function
    processors (article, video, audio) and the offline batch classes (tumblr,
    clipping) keep their own shapes and are not expected to satisfy it — see the
    #490 envelope discussion before unifying them.
    """

    def process(self, url: str) -> Dict[str, Any]:
        ...
