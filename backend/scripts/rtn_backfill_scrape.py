"""Pillar 2 RTN sweep — paginate rebootnews.wordpress.com, extract every
numbered "Rebooting the News #N" post, and emit a JSON catalog.

Run once locally with poetry env active:

    poetry run python backend/scripts/rtn_backfill_scrape.py \\
        --out backend/scripts/rtn_episodes.json

Output shape:
    [
      {"number": 94, "date": "2011-05-23", "url": "...", "title": "...",
       "mp3_url": "...", "summary": "...", "verified": true},
      ...
    ]

This is a scrape utility, not part of the runtime pipeline — committed for
reproducibility only. The verified RTN episode records are appended to
data/archive_records-public.csv by a separate hand-curated step that picks
~10-12 candidates from this catalog spanning the full date range.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup

BASE = "https://rebootnews.wordpress.com"
TITLE_RE = re.compile(r"^Rebooting the News\s*#(\d+)$", re.IGNORECASE)
MP3_RE = re.compile(r'https?://[^\s"\'<>]+\.mp3', re.IGNORECASE)
DATE_FROM_URL_RE = re.compile(r"/(\d{4})/(\d{2})/(\d{2})/")

UA = "rosen-frontend-archive-pillar2/1.0 (+https://github.com/jamditis/rosen-frontend)"


def fetch(url: str) -> Optional[str]:
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=30)
    except requests.RequestException as e:
        print(f"  ! fetch error: {url}: {e}", file=sys.stderr)
        return None
    if r.status_code != 200:
        print(f"  ! status {r.status_code}: {url}", file=sys.stderr)
        return None
    return r.text


def head_ok(url: str) -> bool:
    try:
        r = requests.head(url, headers={"User-Agent": UA}, timeout=15, allow_redirects=True)
        return 200 <= r.status_code < 400
    except requests.RequestException:
        return False


def parse_listing(html: str) -> list[dict]:
    """Extract (number, post_url, title, date) from a WordPress index page."""
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not href.startswith(BASE):
            continue
        if href in seen:
            continue
        title = (a.get_text() or "").strip()
        m = TITLE_RE.match(title)
        if not m:
            continue
        date_m = DATE_FROM_URL_RE.search(href)
        if not date_m:
            continue
        seen.add(href)
        y, mo, d = date_m.groups()
        out.append({
            "number": int(m.group(1)),
            "url": href,
            "title": title,
            "date": f"{y}-{mo}-{d}",
        })
    return out


def parse_episode(html: str) -> dict:
    """Pull MP3 URL + summary excerpt from a single episode post."""
    soup = BeautifulSoup(html, "html.parser")
    body = soup.find("div", class_="entry-content") or soup.find("article") or soup
    text = body.get_text(separator=" ", strip=True) if body else ""
    summary = (text[:600] + "…") if len(text) > 600 else text

    mp3_url = ""
    for a in body.find_all("a", href=True) if body else []:
        if MP3_RE.match(a["href"]):
            mp3_url = a["href"]
            break
    if not mp3_url:
        m = MP3_RE.search(html)
        if m:
            mp3_url = m.group(0)

    return {"mp3_url": mp3_url, "summary": summary}


def crawl(max_pages: int = 20, sleep: float = 1.0) -> list[dict]:
    catalog: dict[int, dict] = {}
    page = 1
    while page <= max_pages:
        url = BASE if page == 1 else f"{BASE}/page/{page}/"
        print(f"[index] {url}", file=sys.stderr)
        html = fetch(url)
        if html is None:
            break
        items = parse_listing(html)
        if not items:
            print(f"[index] no new items at page {page}; stopping", file=sys.stderr)
            break
        new_count = 0
        for it in items:
            if it["number"] in catalog:
                continue
            catalog[it["number"]] = it
            new_count += 1
        print(f"[index] +{new_count} (total {len(catalog)})", file=sys.stderr)
        if new_count == 0:
            break
        page += 1
        time.sleep(sleep)
    return [catalog[n] for n in sorted(catalog)]


def enrich(items: list[dict], sleep: float = 1.0, verify_mp3: bool = True) -> list[dict]:
    out = []
    for it in items:
        print(f"[episode #{it['number']}] {it['url']}", file=sys.stderr)
        html = fetch(it["url"])
        if html is None:
            it["verified"] = False
            out.append(it)
            continue
        meta = parse_episode(html)
        it.update(meta)
        if verify_mp3 and meta["mp3_url"]:
            it["mp3_ok"] = head_ok(meta["mp3_url"])
        else:
            it["mp3_ok"] = False
        it["verified"] = True
        out.append(it)
        time.sleep(sleep)
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True, help="Path to output JSON")
    p.add_argument("--max-pages", type=int, default=20)
    p.add_argument("--sample-only", action="store_true",
                   help="Skip per-episode enrichment; index only")
    p.add_argument("--sleep", type=float, default=1.0)
    args = p.parse_args()

    items = crawl(max_pages=args.max_pages, sleep=args.sleep)
    print(f"\n[catalog] {len(items)} numbered episodes indexed", file=sys.stderr)
    if not args.sample_only:
        items = enrich(items, sleep=args.sleep)

    Path(args.out).write_text(json.dumps(items, indent=2))
    print(f"[catalog] wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
