#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Measure the 2004-2008 PressThink gap against reproducible source inventories.

Issue #815. The modern ``pressthink.org`` sitemap only lists posts from 2009
onward, so ``backend/scripts/pressthink_sitemap_gap.py`` cannot say anything
about the Movable Type era. That era lived at ``archive.pressthink.org`` under
URLs like ``/2004/08/31/cnn_rnc.html``. This script measures that era.

It answers one question: for every 2004-2008 PressThink post that a named,
dated source inventory says existed, is there a row in
``data/archive_records-public.csv`` that holds it?

The script only measures. It makes no recovery, import, ID, rights, taxonomy,
or relationship decisions.

Inventory files
---------------

The script never reads a hidden or gitignored packet. Every run consumes
inventory files that are checked in next to the report. An inventory file is
JSON with this shape::

    {
      "source_id": "wayback-monthly-index",
      "source_name": "PressThink Movable Type monthly archive pages",
      "provenance": "https://web.archive.org/web/*/archive.pressthink.org/YYYY/MM/",
      "retrieved_at": "2026-08-27",
      "coverage_note": "one sentence on what this source can and cannot show",
      "entries": [
        {
          "url": "http://archive.pressthink.org/2004/08/31/cnn_rnc.html",
          "date": "2004-08-31",
          "title": "Down at the Tick Tock Diner, I Caught Up With CNN",
          "body": "In which the demise of the network sky box is confirmed...",
          "evidence": "https://web.archive.org/web/20110811215744/http://..."
        }
      ]
    }

``url`` and ``date`` are required on an entry. ``title``, ``body``, and
``evidence`` are optional; a source that cannot supply them simply gives the
matcher less to work with, and the report says so.

The ``archive.pressthink.org`` host has a broken TLS certificate, so its own
URLs are stored and fetched over plain ``http://``. Comparison is scheme
agnostic, so an ``https://`` row in the CSV still matches.

Match tiers
-----------

Every inventory entry lands in exactly one tier. Tiers run strongest first and
roll up into the three statuses the report groups by:

    exact_url          present     canonical source URL is an archive row URL
    body_fingerprint   present     opening words of the body match a row
    title_strong       present     same publication date, title agrees
    review             needs_review weak or off-date evidence, human decides
    missing            missing     no archive row matches under any tier

Title agreement is the weakest of the three present tiers, so it is the most
guarded. A title confirms a work when the token sets nearly match, or when one
set contains the other and the overlap still clears ``CONTAINED_JACCARD`` and
the extra tokens are not a part marker. Movable Type serial posts differ by a
part marker alone, so containment there is a false match, not agreement.

One archive row holds one work. When two different source works both grade
present against the same row, the weaker claim goes to review and the report
lists the conflict, because at least one of the two must be wrong.

``missing`` means "no row in this archive matches this inventory entry". It
does not mean the work never existed, and it does not mean a work absent from
an inventory never existed. Coverage limits are printed in the report.

Two counts, on purpose
----------------------

Every inventory entry is graded on its own, so each source's agreement with the
archive can be read separately. The report then rolls those listings up to one
row per distinct work, holding the strongest result any source reached. The
first count answers "how good is this source"; the second answers "how much of
the era is missing". Reading the first as the second double-counts every post
both sources list.

URL canonicalisation
--------------------

Movable Type published each post twice: ``slug.html`` and the print twin
``slug_p.html``. Both are the same work. The archive CSV holds a mix of the
two. Canonicalisation folds the ``_p`` twin, the scheme, ``www.``, the ``:80``
port that Wayback records, the query string, and the trailing slash.

Usage
-----

::

    # rebuild an inventory from the Wayback capture index
    python3 backend/scripts/pressthink_2004_2008_gap.py fetch-cdx \\
        --out backend/inventories/pressthink-2004-2008/wayback-cdx.json

    # rebuild an inventory from the Movable Type monthly archive pages
    python3 backend/scripts/pressthink_2004_2008_gap.py fetch-monthly-index \\
        --out backend/inventories/pressthink-2004-2008/wayback-monthly-index.json

    # measure the gap and write the report (no network)
    python3 backend/scripts/pressthink_2004_2008_gap.py report \\
        --inventory backend/inventories/pressthink-2004-2008/wayback-monthly-index.json \\
        --inventory backend/inventories/pressthink-2004-2008/wayback-cdx.json \\
        --out-json backend/inventories/pressthink-2004-2008/gap-report.json \\
        --out-markdown docs/pressthink-2004-2008-gap-2026-08-27.md
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import http.client
import html as _html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable, NamedTuple, Optional

# Resolve repo paths from this file so the defaults work from any directory:
# scripts/ -> backend/ -> repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARCHIVE = _REPO_ROOT / "data" / "archive_records-public.csv"
DEFAULT_INVENTORY_DIR = _REPO_ROOT / "backend" / "inventories" / "pressthink-2004-2008"

LEGACY_HOST = "archive.pressthink.org"
CDX_ENDPOINT = "https://web.archive.org/cdx/search/cdx"
WAYBACK_RAW = "https://web.archive.org/web/{timestamp}id_/{url}"
USER_AGENT = "rosen-archive-2004-2008-gap/1.0"

DEFAULT_START_YEAR = 2004
DEFAULT_END_YEAR = 2008

# Same small stopword list as the sitemap matcher. A longer list would let two
# unrelated short titles collapse to the same token set and match spuriously.
STOPWORDS = frozenset(
    """a an the of to in on for and or but with at by from as is are was were
    be been being it its this that these those his her their our your my you we
    they i how why what when who whom which than then so if not no""".split()
)

# Title agreement floors, matching pressthink_sitemap_gap.py so the two
# measurements grade evidence the same way.
STRONG_JACCARD = 0.8
REVIEW_JACCARD = 0.5
MIN_TITLE_TOKENS = 2

# Containment floor. One title's tokens can sit inside another's because the
# archive stores a shortened form of the published title, which is real
# agreement. It can also happen because one title is a short phrase that the
# other merely repeats, which is not. The floor keeps containment from
# forgiving a long tail of extra words.
CONTAINED_JACCARD = 0.6

# Movable Type ran serial posts whose titles differ from their siblings by a
# part marker alone, so one title's tokens are a subset of the other's. That is
# the containment shape and the opposite of agreement: "... Say What They
# Found" and "... Say What They Found (Part III)" are different posts. When the
# only extra tokens are a serial marker, containment proves nothing and a
# human decides.
SERIAL_MARKER_WORDS = frozenset(
    """part pt parts continued cont one two three four five six seven eight
    nine ten""".split()
)
_ROMAN_NUMERAL_RE = re.compile(r"^[ivx]{2,4}$")
_SMALL_NUMBER_RE = re.compile(r"^\d{1,2}$")

# How many words of body text make a fingerprint. Long enough that two
# different posts cannot collide, short enough to survive a truncated excerpt.
FINGERPRINT_WORDS = 12

_LEGACY_POST_RE = re.compile(
    r"^archive\.pressthink\.org/(\d{4})/(\d{2})/(\d{2})/([^/]+)$"
)
_MODERN_POST_RE = re.compile(r"^pressthink\.org/(\d{4})/(\d{2})/(?:(\d{2})/)?([^/]+)$")

