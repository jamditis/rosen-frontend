# Salon offline preservation

Captured and verified on November 7, 2026 (UTC), after Salon's [November 5 farewell](https://www.salon.com/2026/11/05/goodbye-from-salon/).

All four Salon URLs in `data/archive_records-public.csv` have a retained PDF and self-contained SingleFile HTML here. The inventory also covers every article currently listed on [Salon’s Jay Rosen author page](https://www.salon.com/writer/jay_rosen), plus the related Salon Radio interview from the legacy scrape queue: eight distinct articles total, four authored by Rosen and four interviews or related coverage.

The four curated records had empty `gdrive_pdf_link` and `gdrive_raw_file_link` fields at source commit `4a16b0c`. Empty fields establish missing backup references, not proof that no unlinked copy exists elsewhere. These new copies are retained in this repository; the Drive-specific CSV fields remain unchanged because these are not Drive deposits. No site release or deployment is needed to retrieve this preservation package.

## Inventory

Each item has four files under [`captures/`](captures/): `.html` (SingleFile), `.pdf` (readable article-text derivative), `.source.html` (untouched HTTP response bytes), and `.txt` (the captured article body).

| Article | Byline | Curated record |
| --- | --- | --- |
| [Neil Postman: A civilized man in a century of barbarism](captures/2003-10-10-postman.html) | Jay Rosen | Author-page discovery; not yet a curated record |
| [Nullifying the press](captures/2006-04-20-mclellan_2.html) | Jay Rosen | Author-page discovery; not yet a curated record |
| [Why campaign coverage sucks](captures/2008-01-21-campaign_coverage.html) | Jay Rosen | Author-page discovery and legacy scrape queue; not yet a curated record |
| [Salon Radio: Jay Rosen on the media’s control of political debates](captures/2009-01-16-rosen.html) | Glenn Greenwald | Legacy scrape queue; not yet a curated record |
| [Don’t bust bogus “hype”](captures/2012-07-25-dont_bust_bogus_hype.html) | Jay Rosen | RECORD-00713 |
| [Media critic Jay Rosen on 2016 campaign coverage and the rise of Trump](captures/2016-11-06-media-critic-jay-rosen-on-2016-campaign-coverage-and-the-rise-of-trump-thats-the-way-authoritarian-societies-work.html) | Paul Rosenberg | RECORD-00716 |
| [What are journalists for in the age of Trump?](captures/2017-09-14-what-are-journalists-for-in-the-age-of-trump.html) | Tracey Taylor | RECORD-00718 |
| [Hey, political reporters — get lost! This is not your moment](captures/2020-11-11-hey-political-reporters-get-lost-this-is-not-your-moment.html) | Dan Froomkin | RECORD-00908 |

Download the repository branch or copy this directory, then open any article's `.html` or `.pdf` directly. The HTML contains its styles and retained images; no web server is needed. Outbound hyperlinks remain references and require a connection to visit their destinations. The `.source.html` files are evidence originals, not the self-contained reading copies.

## Verification and provenance

[`sources.json`](sources.json) maps URLs to record IDs and discovery sources. [`discovery-evidence.json`](discovery-evidence.json) records the author index and farewell response URLs, UTC retrieval times, HTTP statuses, byte sizes, and SHA-256 hashes; the corresponding response originals are retained beside it. [`captures/capture-report.json`](captures/capture-report.json) records each article's original and final URL, HTTP status, source commit, byline, publication time, capture time, normalized body digest, and artifact hashes and byte sizes. This is a capture receipt, separate from the repository's schema-v1 preservation-event manifests.

The capture uses SingleFile CLI 2.25.0's core with Playwright and Chromium. Publisher scripts are blocked before capture so that quoted tweets stay readable static text instead of becoming online-only embeds. Styles and images are allowed. The SingleFile output removes scripts and blocks audio/video. Original HTTP response bytes are retained separately.

For all eight captures, verification:

- Recomputed every recorded artifact's byte size and SHA-256 digest.
- Matched all four curated Salon records and all four entries in the saved publisher author listing against the capture inventory.
- Loaded the retained SingleFile HTML into a browser with networking disabled, matched its complete normalized article body to the captured source body, and observed zero external HTTP requests.
- Extracted each PDF's text with `pdftotext` and matched every nonblank source-body line, ignoring Unicode compatibility and whitespace differences introduced by PDF layout. Punctuation and word characters remain significant.

The PDFs are labeled article-text derivatives with the source URL and retrieval timestamp. They preserve body wording, including headings and quoted tweet text, but flatten rich-text formatting; the HTML retains the page layout. One representative PDF first page was also rendered and visually checked for readable typography and pagination.

Run the independent offline checks from the repository root (Node dependencies, Chromium, and Poppler's `pdftotext` must be installed):

```sh
node preservation/salon/verify.mjs
(cd preservation/salon && sha256sum -c SHA256SUMS)
```

To take a new capture without overwriting this package:

```sh
npm install --prefix /tmp/salon-tools single-file-cli@2.25.0 --no-audit --no-fund
SINGLE_FILE_ROOT=/tmp/salon-tools/node_modules/single-file-cli \
  node preservation/salon/capture.mjs /tmp/salon-new-capture
node preservation/salon/verify.mjs /tmp/salon-new-capture
```

`capture.mjs` requires an empty output directory and returns nonzero for any failed article. It honors `HTTPS_PROXY`; set `CHROMIUM_PATH` if Chromium is installed elsewhere. `verify.mjs` makes no network requests and checks retained files independently of the capture process.

## Coverage limits

This package verifies the eight identified article bodies, including all currently listed Rosen-authored Salon pieces. The publisher author page, curated CSV, and legacy scrape queue are bounded inventories; they do not prove that every historical Salon contribution has survived or is indexed. An exhaustive historical Salon/Wayback discovery pass remains outstanding. The four newly discovered items are preserved here without assigning new canonical record IDs or inventing curator summaries.

Embedded audio/video files are not downloaded. In particular, the 2009 Salon Radio interview and 2017 interview page may have media that requires separate recovery; this package preserves the article text available on the retrieved pages. External link destinations and related articles are not recursively archived. No Drive deposit, independent second storage copy, public archive submission, or reuse license is claimed.
