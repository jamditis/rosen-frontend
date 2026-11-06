# Adding new records to the archive

This guide explains the manual path for adding new or recovered older work to Jay Rosen's Internet Archive. A curator can prepare the source information; the maintainer handles ID allocation, validation, and publication. To suggest a work without editing files, use [Ways to participate](https://pressthink.org/j/rosen-archive/features/participate/).

---

## What you'll need

- **A current working copy of the repository**, with a backup before editing
- **A spreadsheet app or plain-text editor** that preserves all CSV columns and quoted, multiline text
- **Node.js** for the maintainer's data-generation and validation steps
- **An authorized maintainer** who can use the existing release workflow. For a manual transfer, use certificate-verified explicit FTPS and obtain credentials privately from Joe Amditis.

---

## Overview

The manual path has four parts: edit the source CSV, regenerate the website files, validate the release, and publish the complete coordinated bundle.

There is no CMS editing login. The CSVs are the source records; JSON files are generated copies used by the website. Editing only a JSON file loses the change the next time the data is regenerated. A successful export or GitHub commit is not proof that a record is live.

---

## Publishing older work online for the first time

Use the original date when you publish a verbatim copy of an older talk, essay,
or other work on PressThink. Set the WordPress post date to the date when the
work was first delivered or circulated.

Put this note at the top of the post:

> Editor's note: This work was originally delivered on [original date] and was
> first published online on [online publication date].

Use today's WordPress date when you write a new post about an older event. The
new post is new work, even when the event is historical.

The archive checks PressThink for recently modified posts, so it can discover a
newly posted item with an older post date. During ingestion, it stores the date
shown by PressThink as `publication_date`. A verbatim republication therefore
appears in the archive at its original date, not at its online publication date.

---

## Step 1: Open the CSV file

Open this file in your text editor or a spreadsheet app like Excel or Google Sheets:

```
data/archive_records-public.csv
```

If you open it in Google Sheets or Excel, keep the first row as the column headings. As of November 6, 2026, this file has **38 columns**. Preserve every heading and its order, including `collection_id`, `low_confidence`, and `needs_review`; blank cells still need their columns. Text cells can contain commas, quotation marks, and line breaks, so use a CSV-aware import/export and check the saved result before replacing the working file.

---

## Step 2: Add a new row

Add a new row at the **bottom** of the file. The most important columns are:

| Column | What to put |
|--------|-------------|
| `id` | Ask the maintainer to reserve a new `RECORD-` ID using the shared allocator in `backend/scripts/record_id_sequence.py`. It checks existing IDs and the high-water mark in `data/record-id-sequence.json`. The last row is not a safe allocator; never reuse a retired ID or fill a gap. |
| `title` | Title of the article or post |
| `url` | Link to the original |
| `author` | The author supported by the source; usually `Jay Rosen` |
| `publication_date` | Verified original publication date in `YYYY-MM-DD` form. Record uncertainty in `notes` and ask the curator when an exact date is unknown. |
| `original_publication` | Where it was published (e.g. `PressThink`, `The Atlantic`) |
| `content_type` | The appropriate existing type, such as `Article`, `Interview (Audio/Video)`, or `Speech/Lecture` |
| `thematic_categories` | Pick one or more from the list below, separated by commas |
| `era` | `Platform Transition & Future Models (2021-Present)` for anything after 2021 |
| `verified` | Set to `TRUE` only after the source details have been checked. For an unresolved manual addition, keep it out of publication and ask the curator to review it. |
| `needs_review` | Record an outstanding human-review requirement explicitly. This flag alone does **not** prevent publication. |
| `notes` | Public-safe source evidence, corrections, and any date or attribution uncertainty |

Preserve all other columns, even when a value is blank. For an existing record, keep its ID and unrelated fields unchanged. Before changing source rows, the maintainer must check for pending ingestion transactions and coordinate with other writers. Keep the ID reservation state with the data change.