# Strongest evidence first. The order is the order the tiers run in, and the
# order the conflict guard uses when two source works claim one archive row.
PRESENT_TIERS = ("exact_url", "body_fingerprint", "title_strong")
TIER_RANK = {tier: rank for rank, tier in enumerate(PRESENT_TIERS)}
STATUS_BY_TIER = {tier: "present" for tier in PRESENT_TIERS}
STATUS_BY_TIER["review"] = "needs_review"
STATUS_BY_TIER["missing"] = "missing"


# --------------------------------------------------------------------------
# normalisation helpers
# --------------------------------------------------------------------------


def canonical_source_url(url: str) -> str:
    """Reduce a URL to a comparison key.

    Folds scheme, ``www.``, an explicit ``:80``/``:443`` port, the query
    string, the fragment, and the trailing slash. For Movable Type paths it
    also drops the ``.html`` suffix and the ``_p`` print twin, so
    ``/2004/08/31/cnn_rnc.html`` and ``/2004/08/31/cnn_rnc_p.html`` share one
    key.
    """
    u = url.strip().lower()
    u = re.sub(r"^[a-z][a-z0-9+.-]*://", "", u)
    u = u.split("#", 1)[0]
    u = u.split("?", 1)[0]
    u = re.sub(r"^www\.", "", u)
    # Strip a default port from the host only, never from a path segment.
    u = re.sub(r"^([^/]+?):(?:80|443)(?=/|$)", r"\1", u)
    u = u.rstrip("/")
    if u.endswith(".html"):
        u = u[: -len(".html")]
        if u.endswith("_p"):
            u = u[: -len("_p")]
        if u.endswith("/index"):
            u = u[: -len("/index")]
    return u


def strip_title_prefix(title: str) -> str:
    """Drop the leading ``PressThink:`` label and any wrapping quotes."""
    t = re.sub(r"^\s*pressthink\s*:\s*", "", title, flags=re.IGNORECASE)
    return t.strip().strip("\"'“”‘’")


def title_tokens(text: str) -> frozenset[str]:
    """Lowercase, split on non-alphanumerics, drop stopwords and 1-char parts."""
    parts = re.split(r"[^a-z0-9]+", strip_title_prefix(text).lower())
    return frozenset(p for p in parts if len(p) >= 2 and p not in STOPWORDS)


def fingerprint_body(text: str, words: int = FINGERPRINT_WORDS) -> str:
    """Fingerprint the opening of a body of text.

    Lowercases, drops every non-alphanumeric character, and keeps the first
    ``words`` words. Punctuation and entity differences between a captured
    page and a stored row therefore do not break the match. Returns an empty
    string when there is not enough text to be safe.
    """
    parts = [p for p in re.split(r"[^a-z0-9]+", (text or "").lower()) if p]
    if len(parts) < words:
        return ""
    return " ".join(parts[:words])


def parse_date(value: str) -> Optional[tuple[int, int, int]]:
    """Parse a ``YYYY-MM-DD`` date. Returns None when the value is unusable."""
    m = re.match(r"\s*(\d{4})-(\d{2})-(\d{2})", value or "")
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def date_from_url(canon_url: str) -> Optional[tuple[int, int, int]]:
    """Read the publication date out of a dated PressThink URL path."""
    m = _LEGACY_POST_RE.match(canon_url) or _MODERN_POST_RE.match(canon_url)
    if not m:
        return None
    day = m.group(3)
    if day is None:
        return None
    return int(m.group(1)), int(m.group(2)), int(day)


def strip_default_port(url: str) -> str:
    """Drop an explicit ``:80``/``:443`` from a URL's host.

    The Wayback capture index records the legacy host as
    ``archive.pressthink.org:80``. Storing that in an inventory would leave a
    URL nobody wants to click.
    """
    return re.sub(r"^(https?://[^/]+?):(?:80|443)(?=/|$)", r"\1", url.strip())


def legacy_fetch_url(url: str) -> str:
    """Force plain http for ``archive.pressthink.org``.

    That host serves a certificate the chain does not trust, so an https fetch
    fails even though the page is fine. Archive rows correctly use http for it.
    """
    if re.match(r"^https://(www\.)?" + re.escape(LEGACY_HOST) + r"(/|$)", url.strip()):
        return "http://" + url.strip()[len("https://") :]
    return url.strip()


# --------------------------------------------------------------------------
# archive index
# --------------------------------------------------------------------------


class Record(NamedTuple):
    """One archive row, reduced to the fields the matcher needs."""

    record_id: str
    title: str
    url_canon: str
    date: Optional[tuple[int, int, int]]
    tokens: frozenset[str]


class ArchiveIndex(NamedTuple):
    """Lookup structures built once from the archive CSV."""

    by_url: dict[str, str]
    by_day: dict[tuple[int, int, int], list[Record]]
    by_month: dict[tuple[int, int], list[Record]]
    by_year: dict[int, list[Record]]
    by_fingerprint: dict[str, str]
    titles: dict[str, str]
    ambiguous_fingerprints: frozenset[str]


def _record_fingerprints(row: dict, title: str) -> list[str]:
    """Body fingerprints for one row, from raw_text and excerpt.

    The exported excerpt often repeats the title before the body, so the
    excerpt is fingerprinted twice: as stored, and with a leading copy of the
    title removed.
    """
    prints = []
    for field in ("raw_text", "excerpt"):
        text = (row.get(field) or "").strip()
        if not text:
            continue
        prints.append(fingerprint_body(text))
        bare_title = strip_title_prefix(title)
        if bare_title and text.lower().startswith(bare_title.lower()):
            prints.append(fingerprint_body(text[len(bare_title) :]))
    return [p for p in prints if p]


def build_archive_index(rows: Iterable[dict]) -> ArchiveIndex:
    """Index archive rows by canonical URL, date, and body fingerprint."""
    by_url: dict[str, str] = {}
    by_day: dict[tuple[int, int, int], list[Record]] = defaultdict(list)
    by_month: dict[tuple[int, int], list[Record]] = defaultdict(list)
    by_year: dict[int, list[Record]] = defaultdict(list)
    by_fingerprint: dict[str, str] = {}
    ambiguous: set[str] = set()
    titles: dict[str, str] = {}

    for row in rows:
        record_id = (row.get("id") or "").strip()
        title = (row.get("title") or "").strip()
        url_canon = canonical_source_url(row.get("url") or "")
        date = parse_date(row.get("publication_date") or "") or date_from_url(url_canon)
        rec = Record(record_id, title, url_canon, date, title_tokens(title))
        titles[record_id] = title
        if url_canon:
            by_url.setdefault(url_canon, record_id)
        if date is not None:
            by_day[date].append(rec)
            by_month[(date[0], date[1])].append(rec)
            by_year[date[0]].append(rec)
        for print_ in _record_fingerprints(row, title):
            claimed = by_fingerprint.get(print_)
            if claimed is None:
                by_fingerprint[print_] = record_id
            elif claimed != record_id:
                # Two rows open with the same twelve words. The fingerprint
                # cannot tell them apart, so it must not pick one of them.
                ambiguous.add(print_)

    for print_ in ambiguous:
        by_fingerprint.pop(print_, None)

    return ArchiveIndex(
        by_url,
        dict(by_day),
        dict(by_month),
        dict(by_year),
        by_fingerprint,
        titles,
        frozenset(ambiguous),
    )


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _is_serial_token(token: str) -> bool:
    """Whether one token is a part or serial marker rather than a word."""
    return (
        token in SERIAL_MARKER_WORDS
        or bool(_ROMAN_NUMERAL_RE.match(token))
        or bool(_SMALL_NUMBER_RE.match(token))
    )


