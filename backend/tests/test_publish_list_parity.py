# -*- coding: utf-8 -*-
"""Parity guard for the data-only deploy publish list (#276 follow-up).

Several paths ship regenerated JSON without a full-site deploy:

  - submission_runtime/artifacts.py   DATA_DEPLOY_JSON_FILES (canonical tuple)
  - submission_runtime/sftp_push.py   _PUSH_FILES            (runtime alias)
  - submission_server/processor.py    _STAGED_JSON_FILES     (legacy alias)
  - scripts/process_submission.py     _STAGED_JSON_FILES     (Action alias)
  - scripts/sync_sheet_to_archive.py  _DEPLOY_JSON_FILES     (sheet-sync alias)
  - submission_server/deploy.sh       ARTIFACTS="..."     (manual FTP staging;
                                                          shell, not a Python tuple)

The Python paths must share the canonical runtime tuple, and the shell path must
match it exactly. A file present in one but missing from another is deployed
inconsistently.

Two invariants make that class of bug a test failure instead of a latent gap:
  1. The runtime tuple and shell list are identical.
  2. They equal the expected canonical set below (catches adding a new
     browser-loaded artifact to the exporter but to none of the lists -- pure
     mutual parity would pass in that case because both lists still agree).

Adding a browser-loaded artifact the exporter regenerates therefore means:
update submission_runtime/artifacts.py, deploy.sh, and EXPECTED_ARTIFACTS here.
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
})

_CANONICAL_PUBLISH_LISTS = (
    ("submission_runtime/artifacts.py", "DATA_DEPLOY_JSON_FILES"),
)

_PYTHON_ALIAS_LISTS = (
    ("submission_runtime/sftp_push.py", "_PUSH_FILES"),
    ("submission_server/processor.py", "_STAGED_JSON_FILES"),
    ("scripts/process_submission.py", "_STAGED_JSON_FILES"),
    ("scripts/sync_sheet_to_archive.py", "_DEPLOY_JSON_FILES"),
)

# deploy.sh stages the same data-only artifacts for a manual FTP push, defining the set
# once in an `ARTIFACTS="..."` shell variable it iterates for both staging and promotion.
# It must carry the identical set. Parsed separately because it is shell, not a Python
# tuple -- and left out of the guard originally, which is how its list drifted out of
# sync with the three tuples.
_SHELL_PUBLISH_LISTS = (
    "submission_server/deploy.sh",
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


def _parse_shell_artifact_list(text: str, label: str = "shell text") -> list:
    """Extract the filenames from the `ARTIFACTS="..."` assignment in deploy.sh.

    deploy.sh defines its data-only publish set once as a shell variable and iterates it
    for both staging and promotion, so the assignment -- not any single loop -- is the
    single source of truth. Binding the guard to the assignment keeps it correct if the
    loops are reordered or another loop is added: a parser bound to "the first for-loop"
    could validate a preflight/cleanup loop while the executed copy list silently drifts.

    The match is anchored to the start of a line (allowing leading whitespace) so a
    different variable whose name ends in ARTIFACTS -- e.g. OLD_ARTIFACTS="..." -- cannot
    shadow the real assignment as a substring. The value is split on whitespace exactly as
    bash word-splits `for f in $ARTIFACTS`, and each token is returned verbatim rather than
    salvaging `.json` substrings, so a malformed token (a comma-suffixed
    `archive-core.json,`, a stray fragment) surfaces as a parity mismatch instead of being
    silently normalized into a clean filename. Comments are stripped first so a
    commented-out assignment cannot shadow the real one."""
    stripped = _strip_comments(text)
    m = re.search(
        r"""(?m)^[ \t]*ARTIFACTS\s*=\s*(['"])(.*?)\1""", stripped, re.DOTALL
    )
    assert m, f'{label}: `ARTIFACTS="..."` assignment not found'
    return m.group(2).split()


def _extract_shell_list(rel_path: str) -> list:
    """Return the .json filenames from the `ARTIFACTS="..."` assignment in a shell
    script. deploy.sh stages data-only artifacts from a bash variable rather than a
    Python tuple, so it needs its own extractor to join the parity check."""
    text = (_BACKEND / rel_path).read_text(encoding="utf-8")
    return _parse_shell_artifact_list(text, label=rel_path)


def _all_publish_lists() -> dict:
    """label -> set(filenames) for every data-only publish path (Python + shell)."""
    lists = {
        f"{rel}:{name}": set(_extract_tuple(rel, name))
        for rel, name in _CANONICAL_PUBLISH_LISTS
    }
    for rel in _SHELL_PUBLISH_LISTS:
        lists[f"{rel}:ARTIFACTS"] = set(_extract_shell_list(rel))
    return lists


def test_every_publish_list_matches_the_expected_artifact_set():
    for label, files in _all_publish_lists().items():
        assert files == EXPECTED_ARTIFACTS, (
            f"{label} must list exactly the data-only deploy artifacts. "
            f"missing={sorted(EXPECTED_ARTIFACTS - files)} "
            f"extra={sorted(files - EXPECTED_ARTIFACTS)}. Add a browser-loaded "
            f"artifact to submission_runtime/artifacts.py, deploy.sh, and "
            f"EXPECTED_ARTIFACTS together."
        )


def test_publish_lists_are_mutually_identical():
    sets = _all_publish_lists()
    first = next(iter(sets.values()))
    diverged = {label: sorted(s) for label, s in sets.items() if s != first}
    assert not diverged, (
        f"data-only publish lists diverged; they must ship the same artifacts: {diverged}"
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


def test_shell_parser_reads_artifacts_assignment_not_loops():
    # The parser binds to the ARTIFACTS assignment, so it is immune to how many loops
    # iterate it or their order -- a preflight/cleanup loop above the copy loop cannot
    # make the guard validate the wrong list. It is anchored to the start of a line so a
    # different variable ending in ARTIFACTS (OLD_ARTIFACTS) cannot shadow it as a
    # substring, and it strips comments first so a commented-out assignment cannot shadow
    # the real one.
    text = (
        "#!/bin/bash\n"
        '# ARTIFACTS="archive-core.json"  # stale set left in a comment\n'
        'OLD_ARTIFACTS="archive-legacy.json only-old.json"  # a look-alike var name\n'
        'ARTIFACTS="archive-data.json archive-core.json search-index.json"\n'
        'for f in $ARTIFACTS; do : ; done  # a preflight loop the parser must ignore\n'
        'for f in $ARTIFACTS; do cp "$DATA_DIR/$f" "$FTP_DIR/$f"; done\n'
    )
    assert _parse_shell_artifact_list(text) == [
        "archive-data.json",
        "archive-core.json",
        "search-index.json",
    ]


def test_shell_parser_returns_tokens_verbatim_so_malformed_lists_fail():
    # bash word-splits `for f in $ARTIFACTS`, so the parser returns those exact words
    # rather than salvaging `.json` substrings. A malformed token (a comma-suffixed
    # filename, a stray fragment) is returned as-is, which makes the parity comparison
    # against EXPECTED_ARTIFACTS fail loudly instead of a lenient `.json`-only extraction
    # normalizing `archive-core.json,` into a clean `archive-core.json` and hiding drift.
    text = 'ARTIFACTS="archive-data.json archive-core.json, search-index.json"\n'
    tokens = _parse_shell_artifact_list(text)
    assert tokens == ["archive-data.json", "archive-core.json,", "search-index.json"]
    assert set(tokens) != EXPECTED_ARTIFACTS  # a comma-suffixed token breaks parity
