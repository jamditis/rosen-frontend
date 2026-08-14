# -*- coding: utf-8 -*-
"""Parity guard for the data-only deploy publish list (#276 follow-up).

Several paths ship regenerated JSON without a full-site deploy:

  - submission_runtime/artifacts.py   DATA_DEPLOY_JSON_FILES (canonical tuple)
  - submission_runtime/sftp_push.py   _PUSH_FILES            (runtime alias)
  - scripts/process_submission.py     _STAGED_JSON_FILES     (Action alias)
  - scripts/sync_sheet_to_archive.py  _DEPLOY_JSON_FILES     (sheet-sync alias)

The Python paths must share the canonical runtime tuple. A file present in one
but missing from another is deployed inconsistently.

Two invariants make that class of bug a test failure instead of a latent gap:
  1. Every deploy path aliases the runtime tuple.
  2. The tuple equals the expected canonical set below (catches adding a new
     browser-loaded artifact to the exporter but to none of the lists -- pure
     mutual parity would pass in that case because both lists still agree).

Adding a browser-loaded artifact the exporter regenerates therefore means:
update submission_runtime/artifacts.py and EXPECTED_ARTIFACTS here.
That deliberate friction is the point -- a data-only deploy that ships a stale
index is the bad state.

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
})

_CANONICAL_PUBLISH_LISTS = (
    ("submission_runtime/artifacts.py", "DATA_DEPLOY_JSON_FILES"),
)

_PYTHON_ALIAS_LISTS = (
    ("submission_runtime/sftp_push.py", "_PUSH_FILES"),
    ("scripts/process_submission.py", "_STAGED_JSON_FILES"),
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


def _all_publish_lists() -> dict:
    """Return the canonical data-only publish list keyed by source label."""
    return {
        f"{rel}:{name}": set(_extract_tuple(rel, name))
        for rel, name in _CANONICAL_PUBLISH_LISTS
    }


def test_every_publish_list_matches_the_expected_artifact_set():
    for label, files in _all_publish_lists().items():
        assert files == EXPECTED_ARTIFACTS, (
            f"{label} must list exactly the data-only deploy artifacts. "
            f"missing={sorted(EXPECTED_ARTIFACTS - files)} "
            f"extra={sorted(files - EXPECTED_ARTIFACTS)}. Add a browser-loaded "
            f"artifact to submission_runtime/artifacts.py and "
            f"EXPECTED_ARTIFACTS together."
        )


def test_parsers_find_nonempty_lists():
    # A regex/scan regression that matched nothing would make the checks above
    # pass vacuously. Pin that each path is found and non-trivial.
    for label, files in _all_publish_lists().items():
        assert len(files) >= 5, f"{label} parsed as {sorted(files)}; expected >=5 files"
        assert "archive-core.json" in files, f"{label} missing archive-core.json"


def test_python_publish_paths_alias_the_runtime_artifact_list():
    for rel, name in _PYTHON_ALIAS_LISTS:
        source = _strip_comments((_BACKEND / rel).read_text(encoding="utf-8"))
        assert "DATA_DEPLOY_JSON_FILES" in source, (
            f"{rel} should import DATA_DEPLOY_JSON_FILES from submission_runtime.artifacts"
        )
        assert re.search(rf"{re.escape(name)}\s*=\s*DATA_DEPLOY_JSON_FILES\b", source), (
            f"{rel}:{name} should alias DATA_DEPLOY_JSON_FILES instead of "
            "declaring another artifact tuple"
        )