def _serial_marker_only(extra: frozenset[str]) -> bool:
    """Whether the tokens one title adds are nothing but a serial marker."""
    return bool(extra) and all(_is_serial_token(t) for t in extra)


def _title_agreement(
    tokens: frozenset[str], rec_tokens: frozenset[str]
) -> tuple[float, bool]:
    """Score one title pair. Returns (jaccard, strong).

    ``strong`` is the only thing that can confirm a work, so it is deliberately
    hard to earn. High token overlap earns it. Containment earns it as well,
    because the archive sometimes stores a shortened form of the published
    title, but only when the overlap still clears ``CONTAINED_JACCARD`` and the
    extra tokens are not a serial marker.
    """
    score = _jaccard(tokens, rec_tokens)
    # Both sides must carry tokens, or a one-word row would "contain"
    # everything and confirm works it does not hold.
    if len(tokens) < MIN_TITLE_TOKENS or len(rec_tokens) < MIN_TITLE_TOKENS:
        return score, False
    if score >= STRONG_JACCARD:
        return score, True
    # Containment is checked both ways: either side can be the shortened one.
    if tokens <= rec_tokens:
        extra = rec_tokens - tokens
    elif rec_tokens <= tokens:
        extra = tokens - rec_tokens
    else:
        return score, False
    if _serial_marker_only(extra):
        return score, False
    return score, score >= CONTAINED_JACCARD


def _best_in_bucket(
    tokens: frozenset[str], bucket: list[Record]
) -> tuple[Optional[Record], float, bool]:
    """Best record in a bucket. Returns (record, jaccard, strong).

    Candidates rank by strong agreement first and by score second. Ranking on
    containment alone would let a weakly contained title beat a near-identical
    one; ranking on the score alone would drop a shortened archive title that
    does agree.
    """
    best: Optional[Record] = None
    best_key = (False, 0.0)
    for rec in bucket:
        score, strong = _title_agreement(tokens, rec.tokens)
        if score <= 0.0:
            continue
        key = (strong, score)
        if best is None or key > best_key:
            best, best_key = rec, key
    return best, best_key[1], best_key[0]


# --------------------------------------------------------------------------
# matching
# --------------------------------------------------------------------------


def classify_entry(entry: dict, index: ArchiveIndex) -> dict:
    """Classify one inventory entry against the archive index.

    Returns a dict with the entry's url, date, title, source_id, plus tier,
    status, matched_id, matched_title, score, and note.
    """
    url = (entry.get("url") or "").strip()
    canon = canonical_source_url(url)
    date = parse_date(entry.get("date") or "") or date_from_url(canon)
    title = (entry.get("title") or "").strip()
    body = (entry.get("body") or "").strip()

    result = {
        "url": url,
        "canonical_url": canon,
        "date": f"{date[0]:04d}-{date[1]:02d}-{date[2]:02d}" if date else None,
        "year": date[0] if date else None,
        "title": title or None,
        "source_id": entry.get("source_id"),
        "evidence": entry.get("evidence"),
        "matched_id": None,
        "matched_title": None,
        "score": None,
        "note": "",
    }

    def finish(tier: str) -> dict:
        result["tier"] = tier
        result["status"] = STATUS_BY_TIER[tier]
        return result

    if canon and canon in index.by_url:
        matched = index.by_url[canon]
        result.update(matched_id=matched, matched_title=index.titles.get(matched))
        result["score"] = 1.0
        return finish("exact_url")

    tokens = title_tokens(title) if title else frozenset()

    # The body fingerprint is twelve of the post's own opening words, so it is
    # stronger evidence than title-token agreement and runs first.
    print_ = fingerprint_body(body)
    if print_ and print_ in index.by_fingerprint:
        matched = index.by_fingerprint[print_]
        result.update(
            matched_id=matched,
            matched_title=index.titles.get(matched),
            score=1.0,
            note="matched on the opening words of the body, not on url or title",
        )
        return finish("body_fingerprint")

    if tokens and date is not None:
        day_rec, day_score, day_strong = _best_in_bucket(
            tokens, index.by_day.get(date, [])
        )
        if day_rec is not None and day_strong:
            result.update(
                matched_id=day_rec.record_id,
                matched_title=day_rec.title,
                score=round(day_score, 3),
            )
            return finish("title_strong")

        # Same month, weaker title agreement: a human decides.
        month_bucket = [
            r for r in index.by_month.get((date[0], date[1]), []) if r.date != date
        ]
        rec, score, strong = _best_in_bucket(tokens, month_bucket)
        if rec is not None and strong:
            result.update(
                matched_id=rec.record_id,
                matched_title=rec.title,
                score=round(score, 3),
                note=(
                    "strong title agreement on a different day of the same month; "
                    "check whether the archive row holds this work"
                ),
            )
            return finish("review")

        if day_rec is not None and day_score >= REVIEW_JACCARD:
            result.update(
                matched_id=day_rec.record_id,
                matched_title=day_rec.title,
                score=round(day_score, 3),
                note="weak title overlap on the same publication date",
            )
            return finish("review")

        year_bucket = [
            r
            for r in index.by_year.get(date[0], [])
            if r.date is None or r.date[1] != date[1]
        ]
        yr_rec, yr_score, yr_strong = _best_in_bucket(tokens, year_bucket)
        if yr_rec is not None and yr_strong:
            month = yr_rec.date[1] if yr_rec.date else 0
            result.update(
                matched_id=yr_rec.record_id,
                matched_title=yr_rec.title,
                score=round(yr_score, 3),
                note=(
                    f"strong title agreement in {date[0]}-{month:02d}, "
                    f"not {date[0]}-{date[1]:02d}"
                ),
            )
            return finish("review")

    if not title and not body:
        result["note"] = (
            "this source supplies no title or body, so only the url tier could run"
        )

    return finish("missing")


# --------------------------------------------------------------------------
# report
# --------------------------------------------------------------------------


STATUS_RANK = {"present": 0, "needs_review": 1, "missing": 2}


def _in_window(year: Optional[int], start: int, end: int) -> bool:
    return year is not None and start <= year <= end


def _ordered_statuses(bucket: dict[str, int]) -> dict[str, int]:
    """Put a status bucket in a fixed order.

    Insertion order would otherwise follow whichever status a source listed
    first, so two runs over the same inventories in a different order would
    write different bytes.
    """
    return {
        status: bucket[status]
        for status in sorted(bucket, key=lambda s: STATUS_RANK[s])
    }


def load_inventory(path: Path) -> dict:
    """Read one inventory file and stamp its source_id onto every entry."""
    data: dict = json.loads(Path(path).read_text(encoding="utf-8"))
    source_id = data.get("source_id") or Path(path).stem
    entries = []
    for entry in data.get("entries", []):
        item = dict(entry)
        item["source_id"] = source_id
        entries.append(item)
    data["source_id"] = source_id
    data["entries"] = entries
    return data


def _evidence_weight(entry: dict) -> int:
    """How much evidence one inventory entry carries."""
    return bool(entry.get("title")) + bool(entry.get("body")) + bool(entry.get("date"))


def _dedupe_entries(inventories: Iterable[dict]) -> list[dict]:
    """One row per canonical URL per source, keeping the richest entry.

    A capture index lists the same post under both the plain and the ``_p``
    URL. Counting both would double the denominator.
    """
    best: dict[tuple[str, str], dict] = {}
    for inv in inventories:
        for entry in inv.get("entries", []):
            key = (
                entry.get("source_id") or "",
                canonical_source_url(entry.get("url") or ""),
            )
            current = best.get(key)
            if current is None or _evidence_weight(entry) > _evidence_weight(current):
                best[key] = entry
    return list(best.values())


