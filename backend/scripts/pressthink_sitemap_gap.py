#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deterministic PressThink sitemap-vs-archive gap matcher.

Answers one question reproducibly: which posts on the live
``pressthink.org/post-sitemap.xml`` are already in
``data/archive_records-public.csv``, and which are genuine gaps?

Why this exists (issue #208): the original "146 missing" count was produced
by a script that lived under ``data/_recovery_tmp/`` (gitignored), so nobody
could re-run or audit it, and it went stale the moment the archive grew. This
script is checked in, takes no hidden state, and prints the same answer every
time for the same inputs.

The matching is hard because the archive holds two URL shapes that share no
slug:

    legacy  archive.pressthink.org/2010/07/07/obj_persuasion.html   (Movable Type)
    modern  pressthink.org/2010/07/objectivity-as-a-form-of-persuasion/  (WordPress)

They agree only on year and month, so a legacy record can only be matched to a
modern sitemap URL by title. Naive title-token matching produces false
positives across unrelated posts (a huffpost filename once matched a different
post sharing generic tokens). The fix is to gate every title comparison on the
record's publication year+month before scoring tokens — a post published in a
different month can never be a match — and to tier the output by confidence so
a human reviews the uncertain ones instead of trusting a flat list:

    exact_url     normalized sitemap URL is already an archive ``url`` value
    title_strong  same year+month, every slug word appears in the title
    review        same year+month weak overlap, OR a strong cross-month match
    gap           no archive record matches under any of the above

Only ``gap`` rows are candidates for editorial follow-up (Stream B in #208);
``exact_url`` and ``title_strong`` are confirmed present; ``review`` needs a
human glance.

Usage::

    # live sitemap + repo archive, print summary
    python3 backend/scripts/pressthink_sitemap_gap.py

    # write the full machine-readable report
    python3 backend/scripts/pressthink_sitemap_gap.py --out gaps.json

    # offline (for tests / reproducibility)
    python3 backend/scripts/pressthink_sitemap_gap.py \
        --sitemap-file fixture.xml --archive records.csv

This script makes no editorial or URL-canonicalization decisions — those are
Joe's calls per #208. It only measures.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path
from typing import Iterable, NamedTuple, Optional

DEFAULT_SITEMAP_URL = "https://pressthink.org/post-sitemap.xml"

# Resolve the repo's archive CSV relative to this file so the default works
# regardless of the caller's working directory: scripts/ -> backend/ -> repo.
_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARCHIVE = _REPO_ROOT / "data" / "archive_records-public.csv"

# Tokens that carry no matching signal. Kept deliberately small: an aggressive
# stopword list would let two unrelated short titles collapse to the same token
# set and match spuriously.
STOPWORDS = frozenset(
    """a an the of to in on for and or but with at by from as is are was were
    be been being it its this that these those his her their our your my you we
    they i how why what when who whom which than then so if not no""".split()
)

# A modern WordPress post URL is /YYYY/MM/slug/ , or the day-based
# /YYYY/MM/DD/slug/ variant. The optional day segment is matched but not
# captured, so either shape yields (year, month, slug) and counts as a post;
# without this, a day-based URL fell through to the non_post bucket and deflated
# the post denominator. Legacy Movable Type URLs also carry a day, but legacy and
# modern still cannot be matched on the URL alone — they agree only on year+month
# and are reconciled by title.
_MODERN_POST_RE = re.compile(r"/(\d{4})/(\d{2})/(?:\d{2}/)?([^/]+)/?$")

# Strong-match floor when slug words are not fully contained in the title.
STRONG_JACCARD = 0.8
# Weak-match floor below which we call it a gap rather than a review.
REVIEW_JACCARD = 0.5
# A slug shorter than this (after stopword removal) is too thin to title-match
# reliably; such posts fall straight to the review/gap path on token evidence.
MIN_SLUG_TOKENS = 2


class Record(NamedTuple):
    """One archive row, reduced to the fields the matcher needs."""

    record_id: str
    title: str
    url_norm: str
    year: Optional[int]
    month: Optional[int]
    tokens: frozenset[str]


class ArchiveIndex(NamedTuple):
    """Lookup structures built once from the archive for O(1)/O(bucket) matching."""

    by_url: dict[str, str]  # normalized modern URL -> record id
    by_year_month: dict[tuple[int, int], list[Record]]
    by_year: dict[int, list[Record]]


def normalize_url(url: str) -> str:
    """Reduce a URL to a comparable key: scheme/host-case/www/trailing-slash agnostic."""
    u = url.strip().lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = u.split("#", 1)[0]
    u = u.split("?", 1)[0]
    return u.rstrip("/")


def _strip_title_prefix(title: str) -> str:
    """Drop the leading ``PressThink:`` label and any wrapping quotes."""
    t = re.sub(r"^\s*pressthink\s*:\s*", "", title, flags=re.IGNORECASE)
    return t.strip().strip("\"'“”‘’")


def tokenize(text: str) -> frozenset[str]:
    """Lowercase, split on any non-alphanumeric, drop stopwords and 1-char tokens."""
    text = _strip_title_prefix(text).lower()
    # Treat every non-alphanumeric character (incl. smart quotes, hyphens,
    # em dashes) as a separator.
    parts = re.split(r"[^a-z0-9]+", text)
    return frozenset(p for p in parts if len(p) >= 2 and p not in STOPWORDS)


def parse_modern_post_url(url: str) -> Optional[tuple[int, int, str]]:
    """Return (year, month, slug) for a modern dated post URL, else None.

    Undated URLs (the homepage, ``/talks/``, category pages) return None and
    are reported separately as non-post entries.
    """
    norm = normalize_url(url)
    m = _MODERN_POST_RE.search("/" + norm)
    if not m:
        return None
    slug = m.group(3)
    # Treat a purely numeric final segment under /YYYY/MM/ as a non-post: it is an
    # archive day index (/YYYY/MM/DD/) or paginated archive (/YYYY/MM/2/), which
    # were otherwise counted as a post with a bogus numeric slug (issue #482). This
    # also drops a genuinely all-numeric post slug, but PressThink slugs are
    # word-derived, so that is a non-case here. Slugs that merely begin with
    # digits, like 99-problems, still parse.
    if slug.isdigit():
        return None
    return int(m.group(1)), int(m.group(2)), slug


def _parse_record_year_month(
    pub_date: str, url_norm: str
) -> tuple[Optional[int], Optional[int]]:
    """Year+month from the publication_date field, falling back to the URL date.

    publication_date is the canonical signal; the URL date is a backstop for
    rows with a blank or malformed date so they still land in a month bucket.
    """
    m = re.match(r"(\d{4})-(\d{2})", pub_date.strip())
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"/(\d{4})/(\d{2})/", "/" + url_norm + "/")
    if m:
        return int(m.group(1)), int(m.group(2))
    return None, None


def build_index(rows: Iterable[dict]) -> ArchiveIndex:
    """Index archive rows by modern URL and by year/month for matching."""
    by_url: dict[str, str] = {}
    by_year_month: dict[tuple[int, int], list[Record]] = defaultdict(list)
    by_year: dict[int, list[Record]] = defaultdict(list)
    for row in rows:
        record_id = (row.get("id") or "").strip()
        title = (row.get("title") or "").strip()
        url = (row.get("url") or "").strip()
        url_norm = normalize_url(url)
        year, month = _parse_record_year_month(
            row.get("publication_date") or "", url_norm
        )
        rec = Record(record_id, title, url_norm, year, month, tokenize(title))
        # A record only joins the URL index under its modern pressthink.org URL;
        # legacy archive.pressthink.org URLs never collide with sitemap URLs, so
        # indexing them here would be dead weight.
        if url_norm.startswith("pressthink.org/") and parse_modern_post_url(url_norm):
            by_url[url_norm] = record_id
        if year is not None and month is not None:
            by_year_month[(year, month)].append(rec)
        if year is not None:
            by_year[year].append(rec)
    return ArchiveIndex(dict(by_url), dict(by_year_month), dict(by_year))


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _best_in_bucket(
    slug_tokens: frozenset[str], bucket: list[Record]
) -> tuple[Optional[Record], float, bool]:
    """Best-scoring record in a bucket. Returns (record, jaccard, contained)."""
    best: Optional[Record] = None
    best_score = 0.0
    best_contained = False
    for rec in bucket:
        contained = bool(slug_tokens) and slug_tokens <= rec.tokens
        score = 1.0 if contained else _jaccard(slug_tokens, rec.tokens)
        # Prefer a containment match; among equals, the higher Jaccard wins.
        if contained and not best_contained:
            best, best_score, best_contained = rec, score, True
        elif contained == best_contained and score > best_score:
            best, best_score, best_contained = rec, score, contained
    return best, best_score, best_contained


def _is_strong_title_match(
    slug_tokens: frozenset[str], score: float, contained: bool
) -> bool:
    """Whether a bucket's best match counts as a strong title match.

    Shared by the same-month and cross-month branches of ``classify_post`` so
    the two can never apply different strength rules: a strong same-month match
    that would be confirmed must also qualify as a strong cross-month match
    that gets surfaced for review.
    """
    return (contained or score >= STRONG_JACCARD) and len(
        slug_tokens
    ) >= MIN_SLUG_TOKENS


def classify_post(url: str, index: ArchiveIndex) -> dict:
    """Classify one sitemap URL against the archive index.

    Returns a dict with keys: url, year, month, slug, tier, matched_id,
    matched_title, score, note.
    """
    parsed = parse_modern_post_url(url)
    if parsed is None:
        return {
            "url": url,
            "tier": "non_post",
            "note": "no dated /YYYY/MM/slug/ path",
        }
    year, month, slug = parsed
    url_norm = normalize_url(url)
    result = {
        "url": url,
        "year": year,
        "month": month,
        "slug": slug,
        "matched_id": None,
        "matched_title": None,
        "score": None,
        "note": "",
    }

    if url_norm in index.by_url:
        result.update(tier="exact_url", matched_id=index.by_url[url_norm], score=1.0)
        return result

    slug_tokens = tokenize(slug.replace("-", " "))
    bucket = index.by_year_month.get((year, month), [])
    rec, score, contained = _best_in_bucket(slug_tokens, bucket)

    if rec is not None and _is_strong_title_match(slug_tokens, score, contained):
        tier = "title_strong"
    elif rec is not None and score >= REVIEW_JACCARD:
        tier = "review"
        result["note"] = "weak same-month overlap"
    else:
        # Same month gave nothing solid. A re-dated post (WordPress migration
        # can shift the month) may still live in the archive under a different
        # month of the same year — surface it for review rather than calling it
        # a gap, but never auto-confirm a cross-month match.
        year_bucket = [r for r in index.by_year.get(year, []) if r.month != month]
        yr_rec, yr_score, yr_contained = _best_in_bucket(slug_tokens, year_bucket)
        if yr_rec is not None and _is_strong_title_match(
            slug_tokens, yr_score, yr_contained
        ):
            tier = "review"
            rec, score = yr_rec, yr_score
            result["note"] = (
                f"strong title match in {year}-{yr_rec.month:02d}, not {year}-{month:02d}"
            )
        else:
            tier = "gap"

    if tier != "gap" and rec is not None:
        result.update(
            matched_id=rec.record_id, matched_title=rec.title, score=round(score, 3)
        )
    result["tier"] = tier
    return result


def build_report(sitemap_urls: Iterable[str], rows: Iterable[dict]) -> dict:
    """Run the matcher over every sitemap URL and group results by tier."""
    index = build_index(rows)
    by_tier: dict[str, list[dict]] = defaultdict(list)
    for url in sitemap_urls:
        res = classify_post(url, index)
        by_tier[res["tier"]].append(res)
    counts = {tier: len(items) for tier, items in by_tier.items()}
    present = counts.get("exact_url", 0) + counts.get("title_strong", 0)
    posts = sum(v for k, v in counts.items() if k != "non_post")
    return {
        "sitemap_post_count": posts,
        "archive_record_count": index_record_total(index),
        "counts": counts,
        "summary": {
            "confirmed_present": present,
            "needs_review": counts.get("review", 0),
            "candidate_gaps": counts.get("gap", 0),
        },
        "results": {tier: by_tier[tier] for tier in sorted(by_tier)},
    }


def index_record_total(index: ArchiveIndex) -> int:
    """Count distinct records that landed in the year/month index."""
    seen = set()
    for bucket in index.by_year_month.values():
        for rec in bucket:
            seen.add(rec.record_id)
    return len(seen)


def fetch_sitemap_locs(url: str) -> list[str]:
    """Fetch a sitemap and return its <loc> URLs (post sitemaps only need this)."""
    req = urllib.request.Request(
        url, headers={"User-Agent": "rosen-archive-gap-check/1.0"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (trusted host)
        body = resp.read().decode("utf-8", "replace")
    return re.findall(r"<loc>\s*(.*?)\s*</loc>", body)


def load_sitemap_locs(args: argparse.Namespace) -> list[str]:
    if args.sitemap_file:
        text = Path(args.sitemap_file).read_text(encoding="utf-8")
        return re.findall(r"<loc>\s*(.*?)\s*</loc>", text)
    return fetch_sitemap_locs(args.sitemap_url)


def load_archive_rows(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def _print_summary(report: dict) -> None:
    c = report["counts"]
    s = report["summary"]
    print(f"archive records indexed : {report['archive_record_count']}")
    print(f"sitemap posts           : {report['sitemap_post_count']}")
    if c.get("non_post"):
        print(f"  (skipped {c['non_post']} non-post sitemap entries, e.g. homepage)")
    print("-" * 48)
    print(f"exact_url    (present)  : {c.get('exact_url', 0)}")
    print(f"title_strong (present)  : {c.get('title_strong', 0)}")
    print(f"review       (check me) : {c.get('review', 0)}")
    print(f"gap          (missing)  : {c.get('gap', 0)}")
    print("-" * 48)
    print(f"confirmed present : {s['confirmed_present']}")
    print(f"needs review      : {s['needs_review']}")
    print(f"candidate gaps    : {s['candidate_gaps']}")
    gaps = report["results"].get("gap", [])
    if gaps:
        print("\ncandidate gaps (newest first):")
        for g in sorted(gaps, key=lambda r: (r["year"], r["month"]), reverse=True)[:15]:
            print(f"  {g['year']}-{g['month']:02d}  {g['slug']}")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sitemap-url", default=DEFAULT_SITEMAP_URL)
    parser.add_argument(
        "--sitemap-file",
        help="read sitemap XML from a local file instead of fetching (offline mode)",
    )
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument("--out", type=Path, help="write the full JSON report here")
    args = parser.parse_args(argv)

    try:
        locs = load_sitemap_locs(args)
    except OSError as exc:
        print(f"error: could not load sitemap: {exc}", file=sys.stderr)
        return 1
    if not args.archive.exists():
        print(f"error: archive CSV not found: {args.archive}", file=sys.stderr)
        return 1
    rows = load_archive_rows(args.archive)

    report = build_report(locs, rows)
    _print_summary(report)
    if args.out:
        args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