Automated submissions can set `verified=TRUE` while also setting `needs_review=true`. Neither a public record nor the verification flag alone establishes that a human has finished checking it.

### Thematic categories to use

Pick from these (use the exact spelling):

- `Press & Media Criticism`
- `Politics & Democracy`
- `Journalism Theory & Practice`
- `Audience & Public Engagement`
- `Technology & Digital Media`
- `Journalism Education`

You can combine them: `Press & Media Criticism, Politics & Democracy`

> This list mirrors `backend/schema.json` (`taxonomy.thematic_categories`), the
> single source the backend reviewer and auto-categorizer read. To add or
> remove a category, edit that file and this list together. A test
> (`backend/tests/test_taxonomy_single_source.py`) fails if they drift apart. The
> scripts pick up the change with no code edit; this list is the one mirror to
> keep in step.

### Example fields for a new record

This is an illustration, not a row to paste into the archive. Enter values under the matching headings in the current 38-column file; do not reconstruct a CSV row from this table.

| Column | Illustrative value |
| --- | --- |
| `id` | The new ID reserved by the maintainer |
| `title` | Example essay title |
| `url` | `https://example.invalid/essay/` — replace with the verified source URL |
| `author` | The author shown on the source |
| `publication_date` | The date verified on the source |
| `original_publication` | The publication shown on the source |
| `content_type` | `Article` |
| `summary` | A checked description of what the piece says |
| `thematic_categories` | `Press & Media Criticism` |
| `era` | The appropriate value from `data/SCHEMA.md` |
| `verified` | `TRUE` only after review |

Never use an ID from an example as the next available ID.

---

## Step 3: Save the CSV

If you edited in **Google Sheets or Excel**: export/save as UTF-8 CSV (not .xlsx). The file should still be named `archive_records-public.csv` and go back in the `data/` folder. Confirm the 38 headings and existing IDs survived, and that commas, line breaks, and quotation marks remain inside the correct cells. Keep the backup until validation succeeds.

If you edited in a **text editor**: just save the file.

---

## Step 4: Regenerate and validate the release

Open a terminal (Mac: search for "Terminal", Windows: search for "Command Prompt"), navigate to the repo folder, and run:

```bash
npm ci
node data/export-archive-data.js
```

The exporter prints source counts and writes the runtime data, lexical search indexes, analytics, relationship files, and feeds. Successful generation is the first check, not permission to publish. Compare the reported record counts and changed files with the intended edit.