def _flag_conflicting_claims(results: list[dict]) -> list[dict]:
    """Send a present grade to review when two works claim one archive row.

    One archive row holds one work. When two different canonical source URLs
    both grade present against the same record id, at most one of them can be
    right, and the row itself may carry the wrong title or date. Keep the claim
    with the strongest tier, send the rest to review, and record the conflict
    so a curator sees it instead of a silent double count.
    """
    claims: dict[str, dict[str, str]] = defaultdict(dict)
    for res in results:
        if res["status"] != "present" or not res["matched_id"]:
            continue
        by_url = claims[res["matched_id"]]
        held = by_url.get(res["canonical_url"])
        tier = res["tier"]
        if held is None or TIER_RANK[tier] < TIER_RANK[held]:
            by_url[res["canonical_url"]] = tier

    conflicts = []
    kept_claim: dict[str, tuple[str, str]] = {}
    for record_id, by_url in sorted(claims.items()):
        ranked = sorted(by_url.items(), key=lambda kv: (TIER_RANK[kv[1]], kv[0]))
        kept_url, kept_tier = ranked[0]
        kept_claim[record_id] = (kept_url, kept_tier)
        if len(by_url) < 2:
            continue
        dropped = ranked[1:]
        for res in results:
            if res["matched_id"] != record_id or res["status"] != "present":
                continue
            if res["canonical_url"] == kept_url:
                continue
            res["tier"] = "review"
            res["status"] = STATUS_BY_TIER["review"]
            res["note"] = (
                f"{record_id} is already claimed by {kept_url} on the "
                f"{kept_tier} tier; one archive row cannot hold two works, so "
                "a curator decides which work this row holds"
            )
        conflicts.append(
            {
                "record_id": record_id,
                "kept": {"canonical_url": kept_url, "tier": kept_tier},
                "sent_to_review": [
                    {"canonical_url": url, "tier": tier} for url, tier in dropped
                ],
            }
        )

    # A review row can point at a row another work already holds. Say so, so
    # the curator reads the two decisions together.
    for res in results:
        if res["status"] != "needs_review" or not res["matched_id"]:
            continue
        claim = kept_claim.get(res["matched_id"])
        if claim is None or claim[0] == res["canonical_url"]:
            continue
        clause = (
            f"{res['matched_id']} is already claimed by {claim[0]} on the "
            f"{claim[1]} tier"
        )
        if clause in res["note"]:
            continue
        res["note"] = f"{res['note']}; {clause}" if res["note"] else clause

    return conflicts


def _source_overlap(results: list[dict]) -> dict:
    """How far the sources list the same works.

    Two inventories can look like corroboration and be one measurement counted
    twice. The report states the overlap so a reader never has to assume.
    """
    by_source: dict[str, set[str]] = defaultdict(set)
    for res in results:
        by_source[res["source_id"] or "unknown"].add(res["canonical_url"])

    sets = list(by_source.values())
    all_works: set[str] = set().union(*sets) if sets else set()
    in_every: set[str] = set.intersection(*sets) if sets else set()

    per_source = {}
    for source, works in sorted(by_source.items()):
        others: set[str] = set()
        for other_source, other_works in by_source.items():
            if other_source != source:
                others |= other_works
        per_source[source] = {
            "works_listed": len(works),
            "works_only_this_source_lists": len(works - others),
        }
    return {
        "distinct_works": len(all_works),
        "works_every_source_lists": len(in_every),
        "by_source": per_source,
    }


def _row_month(row: dict) -> Optional[tuple[int, int]]:
    """The publication month of one archive row, from its date or its URL."""
    date = parse_date(row.get("publication_date") or "") or date_from_url(
        canonical_source_url(row.get("url") or "")
    )
    return (date[0], date[1]) if date else None


def _months_without_listings(
    results: list[dict], rows: list[dict], start_year: int, end_year: int
) -> list[dict]:
    """Months of the window that no source lists anything for.

    A month nobody can see is the strongest coverage limit this report has, so
    it is measured rather than left as a caveat.
    """
    listed = set()
    for res in results:
        date = parse_date(res["date"] or "")
        if date:
            listed.add((date[0], date[1]))

    archive_months: dict[tuple[int, int], int] = defaultdict(int)
    legacy_months: dict[tuple[int, int], int] = defaultdict(int)
    for row in rows:
        row_month = _row_month(row)
        if row_month is None:
            continue
        archive_months[row_month] += 1
        if canonical_source_url(row.get("url") or "").startswith(LEGACY_HOST + "/"):
            legacy_months[row_month] += 1

    empty = []
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            if (year, month) in listed:
                continue
            empty.append(
                {
                    "month": f"{year:04d}-{month:02d}",
                    "archive_rows": archive_months.get((year, month), 0),
                    "legacy_host_rows": legacy_months.get((year, month), 0),
                }
            )
    return empty


def build_report(
    inventories: list[dict],
    rows: Iterable[dict],
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
) -> dict:
    """Match every in-window inventory entry and group the outcomes."""
    row_list = list(rows)
    index = build_archive_index(row_list)
    entries = _dedupe_entries(inventories)

    results: list[dict] = []
    skipped_out_of_window = 0
    for entry in entries:
        canon = canonical_source_url(entry.get("url") or "")
        date = parse_date(entry.get("date") or "") or date_from_url(canon)
        entry_year = date[0] if date else None
        if not _in_window(entry_year, start_year, end_year):
            skipped_out_of_window += 1
            continue
        results.append(classify_entry(entry, index))

    # Runs before anything is counted, so a conflicted claim is never counted
    # as present anywhere in the report.
    conflicts = _flag_conflicting_claims(results)

    totals: dict[str, int] = defaultdict(int)
    tier_counts: dict[str, int] = defaultdict(int)
    by_year: dict[str, dict[str, int]] = {}
    by_source: dict[str, dict[str, int]] = {}
    by_source_year: dict[str, dict[str, dict[str, int]]] = {}

    def bump(bucket: dict[str, int], status: str) -> None:
        bucket[status] = bucket.get(status, 0) + 1

    for res in results:
        status = res["status"]
        totals[status] += 1
        tier_counts[res["tier"]] += 1
        year_key = str(res["year"])
        source = res["source_id"] or "unknown"
        by_year.setdefault(year_key, {}).setdefault(status, 0)
        bump(by_year[year_key], status)
        by_source.setdefault(source, {}).setdefault(status, 0)
        bump(by_source[source], status)
        by_source_year.setdefault(source, {}).setdefault(year_key, {})
        bump(by_source_year[source][year_key], status)

    archive_in_window = [
        r
        for r in row_list
        if _in_window(
            (
                parse_date(r.get("publication_date") or "")
                or date_from_url(canonical_source_url(r.get("url") or ""))
                or (None, None, None)
            )[0],
            start_year,
            end_year,
        )
    ]

    return {
        "issue": 815,
        "window": {"start_year": start_year, "end_year": end_year},
        "sources": [
            {
                "source_id": inv.get("source_id"),
                "source_name": inv.get("source_name"),
                "provenance": inv.get("provenance"),
                "retrieved_at": inv.get("retrieved_at"),
                "coverage_note": inv.get("coverage_note"),
                "entries_in_file": len(inv.get("entries", [])),
            }
            # Sorted, so the report does not change with the order the
            # inventory files are passed in.
            for inv in sorted(inventories, key=lambda i: i.get("source_id") or "")
        ],
        "archive": {
            "rows_indexed": len(row_list),
            "rows_in_window": len(archive_in_window),
            "ambiguous_fingerprints": len(index.ambiguous_fingerprints),
        },
        "candidates_considered": len(results),
        "entries_outside_window": skipped_out_of_window,
        "months_in_window": (end_year - start_year + 1) * 12,
        "months_without_listings": _months_without_listings(
            results, row_list, start_year, end_year
        ),
        "source_overlap": _source_overlap(results),
        "conflicting_claims": conflicts,
        "distinct_works": _distinct_works(results),
        "totals": {
            "present": totals["present"],
            "needs_review": totals["needs_review"],
            "missing": totals["missing"],
        },
        "tier_counts": dict(sorted(tier_counts.items())),
        "by_year": {k: _ordered_statuses(v) for k, v in sorted(by_year.items())},
        "by_source": {k: _ordered_statuses(v) for k, v in sorted(by_source.items())},
        "by_source_year": {
            source: {
                year: _ordered_statuses(bucket)
                for year, bucket in sorted(years.items())
            }
            for source, years in sorted(by_source_year.items())
        },
        "results": sorted(
            results, key=lambda r: (r["date"] or "", r["source_id"] or "", r["url"])
        ),
    }


