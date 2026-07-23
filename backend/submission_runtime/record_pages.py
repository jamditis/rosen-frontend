# -*- coding: utf-8 -*-
"""Render crawler-readable metadata shells for archive record deep links."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional


RECORD_ID_RE = re.compile(r"^[A-Za-z0-9-]+$")
RECORD_SHELL_RE = re.compile(r"^[A-Za-z0-9-]+\.html$")
_SOCIAL_DESCRIPTION_LIMIT = 300


def validate_record_id(record_id: str) -> str:
    """Return a safe record id or raise before it reaches a path."""
    normalized = str(record_id or "").strip()
    if not RECORD_ID_RE.fullmatch(normalized):
        raise ValueError(f"unsafe or missing record id for social page: {normalized!r}")
    return normalized


def _replace_head_value(source: str, pattern: str, value: str, label: str) -> str:
    """Replace one required head value and fail if the template drifted."""
    replaced, count = re.subn(
        pattern,
        lambda match: f"{match.group(1)}{value}{match.group(2)}",
        source,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if count != 1:
        raise ValueError(f"index.html must contain exactly one {label}")
    return replaced


def _record_description(record: Mapping[str, Any]) -> str:
    raw = record.get("summary") or record.get("quote") or record.get("title") or ""
    normalized = re.sub(r"\s+", " ", str(raw)).strip()
    if len(normalized) > _SOCIAL_DESCRIPTION_LIMIT:
        normalized = normalized[: _SOCIAL_DESCRIPTION_LIMIT - 1].rstrip() + "…"
    return normalized


def render_record_page(template: str, record: Mapping[str, Any]) -> str:
    """Render one record's metadata into an otherwise unchanged index shell."""
    record_id = validate_record_id(str(record.get("id") or ""))
    raw_title = re.sub(r"\s+", " ", str(record.get("title") or "")).strip()
    if not raw_title:
        raise ValueError(f"record {record_id} has no title for social metadata")

    title = html.escape(raw_title, quote=True)
    page_title = f"{title} | Jay Rosen's Internet Archive"
    description = html.escape(_record_description(record), quote=True)
    canonical = f"https://pressthink.org/j/rosen-archive/?record={record_id}"

    rendered = _replace_head_value(
        template, r"(<title>)[\s\S]*?(</title>)", page_title, "<title>"
    )
    rendered = _replace_head_value(
        rendered,
        r'(<meta\s+name="description"\s+content=")[^"]*("\s*/?>)',
        description,
        "description meta tag",
    )
    rendered = _replace_head_value(
        rendered,
        r'(<link\s+rel="canonical"\s+href=")[^"]*("\s*/?>)',
        canonical,
        "canonical link",
    )
    for key, value in (
        ("og:title", title),
        ("og:description", description),
        ("og:url", canonical),
        ("og:type", "article"),
        ("twitter:title", title),
        ("twitter:description", description),
    ):
        attribute = "property" if key.startswith("og:") else "name"
        rendered = _replace_head_value(
            rendered,
            rf'(<meta\s+{attribute}="{re.escape(key)}"\s+content=")[^"]*("\s*/?>)',
            value,
            f"{key} meta tag",
        )
    return rendered


def load_records(archive_path: Path) -> List[Dict[str, Any]]:
    """Load and validate the canonical archive record list."""
    archive = json.loads(Path(archive_path).read_text(encoding="utf-8"))
    records = archive.get("records")
    if not isinstance(records, list):
        raise ValueError(f"{archive_path} must contain a records list")
    return records


def render_record_pages(
    template: str,
    archive_path: Path,
    record_ids: Optional[Iterable[str]] = None,
) -> Dict[str, str]:
    """Render all eligible shells, or only the requested record ids.

    Social records intentionally return no shell so the caller can remove an
    obsolete remote page. Missing requested records raise an error.
    """
    requested = None
    if record_ids is not None:
        requested = {validate_record_id(record_id) for record_id in record_ids}

    rendered: Dict[str, str] = {}
    seen = set()
    for record in load_records(archive_path):
        record_id = validate_record_id(str(record.get("id") or ""))
        if record_id in seen:
            raise ValueError(f"duplicate record id for social page: {record_id}")
        seen.add(record_id)
        if requested is not None and record_id not in requested:
            continue
        if record.get("type") == "social":
            continue
        rendered[record_id] = render_record_page(template, record)
    if requested is not None:
        missing = requested - seen
        if missing:
            missing_ids = ", ".join(sorted(missing))
            raise ValueError(f"requested record ids not found: {missing_ids}")
    return dict(sorted(rendered.items()))


def generate_record_pages(repo_root: Path) -> List[Path]:
    """Build every local shell and remove shells no longer in the archive."""
    repo_root = Path(repo_root)
    rendered = render_record_pages(
        (repo_root / "index.html").read_text(encoding="utf-8"),
        repo_root / "data" / "archive-data.json",
    )
    output_dir = repo_root / "r"
    output_dir.mkdir(parents=True, exist_ok=True)
    for stale in output_dir.glob("*.html"):
        stale.unlink()

    pages = []
    for record_id, source in rendered.items():
        page = output_dir / f"{record_id}.html"
        page.write_text(source, encoding="utf-8")
        pages.append(page)
    return pages
