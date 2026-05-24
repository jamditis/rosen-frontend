# How to add a piece of writing to the archive

Hi Jay — here's how to get a new article, post, or interview into your
archive. The whole thing takes about 30 seconds per item from your end.

## What you need

1. The URL of the piece.
2. A web browser open to your **Rosen Archive URL List** Google Sheet.

That's it. No software to install, nothing to log into beyond Google.

## The steps

1. Open the sheet.
2. Find the first empty row (or click the **+** at the bottom to add one).
3. **Column B:** paste the URL.
4. **Column C** (optional): if you'd like to override the title the
   scraper would otherwise pick, type your preferred title here. Leave
   blank to let the scraper choose.
5. **Column D** (optional): any notes. These don't appear in the public
   archive — they're just for your own reference.
6. **Column E:** click the checkbox. **This is the trigger** — nothing
   happens until you tick this.

Within a few seconds, **Column F** will show `submitted`. A few minutes
later (longer if a lot of items are queued ahead of yours), it will
change to `live` and **Column G** will show the new record ID
(`RECORD-00xxx`). At that point the piece is in the archive and visible
on `summit.pressthink.org/j/rosen-archive/`.

## What the status column can say

You'll usually see `submitted` → `live`. Anything else is a signal:

- **`submitted`** — Apps Script accepted the row and sent it to the
  server. Normal early state.
- **`archived`** — the piece is in the archive's underlying data, but
  the live site hasn't been pushed yet. Usually a transient state; the
  next batch updates the live site. If it sticks here for more than an
  hour, check Column H or ask Joe.
- **`live`** — visible on the public site. Done.
- **`duplicate`** — the URL was already in the archive. No action needed.
- **`error`** — something went wrong. Column H has the reason.
- **`no URL`** — Column B is empty. Fill it in and re-tick the checkbox.
- **`invalid URL`** — what's in Column B doesn't look like a URL. Make
  sure it starts with `http://` or `https://`.

## What if Column F says `error`?

Column H will tell you why in plain English:

- `URL already exists in archive` — already in there; no action needed.
- `That URL cannot be accepted: ...` — the server rejected the URL for
  safety reasons (private IP, malformed). Double-check it's a real
  public URL.
- `Network: ...` — the server was unreachable. Untick the checkbox, wait
  a minute, re-tick.
- `Scrape returned no data (URL may be unreachable)` — the original page
  is gone or blocks scrapers. Try the Wayback Machine version (paste
  `https://web.archive.org/web/<URL>` instead).
- Anything else: send the row's contents to Joe and he'll sort it out.

## Bulk-add

If you have a lot of URLs (e.g. a Facebook export), paste them all into
Column B at once. Don't tick the checkboxes yet. Then tick them in batches
— say, 5 at a time, waiting a minute between batches — so the server
isn't flooded. There's no hard limit, but going slower means you'll catch
any problems before they pile up.

## Inviting someone else to add things

The sheet can be shared with anyone with a Google account. Click
**Share** in the top right, type their email, give them **Editor** access.
They'll be able to add rows and tick checkboxes exactly the same way.

## Questions

Joe: `jamditis@gmail.com`. Hali also knows how this works as of the May
2026 handoff and can answer everyday questions.