def _distinct_works(results: list[dict]) -> dict:
    """Roll the per-source rows up to one row per distinct work.

    Two sources can list the same post. Counting each listing separately is
    right for "how well does each source agree with the archive", and wrong for
    "how many works are missing". This rollup answers the second question:
    one row per canonical URL, holding the strongest status any source reached.
    """

    def rank(res: dict) -> tuple[int, int, str]:
        # Strongest status first, then the listing that carries a title, then
        # the source id, so the representative row never depends on the order
        # the inventory files were read in.
        return (
            STATUS_RANK[res["status"]],
            0 if res["title"] else 1,
            res["source_id"] or "",
        )

    best: dict[str, dict] = {}
    for res in results:
        key = res["canonical_url"]
        current = best.get(key)
        if current is None or rank(res) < rank(current):
            best[key] = res

    totals: dict[str, int] = {"present": 0, "needs_review": 0, "missing": 0}
    by_year: dict[str, dict[str, int]] = {}
    for res in best.values():
        status = res["status"]
        totals[status] += 1
        year = str(res["year"])
        bucket = by_year.setdefault(year, {})
        bucket[status] = bucket.get(status, 0) + 1

    def works(status: str) -> list[dict]:
        return [
            {
                "date": r["date"],
                "title": r["title"],
                "url": r["url"],
                "canonical_url": r["canonical_url"],
                "source_id": r["source_id"],
                "evidence": r.get("evidence"),
                "matched_id": r["matched_id"],
                "note": r["note"],
            }
            for r in sorted(
                (r for r in best.values() if r["status"] == status),
                key=lambda r: (r["date"] or "", r["canonical_url"]),
            )
        ]

    return {
        "count": len(best),
        "totals": totals,
        "by_year": {
            year: _ordered_statuses(bucket) for year, bucket in sorted(by_year.items())
        },
        "missing_urls": sorted(
            r["canonical_url"] for r in best.values() if r["status"] == "missing"
        ),
        "missing_works": works("missing"),
        "needs_review_works": works("needs_review"),
    }


def _status_row(bucket: dict[str, int]) -> tuple[int, int, int, int]:
    present = bucket.get("present", 0)
    review = bucket.get("needs_review", 0)
    missing = bucket.get("missing", 0)
    return present, review, missing, present + review + missing


