# Source inventories

Checked-in lists of works that a named source says exist. A measurement script
reads an inventory and compares it with `data/archive_records-public.csv`.

The point of checking these in is auditability. A count nobody can re-derive is
not evidence. Every inventory here names its source, records the date it was
retrieved, and states what it can and cannot show.

Nothing in this tree is deployed. It is measurement input only.

## File format

Each inventory is one JSON file:

```json
{
  "source_id": "wayback-monthly-index",
  "source_name": "PressThink Movable Type monthly archive pages",
  "provenance": "the query or url the entries came from",
  "retrieved_at": "2026-08-27",
  "coverage_note": "what this source can and cannot show",
  "entries": [
    {
      "url": "http://archive.pressthink.org/2004/08/31/cnn_rnc.html",
      "date": "2004-08-31",
      "title": "Down at the Tick Tock Diner, I Caught Up With CNN",
      "body": "In which the demise of the network sky box is confirmed...",
      "evidence": "https://web.archive.org/web/20110811215744/http://..."
    }
  ]
}
```

`url` and `date` are required on an entry. `title`, `body`, and `evidence` are
optional. A source that supplies fewer fields gives the matcher less to work
with, and the report says so instead of guessing.

A source may add its own top-level keys. The monthly-index inventory adds
`months_with_snapshot` and `months_without_snapshot` so its coverage holes are
visible in the file itself.

## pressthink-2004-2008

Inventories for the Movable Type era of PressThink, which lived at
`archive.pressthink.org`. Issue #815.

| File | Source | Rebuild with |
| --- | --- | --- |
| `wayback-monthly-index.json` | the site's own month index pages, read through the Wayback Machine | `pressthink_2004_2008_gap.py fetch-monthly-index` |
| `wayback-cdx.json` | the Wayback Machine capture index for the host | `pressthink_2004_2008_gap.py fetch-cdx` |
| `gap-report.json` | the machine-readable output of the measurement | `pressthink_2004_2008_gap.py report` |

The script is `backend/scripts/pressthink_2004_2008_gap.py`. The written report
is `docs/pressthink-2004-2008-gap-2026-08-27.md`.

Both of these sources read the same Wayback Machine crawl of the same host, and
for 2004-2008 they resolve to the same url set. Two sources here are not two
independent measurements, and the report says so. A genuinely independent
source for this era would have to come from outside the Wayback Machine.

`archive.pressthink.org` serves an untrusted TLS certificate, so its URLs are
stored and fetched over plain `http`. That is correct, not a mistake to fix.
