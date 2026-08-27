# Archive baseline snapshot

This tool freezes a checksummed copy of the archive data before slow
per-object preservation work begins (issue #702). It is separate from the
per-record preservation manifest documented in `preservation/README.md`
(issue #701): that one tracks capture history for individual archive
objects; this one is a single point-in-time snapshot of the data files
themselves.

## What gets included

`preservation/baseline-manifest-lib.mjs` lists four groups of files, matching
issue #702's scope:

| Category | Files |
|---|---|
| `source-csv` | `data/archive_records-public.csv`, `data/social_posts.csv` |
| `runtime-json` | `data/archive-core.json`, `data/archive-details.json`, `data/archive-data.json` |
| `entity-relationship-data` | `data/extracted_entities.csv`, `data/extracted_relationships.csv`, `data/archive-entities.json`, `data/relationship-adjacency-manifest.json`, and the 16 `data/relationship-adjacency-*.json` shards |
| `schema` | `data/schema.json` |

Every path is explicit — there is no wildcard scan of `data/`, so audit
reports, working CSVs (`data/records_needing_categories.csv`, and similar),
and other non-baseline files never end up in a snapshot by accident.
`resolveBaselineFiles()` fails loudly (throws, does not skip) if a listed
path is missing or renamed, so a baseline never silently shrinks. If you move
or rename one of these files, update `BASELINE_CATEGORIES` in
`preservation/baseline-manifest-lib.mjs` in the same change.

## Commit `43bb423` does not exist in this repository

Issue #702's acceptance criteria ask this tool to record commit `43bb423`, or
document the newer commit used instead. `43bb423` is not a valid commit in
this repository (`git cat-file -e 43bb423^{commit}` fails). Every baseline
this tool produces therefore records:

- the actual current `HEAD` commit, as `Source-Commit` in `bag-info.txt` and
  `commit` in `baseline-manifest.json`;
- an explicit note (`Source-Commit-Note` / `commitNote`) stating that
  `43bb423` does not exist and that `HEAD` was used instead.

`computeCommitProvenance()` checks this with `git cat-file` every time it
runs, so the note keeps itself honest if the commit graph ever changes (for
example after a rebase that introduces that hash). The tool always freezes
the files on disk at the current `HEAD` — it does not check out and archive
an arbitrary historical commit's tree.

If the working tree has uncommitted changes when a baseline is created,
`bag-info.txt` records `Source-Tree-Status: dirty` and the CLI prints a
warning, so a baseline never quietly claims a clean commit it does not match.

## Package layout (BagIt-compatible)

`node preservation/create-baseline-manifest.mjs --output <dir>` writes:

```
<dir>/
  bagit.txt               # BagIt-Version + tag file encoding
  bag-info.txt            # Source-Commit, Payload-Oxum, dates, etc.
  manifest-sha256.txt     # "<sha256>  data/<path>" per payload file
  tagmanifest-sha256.txt  # checksums of the tag files above and baseline-manifest.json
  baseline-manifest.json  # the same file list with byte size next to each SHA-256
  data/                   # copies of every included file
    data/archive_records-public.csv
    data/social_posts.csv
    ...
```

`manifest-sha256.txt` follows `sha256sum -c` conventions (two spaces between
digest and path), and every payload copy lives at `data/<repo-relative-path>`.
Because the included files already live under the repository's own `data/`
directory, this nests as `data/data/...` inside the bag — the outer `data/`
is the BagIt payload directory; the inner `data/` is the repository's own
folder. `baseline-manifest.json` is the easiest place to read a flat file
list; `manifest-sha256.txt` is what makes the package BagIt-compatible.

## Creating a baseline

```bash
npm run baseline:create -- --output /path/outside/the/repo/baseline-2026-07
```

With no `--output`, the tool writes to a fresh directory under the OS temp
folder and prints the path — a baseline is never written into a location
that could end up in normal frontend git history. `/preservation/baseline/`
is also gitignored as a safety net if you do pass an in-tree `--output`.

## Verifying a baseline

```bash
npm run baseline:verify -- /path/to/baseline-2026-07
```

This recomputes the SHA-256 of every payload file under `<dir>/data` and every
tag file (`bagit.txt`, `bag-info.txt`, `manifest-sha256.txt`,
`baseline-manifest.json`), compares each against its recorded digest, and
prints every mismatch or missing file. It exits non-zero on any failure.

Because the manifest only stores paths relative to the bag's own root, this
works the same way from a clean copy in a different directory — copy the
whole bag anywhere (a new machine, a freshly mounted drive, a scratch
directory) and verify it there. A deliberately altered payload file, a
deleted payload file, or an altered tag file (`bag-info.txt`, etc.) is
reported as a failure, not silently accepted; `tests/baseline-manifest.test.js`
exercises all three cases.

## Restoring a baseline

1. Copy the bag directory to wherever you're restoring into.
2. Run `npm run baseline:verify -- <bag-dir>` and confirm it prints `OK`.
3. Check out the commit recorded as `Source-Commit` in `bag-info.txt`
   (`git checkout <commit>`), or a fresh clone at that commit.
4. Copy each file from `<bag-dir>/data/data/<path>` to `<checkout>/<path>`,
   preserving the relative path (for example
   `<bag-dir>/data/data/archive_records-public.csv` restores to
   `<checkout>/data/archive_records-public.csv`).
5. Re-verify the restored files against the original bag without copying
   them back into it:

   ```bash
   npm run baseline:verify -- <bag-dir> --data-dir <checkout>
   ```

   `--data-dir` tells the verifier to read payload files from
   `<checkout>/<path>` instead of `<bag-dir>/data/data/<path>`, so you can
   confirm a restore matches the frozen baseline exactly, without needing a
   second full copy of the payload.

Step 5 is the same mechanism `tests/baseline-manifest.test.js` uses to prove
the restore procedure recreates the exact packaged files.

## Storage locations — not yet done

Issue #702 also asks for at least two copies of a baseline stored outside
this git working tree, with their retention policies recorded. **That part
is not implemented by this change.** This tool produces one local bag and
tells you where it wrote it; actually copying that bag to two off-repo
storage locations (and deciding what each location's retention policy is)
is manual, deliberate follow-up work — see the tracking issue this lands
under for status. Treat any baseline this tool produces as a single
verified copy until that follow-up is done.

## Commands

```bash
npm run baseline:create -- --output <dir>          # build a baseline bag
npm run baseline:verify -- <bag-dir>                # verify a bag in place
npm run baseline:verify -- <bag-dir> --data-dir <d> # verify a restored data/ tree
node --test tests/baseline-manifest.test.js         # run the test suite for this tool
```