def render_markdown(report: dict, generated_on: str) -> str:
    """Render the checked-in markdown report."""
    w = report["window"]
    t = report["totals"]
    lines: list[str] = []
    add = lines.append

    add(
        f"# PressThink {w['start_year']}-{w['end_year']} gap measurement — {generated_on}"
    )
    add("")
    add(
        "This report measures how much of the Movable Type era of PressThink "
        "the archive already holds. It is a measurement only. It assigns no "
        "permanent IDs, import order, rights status, taxonomy, entities, or "
        "relationships."
    )
    add("")
    add(
        "Regenerate it with `backend/scripts/pressthink_2004_2008_gap.py report`. "
        "The inventories it reads are checked in under "
        "`backend/inventories/pressthink-2004-2008/`."
    )
    add("")

    add("## Source inventories")
    add("")
    add("| Source | Retrieved | Entries in file | Provenance |")
    add("| --- | --- | ---: | --- |")
    for src in report["sources"]:
        add(
            f"| {src.get('source_name') or src.get('source_id')} "
            f"| {src.get('retrieved_at') or 'unknown'} "
            f"| {src.get('entries_in_file', 0)} "
            f"| `{src.get('provenance') or 'unknown'}` |"
        )
    add("")
    for src in report["sources"]:
        note = src.get("coverage_note")
        if note:
            add(f"- **{src.get('source_id')}** — {note}")
    add("")

    overlap = report.get("source_overlap") or {}
    per_source = overlap.get("by_source") or {}
    if len(per_source) > 1:
        add("### How far the sources overlap")
        add("")
        add("| Source | Works listed | Works only this source lists |")
        add("| --- | ---: | ---: |")
        for source, counts in per_source.items():
            add(
                f"| `{source}` | {counts['works_listed']} "
                f"| {counts['works_only_this_source_lists']} |"
            )
        add("")
        only_counts = [c["works_only_this_source_lists"] for c in per_source.values()]
        if not any(only_counts):
            add(
                f"The sources resolve to the same {overlap['distinct_works']} "
                "urls for this window. Neither one lists a work the other misses. "
                "Both also read the same Wayback Machine crawl of the same host, "
                "so the second source is not independent evidence and their "
                "agreement corroborates nothing. What the second source adds is "
                "a different view of the same crawl, not extra coverage."
            )
        else:
            add(
                f"The sources list {overlap['distinct_works']} works between "
                f"them, and {overlap['works_every_source_lists']} of those "
                "appear in every source. Both read the Wayback Machine, so "
                "overlap between them is not independent corroboration."
            )
        add("")

    add("## What counts as confirmed")
    add("")
    add(
        "A work is present only when one of three tiers matches it to an "
        "archive row. Every other outcome is review or missing."
    )
    add("")
    add(
        "- `exact_url` — the source url is an archive row's url, after both are "
        "reduced to one key. This is the strongest evidence the report has."
    )
    add(
        "- `body_fingerprint` — the first twelve words of the post's own text "
        "match the opening of a row. A fingerprint that two rows share is "
        "dropped, never resolved to one of them."
    )
    add(
        "- `title_strong` — same publication date, and the titles agree. Near "
        "identical token sets agree. One title inside another agrees only when "
        "the overlap is still high and the extra words are not a part marker, "
        "because serial posts differ by a part marker alone."
    )
    add(
        "- One archive row holds one work. If two source works both reach a "
        "present grade against the same row, only the stronger tier keeps it "
        "and the other goes to review."
    )
    add("")

    distinct = report["distinct_works"]
    dt = distinct["totals"]

    add("## The answer")
    add("")
    add(
        "One row per distinct work, holding the strongest result any source "
        "reached. This is the count of how much of the era the archive holds."
    )
    add("")
    add(f"- Distinct works the sources list for the window: {distinct['count']}.")
    add(f"- Present in the archive: {dt['present']}.")
    add(f"- Needs review: {dt['needs_review']}.")
    add(f"- Missing: {dt['missing']}.")
    add("")
    add(
        f"Only the {dt['present']} present works are confirmed. The other "
        f"{dt['needs_review'] + dt['missing']} are not, and this report does "
        "not count a work as held until one of the tiers confirms it."
    )
    add("")
    add("| Year | Present | Needs review | Missing | Works |")
    add("| --- | ---: | ---: | ---: | ---: |")
    for year, bucket in distinct["by_year"].items():
        present, review, missing, total = _status_row(bucket)
        add(f"| {year} | {present} | {review} | {missing} | {total} |")
    add("")

    add("## Totals by source listing")
    add("")
    add(
        "The same works counted once per source that lists them. These rows "
        "show how much each source's listings could be confirmed against the "
        "archive. They do not corroborate each other: read the overlap table "
        "above before reading two agreeing sources as two measurements."
    )
    add("")
    add(f"- Archive rows indexed: {report['archive']['rows_indexed']}.")
    add(
        f"- Archive rows dated {w['start_year']}-{w['end_year']}: "
        f"{report['archive']['rows_in_window']}."
    )
    add(f"- Source listings in window: {report['candidates_considered']}.")
    add(f"- Present: {t['present']}.")
    add(f"- Needs review: {t['needs_review']}.")
    add(f"- Missing: {t['missing']}.")
    add("")
    add("Tier counts:")
    add("")
    add("| Tier | Status | Count |")
    add("| --- | --- | ---: |")
    for tier, count in report["tier_counts"].items():
        add(f"| `{tier}` | {STATUS_BY_TIER.get(tier, 'unknown')} | {count} |")
    add("")
    tiers_used = [t for t in PRESENT_TIERS if report["tier_counts"].get(t)]
    if tiers_used == ["exact_url"]:
        add(
            "Every confirmed listing in this run was confirmed on the url tier. "
            "The title and body tiers ran and confirmed nothing, so the "
            "measurement rests on the url join alone."
        )
        add("")

    add("## By year, counting every source listing")
    add("")
    add("| Year | Present | Needs review | Missing | Listings |")
    add("| --- | ---: | ---: | ---: | ---: |")
    for year, bucket in report["by_year"].items():
        present, review, missing, total = _status_row(bucket)
        add(f"| {year} | {present} | {review} | {missing} | {total} |")
    add("")

    add("## By source")
    add("")
    add("| Source | Present | Needs review | Missing | Listings |")
    add("| --- | ---: | ---: | ---: | ---: |")
    for source, bucket in report["by_source"].items():
        present, review, missing, total = _status_row(bucket)
        add(f"| `{source}` | {present} | {review} | {missing} | {total} |")
    add("")

    add("## By source and year")
    add("")
    add("| Source | Year | Present | Needs review | Missing |")
    add("| --- | --- | ---: | ---: | ---: |")
    for source, years in report["by_source_year"].items():
        for year, bucket in years.items():
            present, review, missing, _ = _status_row(bucket)
            add(f"| `{source}` | {year} | {present} | {review} | {missing} |")
    add("")

    missing_rows = [r for r in report["results"] if r["status"] == "missing"]
    add(f"## Missing listings ({len(missing_rows)})")
    add("")
    if not missing_rows:
        add("No source listing in the window is unmatched.")
    else:
        listed_urls = {r["canonical_url"] for r in missing_rows}
        unmatched = {w["canonical_url"] for w in distinct["missing_works"]}
        outright = len(listed_urls & unmatched)
        elsewhere = len(listed_urls) - outright
        add(
            f"No archive row matches these source listings. They cover "
            f"{len(listed_urls)} distinct works: {outright} that no source "
            f"could confirm, and {elsewhere} that another source's listing "
            "carried further. Each row names the source that lists it and the "
            "evidence to re-check."
        )
        add("")
        add("| Date | Title | Source URL | Source | Evidence |")
        add("| --- | --- | --- | --- | --- |")
        for r in missing_rows:
            title = (r["title"] or "(no title in source)").replace("|", "\\|")
            evidence = r.get("evidence") or ""
            add(
                f"| {r['date']} | {title} | `{r['url']}` | `{r['source_id']}` "
                f"| {evidence} |"
            )
    add("")

    review_rows = [r for r in report["results"] if r["status"] == "needs_review"]
    add(f"## Needs review ({len(review_rows)})")
    add("")
    if not review_rows:
        add("No source listing in the window needs a human decision.")
    else:
        add(
            "These listings have partial evidence. A curator decides whether "
            "the named archive row already holds the work."
        )
        add("")
        add("| Date | Source title | Closest archive row | Score | Why |")
        add("| --- | --- | --- | ---: | --- |")
        for r in review_rows:
            title = (r["title"] or "(no title in source)").replace("|", "\\|")
            matched = (r.get("matched_title") or "").replace("|", "\\|")
            add(
                f"| {r['date']} | {title} | `{r['matched_id']}` {matched} "
                f"| {r['score']} | {r['note']} |"
            )
    add("")

    conflicts = report.get("conflicting_claims") or []
    add(f"## Conflicting claims ({len(conflicts)})")
    add("")
    if not conflicts:
        add("No archive row is claimed by more than one source work.")
    else:
        add(
            "Each archive row below matched more than one source work. One row "
            "holds one work, so the weaker claim is sent to review rather than "
            "counted present. A conflict usually means the row carries the "
            "wrong title, url, or date, so fix the row before reading the "
            "affected works as missing."
        )
        add("")
        add("| Archive row | Kept claim | Tier | Sent to review |")
        add("| --- | --- | --- | --- |")
        for conflict in conflicts:
            sent = ", ".join(
                f"`{item['canonical_url']}` ({item['tier']})"
                for item in conflict["sent_to_review"]
            )
            add(
                f"| `{conflict['record_id']}` "
                f"| `{conflict['kept']['canonical_url']}` "
                f"| `{conflict['kept']['tier']}` | {sent} |"
            )
    add("")

    add("## Coverage limits")
    add("")
    add(
        "- `missing` means no archive row matches a source listing. It is not "
        "proof that the archive lost the work, and a curator confirms every row "
        "before any recovery work starts."
    )
    add(
        "- Absence from an inventory is not proof that a work never existed. "
        "Both inventories depend on what the Wayback Machine captured, and a "
        "post that was never crawled and never linked from a monthly page "
        "appears in neither."
    )
    blind = report.get("months_without_listings") or []
    if blind:
        names = ", ".join(item["month"] for item in blind)
        archive_rows = sum(item["archive_rows"] for item in blind)
        legacy_rows = sum(item["legacy_host_rows"] for item in blind)
        add(
            f"- No source lists anything for {len(blind)} of the "
            f"{report.get('months_in_window', 0)} months in the window: "
            f"{names}. The Wayback Machine holds no usable snapshot of those "
            "month index pages and no captured post url inside them. The "
            f"archive holds {archive_rows} rows dated in those months, "
            f"{legacy_rows} of them on `{LEGACY_HOST}`. Those months are "
            "unmeasured, not empty: this report cannot say whether Rosen "
            "published in them."
        )
    add(
        "- The two inventories are not independent. Both read the same Wayback "
        "Machine crawl of the same host, and for this window they resolve to "
        "the same url set, so neither one widens the other. The monthly pages "
        "are the more useful of the two because they carry the published title "
        "and standfirst; the capture index carries urls only, so against that "
        "source only the url tier can run."
    )
    add(
        "- Movable Type published every post twice, as `slug.html` and the print "
        "twin `slug_p.html`. Both fold to one canonical key, so a row that "
        "stores either twin counts as present."
    )
    add(
        "- `archive.pressthink.org` serves an untrusted TLS certificate. Its "
        "URLs are stored and fetched over plain `http`, and comparison ignores "
        "the scheme."
    )
    add(
        "- Works Rosen published elsewhere in this window (HuffPost, The Nation, "
        "print) are outside both inventories. This report says nothing about them."
    )
    ambiguous = report.get("archive", {}).get("ambiguous_fingerprints", 0)
    if ambiguous:
        add(
            f"- {ambiguous} body fingerprints are shared by more than one "
            "archive row. The fingerprint tier drops them rather than pick a "
            "row, so those rows can only be confirmed by url or title."
        )
    add("")

    add("## Follow-up recovery work")
    add("")
    add(
        "Recovery, permanent IDs, rights, taxonomy, and relationship decisions "
        "stay out of this measurement. The measured gap decomposes into two "
        "lists, and each one has a different owner."
    )
    add("")
    missing_works = distinct.get("missing_works") or []
    add(
        f"**{len(missing_works)} works have no archive row at all.** They are "
        "source preservation work (#697): capture the Wayback copy first, then "
        "decide whether the work earns a record. Read the titles before "
        "opening that work. Some of these are the site's own housekeeping "
        "notices rather than essays, and a notice is not the same kind of loss."
    )
    add("")
    if not missing_works:
        add("No work in the window is unmatched.")
    else:
        add("| Date | Title | Source url | Evidence |")
        add("| --- | --- | --- | --- |")
        for work in missing_works:
            title = (work["title"] or "(no title in source)").replace("|", "\\|")
            add(
                f"| {work['date']} | {title} | `{work['url']}` "
                f"| {work.get('evidence') or ''} |"
            )
    add("")
    review_works = distinct.get("needs_review_works") or []
    add(
        f"**{len(review_works)} works have a candidate archive row whose "
        "identity is in doubt.** They are record quality work (#723): settle "
        "what each row holds, fix the row, then re-run this report. Nothing "
        "here needs recovery until the row is settled."
    )
    add("")
    if not review_works:
        add("No work in the window needs a curator decision.")
    else:
        add("| Date | Title | Closest archive row | Why |")
        add("| --- | --- | --- | --- |")
        for work in review_works:
            title = (work["title"] or "(no title in source)").replace("|", "\\|")
            add(
                f"| {work['date']} | {title} | `{work['matched_id']}` "
                f"| {work['note']} |"
            )
    add("")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# inventory acquisition
