# -*- coding: utf-8 -*-
"""One publication-date backfill module with the strategy as a parameter.

Issue #189 asked for a single date-backfill module instead of three near-copies.
The three historical strategy files (``simple_date_backfill``,
``enhanced_date_backfill``, ``publication_date_backfill``) shared a constructor,
a sheet walk, a batched write, and a date normaliser; they differed only in how
far they went to find a date. That difference is now a resolver chain:

- ``simple`` reads the URL only.
- ``enhanced`` reads the URL, then the page.
- ``publication`` reads the URL, then the page, then asks Gemini.

Everything else is shared. The CLI stays preview-first: nothing connects to
Google and no optional dependency is imported until ``--live`` is supplied.
See ``README.md`` in this directory for the merge notes.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, TypeVar

try:  # Imported as ``scripts.backfill.date_backfill``.
    from .date_extraction import extract_date_from_url
except ImportError:  # Run directly as ``scripts/backfill/date_backfill.py``.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from date_extraction import extract_date_from_url

Strategy = Literal["simple", "enhanced", "publication"]
Row = TypeVar("Row")

#: Repository-anchored default for the service-account file (see #432).
_BACKEND_DIR = Path(__file__).resolve().parents[2]

#: Date formats accepted by :func:`normalize_date`, most specific first. This is
#: the union of the three historical strategy lists; their relative order is
#: preserved, so any string one of them parsed still parses the same way.
_DATE_FORMATS = (
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%fZ",
    "%Y-%m-%dT%H:%M:%SZ",
    "%m-%d-%Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%d %B %Y",
    "%d %b %Y",
    "%A, %B %d, %Y",
    "%a, %b %d, %Y",
)

_LABEL_PREFIX = re.compile(r"^(Published|Posted|Date):\s*", re.I)
_TIMEZONE_SUFFIX = re.compile(r"\s+(UTC|GMT|EST|PST|EDT|PDT).*$", re.I)
_YEAR_MONTH = re.compile(r"(\d{4})-(\d{2})")
_LONG_DATE_IN_TEXT = re.compile(r"(\w+\s+\d{1,2},?\s+\d{4})")
_DATE_ISH_CLASS = re.compile(r"byline|meta|date|time|publish", re.I)

_PAGE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

_META_SELECTORS = (
    'meta[property="article:published_time"]',
    'meta[property="article:published"]',
    'meta[name="publish-date"]',
    'meta[name="publication-date"]',
    'meta[name="date"]',
    'meta[name="pubdate"]',
    'meta[itemprop="datePublished"]',
    'meta[itemprop="publishDate"]',
    'meta[name="DC.date.issued"]',
    'meta[name="sailthru.date"]',
    'meta[name="article.published"]',
    'meta[property="bt:pubDate"]',
)

_TEXT_SELECTORS = (
    ".publish-date",
    ".publication-date",
    ".date-published",
    ".post-date",
    ".entry-date",
    ".article-date",
    ".byline-date",
    ".timestamp",
    ".published-date",
    ".date-time",
    ".post-meta .date",
    ".article-meta .date",
    ".entry-meta .date",
    ".content-date",
)


@dataclass(frozen=True)
class StrategySpec:
    """How far one strategy looks for a date, and how it writes results."""

    resolvers: tuple[str, ...]
    batch_size: int
    pause_seconds: float
    description: str


STRATEGY_SPECS: dict[Strategy, StrategySpec] = {
    "simple": StrategySpec(
        resolvers=("url",),
        batch_size=50,
        pause_seconds=1.0,
        description="URL patterns only.",
    ),
    "enhanced": StrategySpec(
        resolvers=("url", "page"),
        batch_size=20,
        pause_seconds=2.0,
        description="URL patterns, then page metadata and structured data.",
    ),
    "publication": StrategySpec(
        resolvers=("url", "page", "ai"),
        batch_size=25,
        pause_seconds=1.0,
        description="URL patterns, then the page, then a Gemini fallback.",
    ),
}


@dataclass(frozen=True)
class DateBackfillPlan:
    """The explicit choices for one date-backfill invocation."""

    strategy: Strategy
    worksheet: str
    start_row: int
    limit: int | None
    live: bool

    @property
    def end_row(self) -> int | None:
        if self.limit is None:
            return None
        return self.start_row + self.limit - 1


def select_row_window(
    rows: Sequence[Row], start_row: int, limit: int | None = None
) -> list[Row]:
    """Select data rows for an inclusive sheet-row start and optional limit."""
    if start_row < 2:
        raise ValueError("start_row must be 2 or greater")
    if limit is not None and limit <= 0:
        raise ValueError("limit must be greater than zero")

    start_index = start_row - 2
    selected = list(rows[start_index:])
    return selected if limit is None else selected[:limit]


def normalize_date(value: Any) -> str | None:
    """Return ``MM/DD/YYYY`` for a recognised date string, otherwise ``None``.

    Accepts the formats every historical strategy accepted, plus a
    ``YYYY-MM`` fallback that assumes the first of the month. Leading
    ``Published:`` style labels and trailing timezone names are stripped first.
    """
    if not value:
        return None

    text = str(value).strip()
    text = _LABEL_PREFIX.sub("", text)
    text = _TIMEZONE_SUFFIX.sub("", text)

    for date_format in _DATE_FORMATS:
        try:
            return datetime.strptime(text, date_format).strftime("%m/%d/%Y")
        except ValueError:
            continue

    match = _YEAR_MONTH.search(text)
    if match:
        year, month = match.groups()
        try:
            return datetime(int(year), int(month), 1).strftime("%m/%d/%Y")
        except ValueError:
            pass
    return None


def _column_letter(index: int) -> str:
    """Return the sheet column letter for a zero-based column index."""
    letters = ""
    while True:
        index, remainder = divmod(index, 26)
        letters = chr(65 + remainder) + letters
        if index == 0:
            break
        index -= 1
    return letters


class DateBackfiller:
    """Fill empty ``publication_date`` cells in one worksheet.

    The strategy chooses the resolver chain. Google Sheets and every optional
    dependency are imported when the object is built, not when this module is
    imported, so ``--help`` and preview runs stay dependency-free.
    """

    def __init__(self, strategy: Strategy = "enhanced", worksheet: str = "final"):
        if strategy not in STRATEGY_SPECS:
            raise ValueError(f"unknown strategy: {strategy}")
        self.strategy: Strategy = strategy
        self.spec = STRATEGY_SPECS[strategy]

        import gspread
        from dotenv import load_dotenv

        load_dotenv()
        credentials_override = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        credentials_filename = credentials_override or "google_credentials.json"
        credentials_path = _BACKEND_DIR / credentials_filename
        self.gc = gspread.service_account(filename=str(credentials_path))
        self.sh = self.gc.open(
            os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List")
        )
        self.final_ws = self.sh.worksheet(worksheet)
        self._model = None

    # --- resolvers ---------------------------------------------------------

    def resolve_from_url(self, url: str | None) -> str | None:
        """Read a date out of the URL path. Pure; no network."""
        return extract_date_from_url(url)

    def resolve_from_page(self, url: str | None) -> str | None:
        """Read a date out of the page: meta tags, time tags, JSON-LD, byline."""
        if not url:
            return None

        import json

        import requests
        from bs4 import BeautifulSoup

        try:
            response = requests.get(url, headers=_PAGE_HEADERS, timeout=15)
            soup = BeautifulSoup(response.content, "html.parser")

            for selector in _META_SELECTORS:
                element = soup.select_one(selector)
                if element:
                    found = normalize_date(
                        element.get("content") or element.get_text(strip=True)
                    )
                    if found:
                        return found

            for element in soup.find_all("time"):
                found = normalize_date(
                    element.get("datetime") or element.get("pubdate")
                )
                if found:
                    return found

            for selector in _TEXT_SELECTORS:
                element = soup.select_one(selector)
                if element:
                    text = element.get_text(strip=True)
                    if text and len(text) < 50:
                        found = normalize_date(text)
                        if found:
                            return found

            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string)
                    if isinstance(data, list):
                        data = data[0] if data else {}
                    found = normalize_date(
                        data.get("datePublished") or data.get("publishedDate")
                    )
                    if found:
                        return found
                except (json.JSONDecodeError, TypeError, KeyError, AttributeError):
                    continue

            for element in soup.find_all(["p", "div", "span"], class_=_DATE_ISH_CLASS):
                text = element.get_text(strip=True)
                if len(text) >= 100:
                    continue
                match = _LONG_DATE_IN_TEXT.search(text)
                if match:
                    found = normalize_date(match.group(1))
                    if found:
                        return found
            return None
        except Exception as exc:  # noqa: BLE001 - best-effort scrape, keep going
            print(f"    [ERROR] Page read failed: {exc}")
            return None

    def resolve_with_ai(
        self, url: str | None, title: str = "", excerpt: str = ""
    ) -> str | None:
        """Ask Gemini for the date. Last resort; costs a request per record."""
        try:
            prompt = f"""
            Extract the publication date for this article:

            URL: {url}
            Title: {title}
            Content excerpt: {excerpt[:500]}...

            Rules:
            1. Look for date patterns in the URL path
            2. For PressThink URLs, extract year/month/day from the URL structure
            3. Return date in MM/DD/YYYY format
            4. If exact day is unknown, use the 1st of the month
            5. If you cannot determine a date, respond with "UNKNOWN"

            Publication Date (MM/DD/YYYY):
            """
            response = self._gemini().generate_content(prompt)
            date_text = response.text.strip()
            if re.match(r"^\d{2}/\d{2}/\d{4}$", date_text):
                return date_text
            if date_text != "UNKNOWN":
                return normalize_date(date_text)
            return None
        except Exception as exc:  # noqa: BLE001 - best-effort fallback
            print(f"    [ERROR] AI date extraction failed for {url}: {exc}")
            return None

    def _gemini(self):
        """Build the Gemini client on first use."""
        if self._model is None:
            import google.generativeai as genai

            genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
            self._model = genai.GenerativeModel("gemini-1.5-flash")
        return self._model

    def _resolve(self, url: str, title: str, excerpt: str) -> tuple[str | None, str]:
        """Walk this strategy's resolver chain. Returns the date and its source."""
        for name in self.spec.resolvers:
            if name == "url":
                found = self.resolve_from_url(url)
            elif name == "page":
                found = self.resolve_from_page(url)
            else:
                found = self.resolve_with_ai(url, title, excerpt)
            if found:
                return found, name
        return None, "none"

    # --- sheet walk --------------------------------------------------------

    def backfill(self, start_row: int = 2, limit: int | None = None) -> dict[str, Any]:
        """Fill empty dates in a sheet-row window and return a count summary."""
        print(f"Starting publication-date backfill (strategy: {self.strategy})...")

        data = self.final_ws.get_all_values()
        if not data:
            print("No worksheet rows found.")
            return {"inspected": 0, "filled": 0, "already_dated": 0, "not_found": 0}

        headers = data[0]
        rows = data[1:]
        if "publication_date" not in headers:
            print("ERROR: publication_date column not found!")
            return {"inspected": 0, "filled": 0, "already_dated": 0, "not_found": 0}

        date_index = headers.index("publication_date")
        url_index = headers.index("url") if "url" in headers else 2
        title_index = headers.index("title") if "title" in headers else 1
        excerpt_index = headers.index("excerpt") if "excerpt" in headers else None
        date_column = _column_letter(date_index)
        selected = select_row_window(rows, start_row, limit)

        print(f"Found {len(rows)} total records")
        print(f"publication_date column: {date_index} (Column {date_column})")
        print(f"Inspecting {len(selected)} records beginning at sheet row {start_row}")

        updates: list[dict[str, Any]] = []
        by_source: dict[str, int] = {}
        filled = 0
        already_dated = 0

        for offset, row in enumerate(selected):
            row_number = start_row + offset
            current = row[date_index].strip() if date_index < len(row) else ""
            if current:
                already_dated += 1
                continue

            url = row[url_index] if url_index < len(row) else ""
            title = row[title_index] if title_index < len(row) else ""
            excerpt = (
                row[excerpt_index]
                if excerpt_index is not None and excerpt_index < len(row)
                else ""
            )
            print(f"\nProcessing row {row_number}: {url[:80]}...")

            found, source = self._resolve(url, title, excerpt)
            if not found:
                print("  [FAILED] No date found")
                continue

            by_source[source] = by_source.get(source, 0) + 1
            filled += 1
            cell = f"{date_column}{row_number}"
            updates.append({"range": cell, "values": [[found]]})
            print(f"  [SUCCESS] {source} -> {cell} = {found}")

            if len(updates) >= self.spec.batch_size:
                print(f"\n[BATCH UPDATE] Updating {len(updates)} records...")
                self.final_ws.batch_update(updates)
                updates = []
                time.sleep(self.spec.pause_seconds)

        if updates:
            print(f"\n[FINAL UPDATE] Updating {len(updates)} records...")
            self.final_ws.batch_update(updates)

        empty = len(selected) - already_dated
        summary = {
            "inspected": len(selected),
            "filled": filled,
            "already_dated": already_dated,
            "not_found": empty - filled,
            "by_source": by_source,
        }
        print("\n=== BACKFILL COMPLETE ===")
        print(f"Successfully filled: {filled}")
        for name in self.spec.resolvers:
            print(f"  - {name}: {by_source.get(name, 0)}")
        print(f"Already had dates: {already_dated}")
        print(f"No date found: {summary['not_found']}")
        print(f"Total inspected: {len(selected)}")
        print(f"Success rate: {filled / max(empty, 1) * 100:.1f}% of empty dates")
        return summary


