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

## What if something goes wrong?

If Column F shows `error`, Column H will tell you why in plain English:

- `URL must start with http:// or https://` — fix the URL in Column B,
  untick the checkbox, then re-tick it.
- `URL already exists in archive` — already in there; no action needed.
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
