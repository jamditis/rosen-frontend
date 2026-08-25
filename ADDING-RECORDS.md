# Adding new records to the archive

This guide explains how to add new articles, essays, or posts from 2026 onward to Jay Rosen's Internet Archive.

---

## What you'll need

- **A text editor** — anything works (TextEdit, Notepad, VS Code)
- **Node.js** — download from [nodejs.org](https://nodejs.org) if you don't have it
- **An FTP client** — [Cyberduck](https://cyberduck.io) (free, Mac/Windows) or FileZilla
- **FTP credentials** for pressthink.org — ask Joe Amditis

---

## Overview

The archive works like this:

```
You edit a CSV file → run one command → upload one file → done
```

There's no database, no CMS login, no complex system. The CSV file is the source of truth.

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

If you open it in Google Sheets or Excel, the columns will be labeled. That's the easiest approach.

---

## Step 2: Add a new row

Add a new row at the **bottom** of the file. The most important columns are:

| Column | What to put |
|--------|-------------|
| `id` | Next available ID — one past the current max in the file (as of 2026-07-23 the max is `RECORD-00905`, so the next is `RECORD-00906`). Always check the bottom of the file for the real current max; don't fill gaps. |
| `title` | Title of the article or post |
| `url` | Link to the original |
| `author` | `Jay Rosen` |
| `publication_date` | Format: `YYYY-MM-DD` (e.g. `2026-03-15`) |
| `original_publication` | Where it was published (e.g. `PressThink`, `The Atlantic`) |
| `content_type` | `Article`, `Essay`, `Interview`, or `Lecture` |
| `thematic_categories` | Pick one or more from the list below, separated by commas |
| `era` | `Platform Transition & Future Models (2021-Present)` for anything after 2021 |
| `verified` | `TRUE` |

All other columns can be left blank for now.

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

### Example row (what a new 2026 PressThink post looks like)

```
RECORD-00906,The Citizens' Agenda in 2026,https://pressthink.org/2026/03/citizens-agenda-2026/,Jay Rosen,2026-03-15,PressThink,PressThink,,Article,text,,,,Summary of the post goes here.,,Press & Media Criticism,,Platform Transition & Future Models (2021-Present),Commentary/Critique,,,,,,,,,,,TRUE,
```

---

## Step 3: Save the CSV

If you edited in **Google Sheets or Excel**: export/save as CSV (not .xlsx). The file should still be named `archive_records-public.csv` and go back in the `data/` folder.

If you edited in a **text editor**: just save the file.

---

## Step 4: Regenerate the JSON

Open a terminal (Mac: search for "Terminal", Windows: search for "Command Prompt"), navigate to the repo folder, and run:

```bash
npm install
node data/export-archive-data.js
```

This takes about 30–60 seconds and produces updated JSON files in the `data/` folder. The script prints progress as it goes: starting the export, reading each CSV file (with a row count for each), processing records, building entities and relationships, and finally writing the four JSON output files. If the run finishes without errors, the updated JSON files are ready to upload.

Next, choose the new release version and stamp every cache and import marker together:

```bash
npm run bump-version -- X.X.X
```

This updates `index.html`, `version.json`, the relevant `?v=` import strings, and `frontend/sw.js` `CACHE_VERSION`. Keep all of those changes in the same release. Returning visitors can otherwise receive cached archive JSON from the previous release.

---

## Step 5: Upload to the live site

Connect with Edgar's explicit FTPS account (credentials from Joe) and upload
these files to `j/rosen-archive/data/`. That is the archive path exposed inside
this account's chroot; filesystem or control-panel paths are not interchangeable
with it.

- `data/archive-core.json`
- `data/archive-data.json`
- `data/archive-details.json`

Publish the complete versioned bundle in the order documented in [`DEPLOYMENT.md`](DEPLOYMENT.md), with root `index.html`, `frontend/sw.js`, root `sw.js`, and `version.json` last. The coordinated version bump invalidates old browser caches, so visitors do not need to clear them manually.

---

## Adding social posts (Bluesky, Twitter, Mastodon)

This is the manual repair and backfill path. Use `data/social_posts.csv`. Select the ID prefix from the post's platform: `BSKY-` for Bluesky, `TWTR-` for Twitter, and `MAST-` for Mastodon. Find the highest ID with that prefix and use the next zero-padded number. For example, `BSKY-03172` is followed by `BSKY-03173`. The `content_type` should be `Social Media Post`.

New work now appears mainly on Bluesky. The planned continuous workflow is Bluesky-first. It treats original posts and meaningful public conversation as candidates. It keeps short acknowledgements as thread context, not standalone records. The complete system map is maintained in the public repository `docs/` directory.

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

## Committing your changes to GitHub

After adding records and confirming the site looks right, save your work to the repository:

```bash
git add -u -- .
git diff --cached --name-only
git commit -m "Add [number] new records through [date]"
git push
```

Run this from a clean checkout so `git add -u -- .` stages only this release's tracked changes. Before committing, confirm the staged list includes the source CSVs you edited, every generated JSON file, `index.html`, `version.json`, `frontend/sw.js`, and every frontend or standalone-page file changed by the version bump. `data/authored-excerpts.csv` must be present when you changed an authored excerpt; otherwise the next regeneration from a clean checkout loses that override.

This isn't required for the site to work, but it keeps a history of changes and makes it easy to undo mistakes.

---

## Getting help

Contact Joe Amditis — he built the archive and can walk you through any of these steps.