BackfillerFactory = Callable[[Strategy, str], DateBackfiller]


def build_backfiller(strategy: Strategy, worksheet: str) -> DateBackfiller:
    """Default factory. Connects to Google, so only live runs call it."""
    return DateBackfiller(strategy=strategy, worksheet=worksheet)


def _sheet_row(value: str) -> int:
    try:
        row = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer sheet row") from exc
    if row < 2:
        raise argparse.ArgumentTypeError("must be 2 or greater (row 1 is headers)")
    return row


def _positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("must be an integer") from exc
    if number <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Preview or run a publication-date backfill strategy."
    )
    parser.add_argument(
        "--strategy",
        choices=tuple(STRATEGY_SPECS),
        default="enhanced",
        help="Date resolver chain (default: enhanced).",
    )
    parser.add_argument(
        "--worksheet",
        default="final",
        help="Google Sheets worksheet to target (default: final).",
    )
    parser.add_argument(
        "--start-row",
        type=_sheet_row,
        default=2,
        help="First inclusive sheet row; row 1 is headers (default: 2).",
    )
    parser.add_argument(
        "--limit",
        type=_positive_int,
        default=None,
        help="Maximum number of records to inspect from the start row.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Write to Google Sheets. Without this flag the command only previews its plan.",
    )
    return parser