# --------------------------------------------------------------------------


def _http_get(url: str, timeout: int = 60, attempts: int = 8) -> str:
    """Fetch a URL as text, retrying on transient network failures.

    The Wayback Machine resets a large share of connections. A reset fails
    fast, so many short retries move a run along far better than a few long
    backoffs.
    """
    last: Optional[Exception] = None
    for _ in range(attempts):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
                body: str = resp.read().decode("utf-8", "replace")
                return body
        except (urllib.error.URLError, OSError, http.client.HTTPException) as exc:
            # HTTPException covers IncompleteRead, which the Wayback Machine
            # raises when it cuts a response short. It is not an OSError, so
            # without this the whole run dies on one truncated page.
            last = exc
            time.sleep(2)
    raise OSError(f"could not fetch {url}: {last}")


def cdx_query_url(host: str, endpoint: str = CDX_ENDPOINT) -> str:
    """Build the Wayback capture-index query used for the url inventory."""
    return (
        f"{endpoint}?url={host}*&collapse=urlkey"
        "&fl=original,timestamp,mimetype,statuscode,digest"
        "&filter=statuscode:200&filter=mimetype:text/html"
    )


def parse_cdx(text: str, start_year: int, end_year: int) -> list[dict]:
    """Turn CDX lines into inventory entries for dated Movable Type posts."""
    entries: dict[str, dict] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        original, timestamp = parts[0], parts[1]
        canon = canonical_source_url(original)
        date = date_from_url(canon)
        if date is None or not _in_window(date[0], start_year, end_year):
            continue
        if canon in entries:
            continue
        entries[canon] = {
            "url": legacy_fetch_url(strip_default_port(original)),
            "date": f"{date[0]:04d}-{date[1]:02d}-{date[2]:02d}",
            "evidence": f"https://web.archive.org/web/{timestamp}/{original}",
        }
    return [entries[k] for k in sorted(entries)]


def monthly_index_url(year: int, month: int) -> str:
    """The Movable Type monthly archive page for one month."""
    return f"http://{LEGACY_HOST}/{year:04d}/{month:02d}/"


def _clean_html_text(fragment: str) -> str:
    text = re.sub(r"<[^>]+>", " ", fragment)
    text = _html.unescape(text)
    text = text.replace("�", "'")
    return re.sub(r"\s+", " ", text).strip()


_TITLE_BLOCK_RE = re.compile(
    r'<h3[^>]*class="title"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>\s*</h3>'
    r'(?:\s*<h4[^>]*class="subhead"[^>]*>(.*?)</h4>)?',
    re.IGNORECASE | re.DOTALL,
)


def parse_monthly_index(html_text: str, year: int, month: int) -> list[dict]:
    """Extract (url, date, title, body) entries from one monthly archive page.

    Only links whose own path carries the requested year and month are kept, so
    sidebar links to other months and to other sites are ignored.
    """
    entries: dict[str, dict] = {}
    for href, raw_title, raw_body in _TITLE_BLOCK_RE.findall(html_text):
        canon = canonical_source_url(href)
        date = date_from_url(canon)
        if date is None or date[0] != year or date[1] != month:
            continue
        if not canon.startswith(LEGACY_HOST + "/"):
            continue
        title = _clean_html_text(raw_title)
        if not title:
            continue
        entry = {
            "url": legacy_fetch_url(_html.unescape(href)),
            "date": f"{date[0]:04d}-{date[1]:02d}-{date[2]:02d}",
            "title": title,
        }
        body = _clean_html_text(raw_body or "")
        if body:
            entry["body"] = body
        entries.setdefault(canon, entry)
    return [entries[k] for k in sorted(entries)]


def month_snapshots_query() -> str:
    """One capture-index query that covers every monthly archive page.

    Asking the capture index once, instead of once per month, keeps the run
    short. The Wayback Machine resets connections when a client asks too often,
    and per-month queries pushed a full run past an hour. This is the same
    collapsed query the url inventory uses, so there is one query shape to
    trust; ``collapse=urlkey`` keeps the response small enough to arrive whole.
    """
    return cdx_query_url(LEGACY_HOST)


def month_fallback_query(year: int, month: int) -> str:
    """Every capture of one month index page, for a month the collapsed query
    could not resolve. Used only as a fallback, so it stays rare."""
    return (
        f"{CDX_ENDPOINT}?url={LEGACY_HOST}/{year:04d}/{month:02d}/"
        "&fl=original,timestamp&filter=statuscode:200&limit=6"
    )


def parse_month_snapshots(text: str) -> dict[tuple[int, int], list[str]]:
    """Group capture timestamps by the month index page they belong to."""
    found: dict[tuple[int, int], list[str]] = defaultdict(list)
    for line in text.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        canon = canonical_source_url(parts[0])
        m = re.match(r"^" + re.escape(LEGACY_HOST) + r"/(\d{4})/(\d{2})$", canon)
        if m:
            found[(int(m.group(1)), int(m.group(2)))].append(parts[1])
    return {key: sorted(set(values)) for key, values in found.items()}


