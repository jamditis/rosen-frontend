#!/usr/bin/env python3
"""Extract anchored prose from the provisional making-of page."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path


TAG = re.compile(r"<[^>]+>", re.DOTALL)
BREAK_TAG = re.compile(r"<br\b[^>]*?/?>", re.IGNORECASE)
START_TAG = re.compile(r"^<([a-z][\w:-]*)\b", re.IGNORECASE)
START_TAG_FRAGMENT = re.compile(r"^<[a-z][\w:-]*\b[^>]*>", re.IGNORECASE)
CLASS_ATTRIBUTE = re.compile(
    r"(?<![\w:-])class\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))",
    re.IGNORECASE,
)


def text_of(line: str) -> str:
    """Return readable text from one source line."""
    text = BREAK_TAG.sub(" ", line)
    text = TAG.sub("", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def class_tokens(line: str) -> set[str]:
    """Return class tokens from an HTML start tag."""
    start_tag = START_TAG_FRAGMENT.match(line)
    if start_tag is None:
        return set()
    match = CLASS_ATTRIBUTE.search(start_tag.group(0))
    if match is None:
        return set()
    value = next(group for group in match.groups() if group is not None)
    return set(value.split())


def has_class(line: str, class_name: str) -> bool:
    """Return whether an HTML start tag contains a class token."""
    return class_name in class_tokens(line)


def start_tag_name(line: str) -> str | None:
    """Return the lower-case start-tag name at the beginning of a source line."""
    match = START_TAG.match(line)
    return match.group(1).lower() if match is not None else None


def tag_depth_delta(fragment: str, tag: str) -> int:
    """Return the net nesting change for one container tag."""
    escaped = re.escape(tag)
    openings = re.findall(rf"<{escaped}\b[^>]*>", fragment, re.IGNORECASE)
    self_closing = sum(1 for opening in openings if re.search(r"/\s*>$", opening))
    closings = re.findall(rf"</{escaped}\s*>", fragment, re.IGNORECASE)
    return len(openings) - self_closing - len(closings)


def extract(source: Path) -> list[tuple[str, str, str, int]]:
    """Extract anchored blocks from the making-of HTML source."""
    blocks: list[tuple[str, str, str, int]] = []
    chapter = 0
    counters: dict[str, int] = {}
    in_article = False
    prose_container_tag: str | None = None
    prose_container_depth = 0
    title_pending = False
    pending: tuple[str, str, str, int, list[str]] | None = None

    def next_number(key: str) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    def capture(anchor: str, kind: str, tag: str, raw: str, line_number: int) -> None:
        """Capture one element now or defer it until its closing tag."""
        nonlocal pending
        if re.search(rf"</{tag}\s*>", raw, re.IGNORECASE):
            blocks.append((anchor, kind, text_of(raw), line_number))
        else:
            pending = (anchor, kind, tag, line_number, [raw])

    for line_number, raw in enumerate(source.read_text().splitlines(), start=1):
        line = raw.strip()

        if pending is not None:
            anchor, kind, tag, start_line, fragments = pending
            fragments.append(raw)
            if re.search(rf"</{tag}\s*>", raw, re.IGNORECASE):
                blocks.append((anchor, kind, text_of("\n".join(fragments)), start_line))
                pending = None
            continue

        if has_class(line, "dek"):
            capture("M.DEK", "meta", "p", raw, line_number)
        elif has_class(line, "dek-note"):
            capture("M.NOTE", "meta", "p", raw, line_number)
        elif has_class(line, "ch-ref"):
            chapter += 1
            counters = {}
            title_pending = True
            capture(f"C{chapter}.REF", "chref", "span", raw, line_number)
        elif title_pending and line.startswith("<h2>"):
            title_pending = False
            capture(f"C{chapter}.T", "title", "h2", raw, line_number)
        elif has_class(line, "ch-date"):
            title_pending = False
            capture(f"C{chapter}.D", "date", "p", raw, line_number)
        elif not in_article and has_class(line, "prose"):
            title_pending = False
            prose_container_tag = start_tag_name(line)
            if prose_container_tag is not None:
                prose_container_depth = tag_depth_delta(raw, prose_container_tag)
                in_article = prose_container_depth > 0
        elif in_article:
            if prose_container_tag is not None:
                prose_container_depth += tag_depth_delta(raw, prose_container_tag)
                if prose_container_depth <= 0:
                    in_article = False
                    prose_container_tag = None
                    prose_container_depth = 0
                    title_pending = False
                    continue

            if start_tag_name(line) == "p":
                classes = class_tokens(line)
                if "lead" in classes:
                    capture(f"C{chapter}.L", "lead", "p", raw, line_number)
                elif "pull" in classes:
                    capture(
                        f"C{chapter}.Q{next_number('q')}",
                        "pull",
                        "p",
                        raw,
                        line_number,
                    )
                else:
                    capture(
                        f"C{chapter}.P{next_number('p')}",
                        "para",
                        "p",
                        raw,
                        line_number,
                    )
        elif line.startswith(("</article", "</section")):
            title_pending = False

    if pending is not None:
        anchor, _kind, tag, start_line, _fragments = pending
        raise ValueError(f"Unclosed <{tag}> for {anchor} at line {start_line}")

    return blocks


def write_outputs(
    blocks: list[tuple[str, str, str, int]], output_markdown: Path, output_map: Path
) -> None:
    """Write the editable Markdown and its source-line map."""
    markdown = [
        "# The making of Jay Rosen's Internet Archive",
        "",
        "Editable prose only. The bracketed codes map edits back to the page source.",
        "Keep each code in place, edit the text after it, or delete the full line.",
        "",
        "---",
        "",
    ]

    current_chapter = None
    for anchor, kind, text, _line_number in blocks:
        block_chapter = anchor.split(".")[0]
        if block_chapter != current_chapter and block_chapter.startswith("C"):
            current_chapter = block_chapter
            markdown.append("")
        if kind == "chref":
            markdown.append(f"\n## [{anchor}] {text}")
        elif kind == "title":
            markdown.append(f"**[{anchor}] title:** {text}")
        elif kind == "date":
            markdown.append(f"**[{anchor}] standfirst:** {text}")
        elif kind == "lead":
            markdown.append(f"\n[{anchor}] {text}")
        elif kind == "pull":
            markdown.append(f"\n> [{anchor}] {text}")
        elif kind == "meta":
            markdown.append(f"\n**[{anchor}]** {text}")
        else:
            markdown.append(f"\n[{anchor}] {text}")

    output_markdown.write_text("\n".join(markdown) + "\n")
    output_map.write_text(
        json.dumps(
            {
                anchor: {"kind": kind, "line": line_number, "text": text}
                for anchor, kind, text, line_number in blocks
            },
            indent=2,
        )
        + "\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Making-of HTML source")
    parser.add_argument("output_markdown", type=Path, help="Editable Markdown output")
    parser.add_argument("output_map", type=Path, help="Anchor-map JSON output")
    args = parser.parse_args()

    blocks = extract(args.source)
    write_outputs(blocks, args.output_markdown, args.output_map)
    words = sum(
        len(text.split())
        for _anchor, kind, text, _line_number in blocks
        if kind in {"lead", "para", "pull"}
    )
    chapter_count = sum(
        1 for _anchor, kind, _text, _line_number in blocks if kind == "chref"
    )
    print(
        f"{len(blocks)} blocks, {chapter_count} chapters, ~{words} words of body prose"
    )


if __name__ == "__main__":
    main()
