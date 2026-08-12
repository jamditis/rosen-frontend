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

---

## Step 5: Upload to the live site

Connect with Edgar's explicit FTPS account (credentials from Joe) and upload
these files to `j/rosen-archive/data/`. That is the archive path exposed inside
this account's chroot; filesystem or control-panel paths are not interchangeable
with it.

- `data/archive-core.json`
- `data/archive-data.json`
- `data/archive-details.json`

The site will show the new records immediately — no cache clearing needed.

---

## Adding social posts (Bluesky, Twitter)

If you want to add posts from Jay's Bluesky account after retirement, use `data/social_posts.csv` instead. The columns are similar, but the `id` field uses a `BSKY-` prefix — again, go one past the current max in the file (as of 2026-07-23 the max is `BSKY-03172`, so the next is `BSKY-03173`). The `content_type` should be `Social Media Post`.

That file doesn't need to be updated as often — articles and essays are more important for the archive.

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
git add data/archive_records-public.csv data/authored-excerpts.csv data/archive-core.json data/archive-data.json data/archive-details.json
git commit -m "Add [number] new records through [date]"
git push
```

`data/authored-excerpts.csv` is in that list on purpose: it is the source of your authored excerpts. If you skip it, the JSON still carries the override now, but the next regeneration from a clean checkout has no excerpt to apply and your text reverts to the auto-generated summary.

This isn't required for the site to work, but it keeps a history of changes and makes it easy to undo mistakes.

---

## Getting help

Contact Joe Amditis — he built the archive and can walk you through any of these steps.
