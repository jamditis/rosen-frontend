# -*- coding: utf-8 -*-
"""Canonical data artifacts for data-only deploy paths."""

from pathlib import Path

DATA_DEPLOY_JSON_FILES = (
    "archive-data.json",
    "archive-core.json",
    "archive-details.json",
    "archive-entities.json",
    "archive-analytics.json",
    "search-index.json",
    "social-search-index.json",
    "relationship-adjacency-0.json",
    "relationship-adjacency-1.json",
    "relationship-adjacency-2.json",
    "relationship-adjacency-3.json",
    "relationship-adjacency-4.json",
    "relationship-adjacency-5.json",
    "relationship-adjacency-6.json",
    "relationship-adjacency-7.json",
    "relationship-adjacency-8.json",
    "relationship-adjacency-9.json",
    "relationship-adjacency-a.json",
    "relationship-adjacency-b.json",
    "relationship-adjacency-c.json",
    "relationship-adjacency-d.json",
    "relationship-adjacency-e.json",
    "relationship-adjacency-f.json",
    "relationship-adjacency-manifest.json",
)

REQUIRED_FEED_FILES = (
    "feeds/rss.xml",
    "feeds/articles.xml",
    "feeds/archive.opml",
    "feeds/subscriptions.opml",
    "feeds/index.json",
)


def data_deploy_files(directory: Path):
    """Include every generated feed and reject an incomplete local release."""
    required = (*DATA_DEPLOY_JSON_FILES, *REQUIRED_FEED_FILES)
    missing = [name for name in required if not (directory / name).is_file()]
    if missing:
        raise ValueError(f"Data release files missing: {missing}")
    if (directory / "feeds").is_symlink() or any(
        (directory / name).is_symlink() for name in required
    ):
        raise ValueError("Data release symlinks are not deployable")
    feeds = []
    for path in sorted((directory / "feeds").rglob("*")):
        if path.is_symlink():
            raise ValueError("Feed symlinks are not deployable")
        if path.is_file():
            if path.suffix not in (".xml", ".opml", ".json"):
                raise ValueError(f"Unexpected feed artifact: {path.name}")
            feeds.append(path.relative_to(directory).as_posix())
    return (*DATA_DEPLOY_JSON_FILES, *feeds)