After published records change, refresh both search-by-meaning vector pairs as described in [`data/README.md`](data/README.md#search-by-meaning-vectors):

```bash
npm run build-embeddings
npm run build-social-embeddings
```

The data guide explains when a verified incremental social-vector build can be used. Keep each binary and its matching index together.

Next, choose the new release version and stamp every cache and import marker together:

```bash
npm run bump-version -- X.X.X
```

This updates `index.html`, `version.json`, the relevant `?v=` import strings, and `frontend/sw.js` `CACHE_VERSION`. Keep all of those changes in the same release. Returning visitors can otherwise receive cached archive JSON from the previous release.

Run the graph validator and repository tests, and resolve failures before publication:

```bash
npm run validate:graph
npm test
```

The maintainer should preview the affected record, its source link, summary, and citation. The [stewardship census procedure](data/README.md#stewardship-coverage-census) requires committing clean source/runtime inputs before regenerating and committing the census; it also requires full Git history. Follow that sequence and the current [release procedure](DEPLOYMENT.md#release-procedure).

---

## Step 5: Publish and check the live record

Have the authorized maintainer publish the tested, committed release using the existing workflow in [`DEPLOYMENT.md`](DEPLOYMENT.md#release-procedure). GitHub Pages and the PressThink archive are separate destinations; a successful Pages update does not establish that PressThink is current.

For a manual transfer, use certificate-verified explicit FTPS to the approved `j/rosen-archive/` path. Follow the complete deployment manifest, including regenerated data, search indexes, both vector pairs, relationship shards and manifest, feeds, versioned assets, and record-specific shells. Do not upload just the three main JSON files or the source CSVs. Upload dependencies first, then standalone pages and record shells, with root `index.html`, `frontend/sw.js`, root `sw.js`, and `version.json` last.

Require successful public-byte verification and matching release markers. Then open the record at [the PressThink archive](https://pressthink.org/j/rosen-archive/) and confirm the title, date, source link, changed fields, and citation. Record the release version and record ID. An upload acknowledgement alone does not prove that readers received the update.

---

## Adding social posts (Bluesky, Twitter, Mastodon)

This is the manual repair and backfill path. Use `data/social_posts.csv` and preserve its own current column headings. Select the ID prefix from the post's platform: `BSKY-` for Bluesky, `TWTR-` for Twitter, and `MAST-` for Mastodon. Have the maintainer allocate an unused platform ID against the complete current source while coordinating with automated writers; do not reuse an existing or retired ID. The `content_type` should be `Social Media Post`.

New work now appears mainly on Bluesky. The [current daily publication guide](docs/operations/bluesky-stewardship.md) describes implemented collection, admission, and verified publication. It keeps short acknowledgements and uncertain items as context rather than standalone public records. The [stewardship design map](docs/bluesky-stewardship-pipeline.md) describes additional preservation and review plans; do not assume those plans are already operating.

---

## Controlling the summary shown for a post

By default the archive shows an auto-generated or scraped summary for each post. If you want to write the exact summary text shown for a specific post instead, author an excerpt for it.

Open this file:

```
data/authored-excerpts.csv
```

It has two columns: `record_id` and `authored_excerpt`. Add one row per post you want to control:

```
record_id,authored_excerpt
RECORD-00906,The summary you want readers to see for this post.
```

- The `record_id` is the `id` of the row in `data/archive_records-public.csv` (for example `RECORD-00906`), or a `BSKY-` id for a social post.
- When a record has an authored excerpt, the archive shows it instead of the auto-generated summary.
- Leave a post out of this file, or leave its `authored_excerpt` blank, and the archive keeps its existing summary behavior. Nothing else changes.

After editing, regenerate the JSON (Step 4) and upload (Step 5) the same way. The export prints how many authored excerpts it applied, so you can confirm yours was picked up.

---

## Adding or removing a thematic category

Step 2 above tags one record with categories that already exist. This section
is different: it's for changing the category list itself — for example,
adding a whole new category like "Local news" so it can show up in the
sidebar. Adding a category is fully self-service. Removing one is almost
self-service — one step needs a developer, and it's called out below.

### Where the category list lives

The full list lives in one file: `backend/schema.json`, under
`taxonomy.thematic_categories`. Each entry has a `name` and a `description`.

The "Thematic categories to use" list in Step 2 above is a copy of that same
list, written for people editing the CSV by hand. A test checks that the two
match. If you change one, change the other the same way.

### To add a new category

1. Open `backend/schema.json`. Add a new entry under
   `taxonomy.thematic_categories`, with a `name` and a short `description`.
   Follow the style of the entries already there. Pick a name that reads as
   clearly different from every existing one: a test blocks a new name that
   is a near-duplicate of an existing category, such as a different case, an
   `&` vs `and` swap, a singular/plural change, or very similar spelling.
2. Open `ADDING-RECORDS.md` (this file). Add the same category name as a new
   bullet under "Thematic categories to use" in Step 2, anywhere in the list.
3. Tag at least one record with the new category. Open
   `data/archive_records-public.csv` and add the category name to the
   `thematic_categories` column of any record it fits, the same way you'd tag
   a record with an existing category (see Step 2). A category with zero
   records tagged will not show up anywhere on the site — the sidebar only
   lists categories that are actually on records. The sidebar also shows only
   the first 10 categories alphabetically, with a "view all" link for the
   rest. Six categories fit today with nothing hidden, but a new name late in
   the alphabet can land behind that link instead of showing right away.
4. Regenerate the JSON and bump the version, the same as Step 4 above:
   `node data/export-archive-data.js`, then `npm run bump-version -- X.X.X`.
5. Validate, commit, and publish using Steps 4 and 5 and "Committing your changes" below.

Do steps 1 and 2 before step 3. A separate repair tool a developer runs from
time to time (`backend/scripts/archive_record_reviewer.py`) checks every
record's categories against `backend/schema.json`. If it finds a category
name it does not recognize, it tries to guess the closest existing category
and rewrites your new category to that guess. If no guess is close enough, it
deletes the unrecognized category from the record instead — silently, with
no category left in its place. Adding the name to `schema.json` first stops
that from happening.

A developer can also teach the auto-categorizer
(`backend/scripts/auto_categorize_records.py`) to apply the new category to
matching records automatically. That is optional — manual tagging in the CSV
works fine on its own.

### To remove a category

1. Make sure no record needs it anymore. Open
   `data/archive_records-public.csv` and update the `thematic_categories`
   column on any record that still has it, so the removed name is not left on
   any row.
2. Remove the entry from `backend/schema.json`
   (`taxonomy.thematic_categories`) and from the "Thematic categories to use"
   list in Step 2 above.
3. Ask a developer to check `backend/scripts/auto_categorize_records.py` for
   a rule that names the removed category, in `CATEGORY_PATTERNS` or
   `URL_PATTERNS`. Every current category has at least one such rule, so
   check both. If a rule exists, it must be deleted in the same change. This
   step needs a developer, because it is a Python file edit, not a CSV or
   Markdown edit.

   Skipping this step breaks the backend for everyone, not just the removed
   category: the auto-categorizer refuses to run at all, and the backend
   test suite fails before a single test runs. That turns the pull request's
   CI check red.
4. Regenerate the JSON, refresh the required vectors, bump the version,
   validate, commit, and publish — the same steps as adding a category.

If a record still carries the removed name when you regenerate, that name
keeps showing up in the sidebar. The sidebar list is built from what is
actually on records, not read straight from `schema.json`, so one leftover
record keeps an orphaned name alive until that record is fixed.

### Category colors are automatic

You do not need to pick or assign a color for a new category. The sidebar
list itself is plain text — a checkbox and a label, no color. Color shows up
elsewhere: on each record card's accent stripe and on folder cards, chosen
automatically from a fixed set of colors in `frontend/constants.js`. The
color is based on the category's name, so the same category always gets the
same color, and a new category just gets one of the existing colors. Two
categories can end up with the same color — that is expected and is not a
bug.

---

## Committing your changes to GitHub

The maintainer saves the source and tested release files to the repository before publication. Start from a clean checkout and inspect the exact changes being staged:

```bash
git add -u -- .
git diff --cached --name-only
git commit -m "Add [number] new records through [date]"
```

Run this from a clean checkout so `git add -u -- .` stages only this release's tracked changes. Before committing, confirm the staged list includes the source CSVs you edited, every generated JSON file, `index.html`, `version.json`, `frontend/sw.js`, and every frontend or standalone-page file changed by the version bump. `data/authored-excerpts.csv` must be present when you changed an authored excerpt; otherwise the next regeneration from a clean checkout loses that override.

Also preserve any changed `data/record-id-sequence.json`, generated feeds, vector pairs, and relationship files. New files are not included by `git add -u`; inspect and stage those explicitly before the data commit. Once the source/runtime inputs are committed and clean, complete the census step:

```bash
npm run census:stewardship
npm run test:data
git add data/stewardship-census.json data/stewardship-census.md
git diff --cached --name-only
git commit -m "Refresh stewardship census"
```

Commit the reports only if they changed. Push the reviewed commits through the repository's agreed workflow, then use Step 5 to publish and verify the same release. Keep the tested commit and its version together so another maintainer can reproduce the publication and investigate a mistake.

---

## Getting help

Contact Joe Amditis — he built the archive and can walk you through any of these steps.
