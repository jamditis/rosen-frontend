#!/usr/bin/env python3
"""Capture finite reviewed publisher feeds as bibliographic metadata only."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import urllib.robotparser
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit

if __package__:
    from . import pressthink_batch_update as archive
else:
    import pressthink_batch_update as archive

ROOT = archive.ROOT
USER_AGENT = "RosenArchive-PublisherMetadata/1.0"
MANAGED_NOTE = "Reviewed publisher feed metadata; item: "
MAX_BYTES = 256 * 1024
MAX_ITEMS = 100
FEEDS = {
    "cjr-jay-rosen-search": {
        "url": "https://www.cjr.org/search/Jay+Rosen/feed/rss2/",
        "publisher": "Columbia Journalism Review",
        "basis": "about_jay",
    },
    "cjr-jay-rosen-author": {
        "url": "https://www.cjr.org/author/jay-rosen/feed",
        "publisher": "Columbia Journalism Review",
        "basis": "by_jay",
    },
    "common-dreams-jay-rosen-author": {
        "url": "https://www.commondreams.org/feeds/community/jay-rosen.rss",
        "publisher": "Common Dreams",
        "basis": "by_jay",
    },
}


def get_public(url):
    """Use a bounded reader with an exact feed/robots boundary."""
    allowed = {feed["url"] for feed in FEEDS.values()} | {
        f"https://{urlsplit(feed['url']).netloc}/robots.txt" for feed in FEEDS.values()
    }
    if url not in allowed:
        raise ValueError("URL outside reviewed publisher feeds")
    # This reader uses no cookies, follows no redirects and never fetches items.
    with archive.requests.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
        allow_redirects=False,
        stream=True,
    ) as response:
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError("Publisher feed did not return HTTP 200")
        chunks, size = [], 0
        for chunk in response.iter_content(16 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("Publisher response exceeds byte bound")
            chunks.append(chunk)
        return b"".join(chunks)


def field(item, name):
    return next(
        (child.text or "" for child in item if child.tag.rsplit("}", 1)[-1] == name), ""
    ).strip()


def parse_feed(source_id, body):
    feed = FEEDS[source_id]
    if len(body) > MAX_BYTES or re.search(rb"<!\s*(?:DOCTYPE|ENTITY)\b", body, re.I):
        raise ValueError("Unsupported or oversized publisher XML")
    root = ET.fromstring(body)
    if root.tag != "rss" or len(root.findall("channel")) != 1:
        raise ValueError("Publisher source is not an RSS channel")
    items = root.findall("channel/item")
    if not items or len(items) > MAX_ITEMS:
        raise ValueError("Publisher item count outside reviewed bound")
    output, seen = [], set()
    for item in items:
        url = field(item, "link")
        parsed = urlsplit(url)
        if (
            parsed.scheme != "https"
            or parsed.netloc != urlsplit(feed["url"]).netloc
            or not parsed.path.startswith("/")
            or parsed.path == "/"
            or parsed.query
            or parsed.fragment
            or parsed.username
        ):
            raise ValueError("Publisher item URL outside reviewed origin")
        if url in seen:
            raise ValueError("Duplicate publisher item URL")
        seen.add(url)
        title = archive.plain_text(field(item, "title"))
        author = archive.plain_text(field(item, "creator"))
        original_date = field(item, "pubDate")
        published = parsedate_to_datetime(original_date)
        if (
            published.tzinfo is None
            or not 1900 <= published.year
            or published > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5)
        ):
            raise ValueError("Publisher date is invalid")
        guid = field(item, "guid")
        if (
            not 5 <= len(title) <= 500
            or not 1 <= len(author) <= 200
            or len(guid) > 2048
        ):
            raise ValueError("Incomplete or oversized publisher metadata")
        relevant = (
            author == "Jay Rosen"
            if feed["basis"] == "by_jay"
            else bool(re.search(r"\bJay\s+Rosen\b", title, re.I))
        )
        # Descriptions/content may contain entire copyrighted articles. They are
        # neither retained nor republished; version only the bibliographic facts.
        output.append(
            {
                "id": source_id + ":" + url,
                "feed_id": source_id,
                "feed_url": feed["url"],
                "url": url,
                "guid": guid,
                "title": title,
                "author": author,
                "publisher": feed["publisher"],
                "original_date": original_date,
                "published_local": published.isoformat(),
                "published_gmt": published.astimezone(dt.timezone.utc)
                .replace(tzinfo=None)
                .isoformat(),
                "modified_gmt": published.astimezone(dt.timezone.utc)
                .replace(tzinfo=None)
                .isoformat(),
                "admission_basis": feed["basis"] if relevant else "review",
            }
        )
    return sorted(output, key=lambda source: source["id"])


def capture_feed(source_id, get=get_public):
    feed = FEEDS[source_id]
    policy_text = get(f"https://{urlsplit(feed['url']).netloc}/robots.txt").decode(
        "utf-8"
    )
    if not re.search(r"(?im)^user-agent\s*:", policy_text):
        raise ValueError("Publisher robots policy has no agent group")
    agents = re.findall(r"(?im)^user-agent\s*:\s*([^#\r\n]+)", policy_text)
    if not any(
        agent.strip() == "*" or agent.strip().lower() in USER_AGENT.lower()
        for agent in agents
    ):
        raise ValueError("Publisher robots policy has no applicable group")
    policy = urllib.robotparser.RobotFileParser()
    policy.parse(policy_text.splitlines())
    if not policy.can_fetch(USER_AGENT, feed["url"]):
        raise ValueError("Publisher robots policy denies feed")
    return parse_feed(source_id, get(feed["url"]))


def metadata_fields(source, captured_at):
    relation = (
        "by Jay Rosen" if source["admission_basis"] == "by_jay" else "about Jay Rosen"
    )
    summary = (
        f"Bibliographic metadata: {source['publisher']} lists this article {relation}, titled {source['title']}, credited to {source['author']}, dated {source['published_local'][:10]}. Article text has not been captured."
        if source["admission_basis"] in {"by_jay", "about_jay"}
        else f"Bibliographic metadata from {source['publisher']}'s Jay Rosen RSS feed: {source['title']}. Listed author: {source['author']}. Publication date: {source['published_local'][:10]}. Relevance requires review. Article text has not been captured."
    )
    return {
        "title": source["title"],
        "url": source["url"],
        "author": source["author"],
        "publication_date": source["published_local"][:10],
        "original_publication": source["publisher"],
        "publisher": source["publisher"],
        "platform": source["publisher"],
        "content_type": "Article",
        "format": "Article",
        "summary": summary,
        "raw_text": "",
        "excerpt": "",
        "word_count": "",
        "date_processed": captured_at,
        "verified": "TRUE",
        "low_confidence": "TRUE",
        "needs_review": "TRUE",
        "permissions": "Metadata only; original source rights apply",
        "notes": MANAGED_NOTE + source["id"],
    }


def run_batch(
    source_id, *, dry_run=False, csv_path=None, history_path=None, sources=None
):
    if source_id not in FEEDS:
        raise ValueError("Unknown reviewed publisher source")

    replay_counts = {}

    def reconcile(captured, columns, rows, entries, **kwargs):
        if any(source.get("feed_id") != source_id for source in captured):
            raise ValueError("Mixed publisher capture identities")
        heads = {entry["source"]["id"]: entry["source"] for entry in entries}
        canonical_heads = {}
        superseded = []
        for identity, source in heads.items():
            if source.get("feed_id") != source_id:
                continue
            parsed = urlsplit(source["url"])
            prefix = source_id + ":"
            if (
                not identity.startswith(prefix)
                or archive.url_identity(identity[len(prefix) :])
                != archive.url_identity(source["url"])
                or parsed.scheme != "https"
                or parsed.netloc != urlsplit(FEEDS[source_id]["url"]).netloc
                or parsed.query
                or parsed.fragment
                or parsed.username
            ):
                raise ValueError("Invalid preserved publisher identity")
            key = archive.url_identity(source["url"])
            if key in canonical_heads:
                superseded.append(identity)
            else:
                canonical_heads[key] = source
        current_keys = {archive.url_identity(source["url"]) for source in captured}
        # A changed URL spelling keeps the first captured identity and notes
        # ownership, while the current source URL remains evidence of the alias.
        captured = [
            (
                {
                    **source,
                    "id": canonical_heads[archive.url_identity(source["url"])]["id"],
                }
                if archive.url_identity(source["url"]) in canonical_heads
                else source
            )
            for source in captured
        ]
        current_ids = {source["id"] for source in captured}
        older = [
            source for key, source in canonical_heads.items() if key not in current_keys
        ]
        if len(captured) + len(older) > 2000:
            raise ValueError("Preserved feed catch-up exceeds 2000 metadata items")
        replay_counts.update(
            current_feed_items=len(captured),
            historical_reconsidered=len(older),
            absent_from_current_feed=[source["id"] for source in older],
            superseded_history_identities=superseded,
        )
        successor, versions, report = archive.reconcile_sources(
            sorted(captured + older, key=lambda source: source["id"]),
            columns,
            rows,
            entries,
            **kwargs,
            fields=metadata_fields,
            managed_note=MANAGED_NOTE,
            can_create=lambda source: source["admission_basis"]
            in {"by_jay", "about_jay"},
        )
        old_entries = {entry["source"]["id"]: entry for entry in entries}
        for entry in versions:
            identity = entry["source"]["id"]
            historical = identity not in current_ids
            old = old_entries.get(identity, {})
            entry["capture_kind"] = (
                "historical_reconciliation" if historical else "live_feed"
            )
            entry["source_observed_at"] = (
                old.get("source_observed_at", old.get("captured_at"))
                if historical
                else entry["captured_at"]
            )
            entry["sha256"] = archive.digest(
                {key: value for key, value in entry.items() if key != "sha256"}
            )
        return successor, versions, report

    result = archive.run_capture(
        dry_run=dry_run,
        csv_path=csv_path or ROOT / "data/archive_records-public.csv",
        history_path=history_path
        or ROOT / "preservation/publisher-feeds/versions.jsonl",
        capture=lambda: capture_feed(source_id) if sources is None else sources,
        reconcile_capture=reconcile,
    )
    result["missing_source_ids"] = replay_counts["absent_from_current_feed"]
    return {
        **result,
        **replay_counts,
        "source_id": source_id,
        "coverage": "Finite current RSS view; no exhaustive historical claim",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=FEEDS, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.report.resolve().is_relative_to(ROOT):
        parser.error("Operational reports must stay outside the repository")
    archive.prepare_report(args.report)
    report = run_batch(args.source, dry_run=args.dry_run)
    archive.transaction.atomic_bytes(
        args.report, (json.dumps(report, indent=2) + "\n").encode()
    )
    print(json.dumps(report))


if __name__ == "__main__":
    main()
