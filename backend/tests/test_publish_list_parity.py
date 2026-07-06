# -*- coding: utf-8 -*-
"""Parity guard for the data-only deploy publish lists (#276 follow-up).

Three separate paths ship regenerated JSON without a full-site deploy, and each
hardcodes its own tuple of artifact filenames:

  - submission_server/processor.py   _STAGED_JSON_FILES  (submit-record staging)
  - submission_server/sftp_push.py    _PUSH_FILES        (submit-record SFTP push)
  - scripts/sync_sheet_to_archive.py  _DEPLOY_JSON_FILES  (sheet-sync commit)

They must list the SAME artifacts: a file present in one but missing from another
is deployed inconsistently. That contract lived only in "keep in sync" comments,
which is how search-index.json (the lazy full-text index the exporter now writes
for #276) was added to the producer and the full-site deploy but silently omitted
from all three incremental paths -- so a submitted record would be live in
archive-core/details while MiniSearch still served the previous index.

Two invariants make that class of bug a test failure instead of a latent gap:
  1. The three lists are identical (catches editing one, forgetting the others).
  2. They equal the expected canonical set below (catches adding a new
     browser-loaded artifact to the exporter but to none of the lists -- pure
     mutual parity would pass in that case because all three still agree).

Adding a browser-loaded artifact the exporter regenerates therefore means:
update all three tuples AND EXPECTED_ARTIFACTS here. That deliberate friction is
the point -- a data-only deploy that ships a stale index is the bad state.

Parses the source instead of importing it: sync_sheet_to_archive imports the
Google Sheets client at module load, which a lightweight test should not require.
"""

import pathlib
import re

_BACKEND = pathlib.Path(__file__).resolve().parents[1]

# Every artifact a data-only deploy must ship. Keep in step with the three tuples
# below and with the exporter (data/export-archive-data.js). archive-data.json is
# the full combined fallback; the rest are the split / lazily-fetched payloads.
EXPECTED_ARTIFACTS = frozenset({
    "archive-data.json",
    "archive-core.json",
    "archive-details.json",
    "archive-entities.json",
    "archive-analytics.json",
    "search-index.json",
})

_PUBLISH_LISTS = (
    ("submission_server/processor.py", "_STAGED_JSON_FILES"),
    ("submission_server/sftp_push.py", "_PUSH_FILES"),
    ("scripts/sync_sheet_to_archive.py", "_DEPLOY_JSON_FILES"),
)


def _strip_comments(source: str) -> str:
    """Drop `#` comments so a comment's parens or quotes cannot corrupt the
    paren-balanced scan or literal extraction. The publish tuples hold only
    filenames (never a `#`), so a per-line strip that respects string literals
    is exact for the regions we parse."""
    out = []
    for line in source.splitlines():
        in_str = None
        cut = len(line)
        for i, ch in enumerate(line):
            if in_str:
                if ch == in_str:
                    in_str = None
            elif ch in "'\"":
                in_str = ch
            elif ch == "#":
                cut = i
                break
        out.append(line[:cut])
    return "\n".join(out)


def _extract_tuple(rel_path: str, name: str) -> list:
    """Return the string literals of the `name = ( ... )` tuple in a source file,
    via a paren-balanced scan over comment-stripped text."""
    text = _strip_comments((_BACKEND / rel_path).read_text(encoding="utf-8"))
    m = re.search(rf"{re.escape(name)}\s*=\s*\(", text)
    assert m, f"{rel_path}: assignment `{name} = (` not found"
    depth = 0
    open_idx = m.end() - 1
    for j in range(open_idx, len(text)):
        if text[j] == "(":
            depth += 1
        elif text[j] == ")":
            depth -= 1
            if depth == 0:
                body = text[open_idx + 1:j]
                return re.findall(r"""['"]([^'"]+)['"]""", body)
    raise AssertionError(f"{rel_path}: unbalanced parens for `{name}`")


def test_every_publish_list_matches_the_expected_artifact_set():
    for rel_path, name in _PUBLISH_LISTS:
        files = _extract_tuple(rel_path, name)
        assert set(files) == EXPECTED_ARTIFACTS, (
            f"{rel_path}:{name} must list exactly the data-only deploy artifacts. "
            f"missing={sorted(EXPECTED_ARTIFACTS - set(files))} "
            f"extra={sorted(set(files) - EXPECTED_ARTIFACTS)}. Add a browser-loaded "
            f"artifact to all three publish tuples and EXPECTED_ARTIFACTS together."
        )


def test_publish_lists_are_mutually_identical():
    sets = {name: set(_extract_tuple(rel, name)) for rel, name in _PUBLISH_LISTS}
    first = next(iter(sets.values()))
    diverged = {name: sorted(s) for name, s in sets.items() if s != first}
    assert not diverged or len(sets) == 1, (
        f"data-only publish lists diverged; they must ship the same artifacts: {diverged}"
    )


def test_parser_finds_nonempty_tuples():
    # A regex/scan regression that matched nothing would make the checks above
    # pass vacuously. Pin that each tuple is found and non-trivial.
    for rel_path, name in _PUBLISH_LISTS:
        files = _extract_tuple(rel_path, name)
        assert len(files) >= 5, f"{rel_path}:{name} parsed as {files}; expected >=5 files"
        assert "archive-core.json" in files, f"{rel_path}:{name} missing archive-core.json"