def run_date_backfill(
    plan: DateBackfillPlan,
    *,
    backfiller_factory: BackfillerFactory = build_backfiller,
) -> dict[str, Any]:
    """Preview a plan, or build the backfiller and run it."""
    if plan.strategy not in STRATEGY_SPECS:
        raise ValueError(f"unknown strategy: {plan.strategy}")
    if plan.start_row < 2:
        raise ValueError("start_row must be 2 or greater")
    if plan.limit is not None and plan.limit <= 0:
        raise ValueError("limit must be greater than zero")
    if not plan.worksheet.strip():
        raise ValueError("worksheet must not be blank")

    result = {
        "strategy": plan.strategy,
        "worksheet": plan.worksheet,
        "start_row": plan.start_row,
        "end_row": plan.end_row,
        "limit": plan.limit,
        "live": plan.live,
        "executed": False,
    }
    if not plan.live:
        return result

    backfiller = backfiller_factory(plan.strategy, plan.worksheet)
    backfiller.backfill(start_row=plan.start_row, limit=plan.limit)
    result["executed"] = True
    return result


def _describe(plan: DateBackfillPlan) -> str:
    if plan.limit is None:
        rows = f"{plan.start_row}-end"
    else:
        rows = f"{plan.start_row}-{plan.end_row} ({plan.limit} records maximum)"
    mode = "LIVE" if plan.live else "PREVIEW"
    return (
        f"{mode}: strategy={plan.strategy}; worksheet={plan.worksheet}; "
        f"sheet rows={rows}"
    )


def main(
    argv: Sequence[str] | None = None,
    *,
    backfiller_factory: BackfillerFactory = build_backfiller,
) -> int:
    args = build_parser().parse_args(argv)
    plan = DateBackfillPlan(
        strategy=args.strategy,
        worksheet=args.worksheet.strip(),
        start_row=args.start_row,
        limit=args.limit,
        live=args.live,
    )
    print(_describe(plan))
    print(f"Resolver chain: {' -> '.join(STRATEGY_SPECS[plan.strategy].resolvers)}")
    if not plan.live:
        print(
            "No Google Sheets connection was made. Add --live after reviewing this plan."
        )
    run_date_backfill(plan, backfiller_factory=backfiller_factory)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
