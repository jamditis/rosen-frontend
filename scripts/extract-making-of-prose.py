#!/usr/bin/env python3
"""Extract anchored prose from the provisional making-of page."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path


TAG = re.compile(r"<[^>]+>")


def text_of(line: str) -> str:
    """Return readable text from one source line."""
    text = TAG.sub("", line)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def has_class(line: str, class_name: str) -> bool:
    """Return whether an HTML start tag contains a class token."""
    match = re.search(r'class="([^"]*)"', line)
    return match is not None and class_name in match.group(1).split()


def extract(source: Path) -> list[tuple[str, str, str, int]]:
    """Extract anchored blocks from the making-of HTML source."""
    blocks: list[tuple[str, str, str, int]] = []
    chapter = 0
    counters: dict[str, int] = {}
    in_article = False
    title_pending = False

    def next_number(key: str) -> int:
        counters[key] = counters.get(key, 0) + 1
        return counters[key]

    for line_number, raw in enumerate(source.read_text().splitlines(), start=1):
        line = raw.strip()

        if 'class="dek"' in line:
            blocks.append(("M.DEK", "meta", text_of(line), line_number))
        elif 'class="dek-note"' in line:
            blocks.append(("M.NOTE", "meta", text_of(line), line_number))
        elif 'class="ch-ref"' in line:
            chapter += 1
            counters = {}
            title_pending = True
            blocks.append((f"C{chapter}.REF", "chref", text_of(line), line_number))
        elif title_pending and line.startswith("<h2>"):
            blocks.append((f"C{chapter}.T", "title", text_of(line), line_number))
            title_pending = False
        elif 'class="ch-date"' in line:
            blocks.append((f"C{chapter}.D", "date", text_of(line), line_number))
        elif has_class(line, "prose"):
            in_article = True
        elif in_article and line == "</div>":
            in_article = False
        elif in_article and 'class="lead"' in line:
            blocks.append((f"C{chapter}.L", "lead", text_of(line), line_number))
        elif in_article and 'class="pull"' in line:
            blocks.append(
                (f"C{chapter}.Q{next_number('q')}", "pull", text_of(line), line_number)
            )
        elif in_article and line.startswith("<p>"):
            blocks.append(
                (f"C{chapter}.P{next_number('p')}", "para", text_of(line), line_number)
            )

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
