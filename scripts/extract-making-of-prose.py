#!/usr/bin/env python3
"""Extract anchored prose from the provisional making-of page."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


Block = tuple[str, str, str, int]
VOID_ELEMENTS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
}


@dataclass
class _Capture:
    anchor: str
    kind: str
    tag: str
    depth: int
    line: int
    fragments: list[str] = field(default_factory=list)


class _MakingOfParser(HTMLParser):
    """Extract prose by following parsed HTML structure rather than source lines."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[Block] = []
        self.chapter = 0
        self.counters: dict[str, int] = {}
        self.title_pending = False
        self.element_stack: list[str] = []
        self.prose_roots: list[tuple[str, int]] = []
        self.capture: _Capture | None = None

    def _next_number(self, key: str) -> int:
        self.counters[key] = self.counters.get(key, 0) + 1
        return self.counters[key]

    def _start_capture(self, anchor: str, kind: str, tag: str, depth: int) -> None:
        self.capture = _Capture(
            anchor=anchor,
            kind=kind,
            tag=tag,
            depth=depth,
            line=self.getpos()[0],
        )

    def _finish_capture(self) -> None:
        if self.capture is None:
            return
        text = " ".join("".join(self.capture.fragments).split())
        self.blocks.append(
            (
                self.capture.anchor,
                self.capture.kind,
                text,
                self.capture.line,
            )
        )
        self.capture = None

    @staticmethod
    def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
        for name, value in attrs:
            if name == "class":
                return set((value or "").split())
        return set()

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        tag = tag.lower()
        if tag in VOID_ELEMENTS:
            if tag == "br" and self.capture is not None:
                self.capture.fragments.append(" ")
            return

        was_in_prose = bool(self.prose_roots)
        self.element_stack.append(tag)
        depth = len(self.element_stack)

        if self.capture is not None:
            return

        classes = self._classes(attrs)
        if "dek" in classes:
            self._start_capture("M.DEK", "meta", tag, depth)
        elif "dek-note" in classes:
            self._start_capture("M.NOTE", "meta", tag, depth)
        elif "ch-ref" in classes:
            self.chapter += 1
            self.counters = {}
            self.title_pending = True
            self._start_capture(f"C{self.chapter}.REF", "chref", tag, depth)
        elif self.title_pending and tag == "h2":
            self.title_pending = False
            self._start_capture(f"C{self.chapter}.T", "title", tag, depth)
        elif "ch-date" in classes:
            self.title_pending = False
            self._start_capture(f"C{self.chapter}.D", "date", tag, depth)
        elif "prose" in classes and not was_in_prose:
            self.title_pending = False
            self.prose_roots.append((tag, depth))
        elif was_in_prose and tag == "p":
            if "lead" in classes:
                self._start_capture(f"C{self.chapter}.L", "lead", tag, depth)
            elif "pull" in classes:
                self._start_capture(
                    f"C{self.chapter}.Q{self._next_number('q')}",
                    "pull",
                    tag,
                    depth,
                )
            else:
                self._start_capture(
                    f"C{self.chapter}.P{self._next_number('p')}",
                    "para",
                    tag,
                    depth,
                )

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() not in VOID_ELEMENTS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        depth = len(self.element_stack)

        if (
            self.capture is not None
            and tag == self.capture.tag
            and depth == self.capture.depth
        ):
            self._finish_capture()

        if self.prose_roots:
            root_tag, root_depth = self.prose_roots[-1]
            if tag == root_tag and depth == root_depth:
                self.prose_roots.pop()

        if tag in {"article", "section"}:
            self.title_pending = False

        if self.element_stack and self.element_stack[-1] == tag:
            self.element_stack.pop()
            return

        # Recover deterministically from mismatched-but-parseable markup.
        for index in range(len(self.element_stack) - 1, -1, -1):
            if self.element_stack[index] == tag:
                del self.element_stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if self.capture is not None:
            self.capture.fragments.append(data)

    def finish(self) -> None:
        if self.capture is not None:
            raise ValueError(
                f"Unclosed <{self.capture.tag}> for {self.capture.anchor} "
                f"at line {self.capture.line}"
            )


def extract(source: Path) -> list[Block]:
    """Extract anchored blocks from the making-of HTML source."""
    parser = _MakingOfParser()
    parser.feed(source.read_text(encoding="utf-8"))
    parser.close()
    parser.finish()
    return parser.blocks


def write_outputs(
    blocks: list[Block], output_markdown: Path, output_map: Path
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

    output_markdown.write_text("\n".join(markdown) + "\n", encoding="utf-8")
    output_map.write_text(
        json.dumps(
            {
                anchor: {"kind": kind, "line": line_number, "text": text}
                for anchor, kind, text, line_number in blocks
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
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