def fetch_monthly_index_entries(
    year: int, month: int, timestamps: list[str]
) -> tuple[list[dict], str]:
    """Fetch and parse one monthly archive page. Returns (entries, evidence).

    A month with no reachable snapshot returns no entries rather than failing
    the run, and the caller records it as a coverage hole.
    """
    target = monthly_index_url(year, month)
    for timestamp in reversed(timestamps):
        raw = WAYBACK_RAW.format(timestamp=timestamp, url=target)
        try:
            body = _http_get(raw)
        except (OSError, http.client.HTTPException):
            continue
        entries = parse_monthly_index(body, year, month)
        if entries:
            evidence = f"https://web.archive.org/web/{timestamp}/{target}"
            for entry in entries:
                entry["evidence"] = evidence
            return entries, evidence
    return [], ""


def _write_inventory(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def load_archive_rows(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _today() -> str:
    return _dt.date.today().isoformat()


def cmd_fetch_cdx(args: argparse.Namespace) -> int:
    query = cdx_query_url(args.host)
    text = _http_get(query, timeout=180)
    entries = parse_cdx(text, args.start_year, args.end_year)
    _write_inventory(
        args.out,
        {
            "source_id": "wayback-cdx",
            "source_name": (
                f"Wayback Machine capture index for {args.host} "
                f"({args.start_year}-{args.end_year})"
            ),
            "provenance": query,
            "retrieved_at": _today(),
            "coverage_note": (
                "every distinct dated post url the Wayback Machine captured with "
                "a 200 html response; urls only, no titles, so only the url tier "
                "can run against it. It reads the same crawl as the monthly "
                "index, so it is not an independent source"
            ),
            "entries": entries,
        },
    )
    print(f"wrote {len(entries)} entries to {args.out}")
    return 0


def _fetch_one_month(
    year: int, month: int, snapshots: dict[tuple[int, int], list[str]]
) -> tuple[int, int, list[dict], str]:
    found, evidence = fetch_monthly_index_entries(
        year, month, snapshots.get((year, month), [])
    )
    if not found:
        # The collapsed query gives one capture per page. When that one cannot
        # be parsed, ask for this month's other captures.
        try:
            extra = parse_month_snapshots(_http_get(month_fallback_query(year, month)))
        except (OSError, http.client.HTTPException):
            extra = {}
        found, evidence = fetch_monthly_index_entries(
            year, month, extra.get((year, month), [])
        )
    return year, month, found, evidence


def cmd_fetch_monthly_index(args: argparse.Namespace) -> int:
    snapshot_query = month_snapshots_query()
    snapshots = parse_month_snapshots(_http_get(snapshot_query, timeout=180))
    months = [
        (year, month)
        for year in range(args.start_year, args.end_year + 1)
        for month in range(1, 13)
    ]
    # A few months at a time. The Wayback Machine resets many connections, and
    # a serial run spends most of its wall time waiting on retries.
    results: dict[tuple[int, int], tuple[list[dict], str]] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(_fetch_one_month, year, month, snapshots)
            for year, month in months
        ]
        for future in as_completed(futures):
            year, month, found, evidence = future.result()
            results[(year, month)] = (found, evidence)
            label = f"{year:04d}-{month:02d}"
            if found:
                print(f"{label}: {len(found)} posts  {evidence}", file=sys.stderr)
            else:
                print(f"{label}: no usable snapshot", file=sys.stderr)

    entries: list[dict] = []
    months_covered: list[str] = []
    months_empty: list[str] = []
    for year, month in months:
        found, _ = results[(year, month)]
        label = f"{year:04d}-{month:02d}"
        if found:
            months_covered.append(label)
            entries.extend(found)
        else:
            months_empty.append(label)
    _write_inventory(
        args.out,
        {
            "source_id": "wayback-monthly-index",
            "source_name": (
                "PressThink Movable Type monthly archive pages, read through the "
                "Wayback Machine"
            ),
            "provenance": (
                f"https://web.archive.org/web/*/{LEGACY_HOST}/YYYY/MM/ for "
                f"{args.start_year}-01 through {args.end_year}-12; snapshot "
                f"timestamps from {snapshot_query}"
            ),
            "retrieved_at": _today(),
            "coverage_note": (
                "the site's own month index, so it carries the published title "
                "and standfirst for each post; a month with no usable snapshot "
                "contributes nothing and is listed in months_without_snapshot"
            ),
            "months_with_snapshot": months_covered,
            "months_without_snapshot": months_empty,
            "entries": entries,
        },
    )
    print(f"wrote {len(entries)} entries to {args.out}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    if not args.archive.exists():
        print(f"error: archive CSV not found: {args.archive}", file=sys.stderr)
        return 1
    paths = args.inventory or sorted(DEFAULT_INVENTORY_DIR.glob("*.json"))
    paths = [p for p in paths if p.name != "gap-report.json"]
    if not paths:
        print("error: no inventory files given or found", file=sys.stderr)
        return 1
    inventories = [load_inventory(p) for p in paths]
    rows = load_archive_rows(args.archive)
    report = build_report(inventories, rows, args.start_year, args.end_year)

    t = report["totals"]
    print(f"source candidates : {report['candidates_considered']}")
    print(f"present           : {t['present']}")
    print(f"needs review      : {t['needs_review']}")
    print(f"missing           : {t['missing']}")

    if args.out_json:
        args.out_json.parent.mkdir(parents=True, exist_ok=True)
        args.out_json.write_text(
            json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"wrote {args.out_json}")
    if args.out_markdown:
        args.out_markdown.parent.mkdir(parents=True, exist_ok=True)
        args.out_markdown.write_text(
            render_markdown(report, args.generated_on or _today()), encoding="utf-8"
        )
        print(f"wrote {args.out_markdown}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)

    cdx = sub.add_parser("fetch-cdx", help="build the capture-index inventory")
    cdx.add_argument("--host", default=LEGACY_HOST)
    cdx.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR)
    cdx.add_argument("--end-year", type=int, default=DEFAULT_END_YEAR)
    cdx.add_argument(
        "--out", type=Path, default=DEFAULT_INVENTORY_DIR / "wayback-cdx.json"
    )
    cdx.set_defaults(func=cmd_fetch_cdx)

    monthly = sub.add_parser(
        "fetch-monthly-index", help="build the monthly-archive-page inventory"
    )
    monthly.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR)
    monthly.add_argument("--end-year", type=int, default=DEFAULT_END_YEAR)
    monthly.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_INVENTORY_DIR / "wayback-monthly-index.json",
    )
    monthly.add_argument(
        "--workers",
        type=int,
        default=6,
        help="how many months to fetch at once (default 6)",
    )
    monthly.set_defaults(func=cmd_fetch_monthly_index)

    rep = sub.add_parser("report", help="measure the gap from checked-in inventories")
    rep.add_argument("--inventory", type=Path, action="append")
    rep.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    rep.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR)
    rep.add_argument("--end-year", type=int, default=DEFAULT_END_YEAR)
    rep.add_argument("--out-json", type=Path)
    rep.add_argument("--out-markdown", type=Path)
    rep.add_argument(
        "--generated-on",
        help="date stamp for the markdown heading; defaults to today",
    )
    rep.set_defaults(func=cmd_report)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
