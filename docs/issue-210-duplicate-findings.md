# Issue #210 findings — title-duplicate audit + URL-policy

Audit date: 2026-05-25. Investigation done by querying each candidate URL with `curl` + `<title>` extraction, plus comparing CSV `raw_text` first-paragraphs against the live HTML bodies.

This file documents what the audit found, which fixes are safe to auto-apply (now done in this PR), and which need a curator decision.

---

## Summary

| Original "duplicate" pair | Real verdict | Action |
|---|---|---|
| 00337 + 00445 ("Bloggers Are Missing in Action...") | **NOT a duplicate** — title-drift bug | Fixed in this PR (00337 title restored) |
| 00211 + 00499 ("Sinclair Broadcast Group") | **NOT a duplicate** — title-drift bug | Fixed in this PR (00211 title restored) |
| 00023 + 00098 ("America's Press...") | **Same essay, two venues** — title-homogenized | Fixed in this PR (00098 title + URL restored) |
| 00340 + 00699 ("Audience Atomization Overcome") | **Real duplicate** — same essay, archive vs modern URL | **Joe's call** — see below |
| 00740 + 00771 ("CNN's Impossible Dilemma") | **Same content + dead URL** on 00740 | **Joe's call** — see below |

---

## Fixed in this PR (verified against live HTML)

### RECORD-00098 — title + URL fix

**Before:**
- title: `America's Press and the Asymmetric War for Truth`
- url: `https://pressthink.org/2020/11/the-coming-confrontation-between-the-american-press-and-the` (truncated)

**After:**
- title: `The coming confrontation between the American press and the Republican Party`
- url: `https://pressthink.org/2020/11/the-coming-confrontation-between-the-american-press-and-the-republican-party/`

**Why:** The PressThink HTML `<title>` element is the second value. The CSV title was homogenized to match RECORD-00023's NYBooks variant title; per the body's first line ("First published in a slightly different form as 'America's Press and the Asymmetric War for Truth' at the New York Review of Books site"), the PressThink piece is the longer follow-on, with its own title.

### RECORD-00337 — title fix

**Before:** `Bloggers Are Missing in Action as Ketchum Tests the Conscience of PR` (this is actually RECORD-00445's title)
**After:** `Ketchum and Bloggers: Who Said What?  What Remains?  Lisa Stone Reports.`

**Why:** HTML `<title>` on the live URL. The CSV title was copy-pasted from RECORD-00445. Body content ("I expected more response. First, because this was the second time Ketchum was implicated...") matches the corrected title — Rosen's follow-up commentary on the Ketchum-PR-blogger discussion, posted a day after RECORD-00445.

### RECORD-00211 — title fix

**Before:** `Sinclair Broadcast Group: What Are They Doing in the Middle of Our Election?` (this is actually RECORD-00499's title)
**After:** `Agnew with TV Stations: Sinclair Broadcasting Takes On John Kerry and The Liberal Media`

**Why:** HTML `<title>` on the live URL. The CSV title was copy-pasted from RECORD-00499. Body content (Stolen Honor + Sinclair Broadcasting) matches the corrected title — the Oct 13 piece in a 3-day Sinclair series (RECORD-00211 Oct 13 + RECORD-00499 Oct 16).

### RECORD-00699 — URL completion

**Before:** `https://pressthink.org/2009/01/audience-atomization-overcome-why-the-internet-weakens-the-` (truncated)
**After:** `https://pressthink.org/2009/01/audience-atomization-overcome-why-the-internet-weakens-the-authority-of-the-press/`

**Why:** Server redirect from the truncated URL resolves to the full slug.

---

## Curator decisions remaining

### RECORD-00340 + RECORD-00699 — "Audience Atomization Overcome"

Same essay, two URL variants. Both verified live (HTTP 200):

| Record | URL | raw_text | Notes |
|---|---|---|---|
| 00340 | `http://archive.pressthink.org/2009/01/12/atomization_p.html` | 20,450 chars | Movable Type era, `http://` only (TLS issue per CLAUDE.md), title prefix `PressThink:` |
| 00699 | `https://pressthink.org/2009/01/audience-atomization-overcome-...` | 38,301 chars | Modern WordPress, full HTTPS, clean title |

**Recommendation:** Keep RECORD-00699 as canonical, delete RECORD-00340. The modern URL has nearly 2x raw_text and is HTTPS-clean. Move any curator-added metadata (`notes`, taxonomy assignments) from 00340 into 00699 before deletion. **Why this needs Joe:** record deletion changes IDs in the published archive; verify nothing links to RECORD-00340 specifically.

### RECORD-00740 + RECORD-00771 — "CNN's Impossible Dilemma"

| Record | URL | Status | Date | raw_text |
|---|---|---|---|---|
| 00740 | `https://www.wnycstudios.org/podcasts/otm/segments/cnns-impossible-dilemma-on-the-media` | **404 dead** | 2023-06-09 | 9,270 chars |
| 00771 | `https://www.wnycstudios.org/podcasts/otm/segments/cnn-impossible-dilemma-on-the-media` | 200 OK | 2016-01-01 (placeholder) | 9,202 chars |

The two URLs differ by one character (`cnns-` vs `cnn-`). 00771's URL works; 00740's doesn't. The 2016-01-01 date on 00771 is a placeholder ("we didn't know the exact date"); the 2023-06-09 date on 00740 is probably the real publish date but tied to a URL that no longer resolves.

**Recommendation:** Pick ONE of:
1. **Merge into 00740, fix its URL** to point at 00771's working URL, then delete 00771. Preserves the real 2023-06-09 date.
2. **Merge into 00771, copy 00740's date over**, then delete 00740.
3. **Keep both**, fix 00740's URL to the working one. Treats them as related coverage rather than duplicates.

**Why this needs Joe:** which record ID survives is a curator decision tied to any external references.

---

## URL-policy proposal

### Background

The archive uses two distinct PressThink domain forms:

- `archive.pressthink.org/<year>/<month>/<day>/<slug>.html` — original Movable Type, ~2003-2009
- `pressthink.org/<year>/<month>/<slug>/` — modern WordPress, post-migration

Many records use `archive.pressthink.org` even when the modern URL exists. Per CLAUDE.md the archive subdomain has a TLS issue and must use `http://` — not great for user-facing links.

### Audit finding

I probed the 4 `archive.pressthink.org` URLs in the duplicate set:
- All 4 still serve HTTP 200 — they work, just over `http://`.
- Search engines return the archive URL FIRST for most 2003-2008 posts (no modern equivalent for that content).
- The 2009 post (RECORD-00340 / "atomization") DOES have a modern pressthink.org equivalent (RECORD-00699).

So the migration from Movable Type to WordPress happened around 2009; older posts didn't get migrated.

### Proposed policy

1. **For posts from 2009 or later**: prefer `https://pressthink.org/<year>/<month>/<slug>/` whenever a modern URL resolves. Probe with `curl -sLI <url>` to confirm 200.
2. **For posts from 2003-2008**: `http://archive.pressthink.org/<year>/<month>/<day>/<slug>.html` remains the canonical source. No modern equivalent exists.
3. **When backfilling URLs**: try the modern form first; fall back to archive. Document fall-back in `notes`.
4. **Existing records with archive URLs**: leave them as-is unless a modern equivalent is found AND the data is being touched for another reason. Don't sweep just to migrate URLs; the audit cost outweighs the user-facing benefit for most records.

This proposal is suggested for `data/SCHEMA.md`; not adding it there in this PR pending Joe's review of the policy.
