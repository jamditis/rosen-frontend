# Preservation inventory for rosen-frontend

Read-only pass at branch `jawn/laughing-hamilton-w2zw2g`, HEAD `d4e0d678`. The working tree was clean before and after (`git status --porcelain` printed nothing). I computed counts from the CSVs with `node /tmp/claude-0/-home-user-rosen-frontend/ede49510-8ace-5bf5-ad30-fdbafbc01d20/scratchpad/count.cjs`, which uses the repo's own csv-parse. The CSV headers are at `data/archive_records-public.csv:1` and `data/social_posts.csv:1`.

**Bottom line:** the repo has strict contracts, offline validators, planners and verifiers, but almost no durable per-record capture copies. The 11 Salon items are the only real web captures with retained bytes, and they are not linked to records through any machine contract. There is no WACZ, no object store, no second copy, no Wayback inventory run and no sidecar index.

---

## 1. What exists and works

### 1a. Per-object preservation manifest (#701, closed)
- **Schema.** `preservation/preservation-manifest.schema.json` is JSON Schema 2020-12. The validator accepts schema versions 1.0.0 and 1.1.0 (`preservation/README.md:174`, `preservation/MIGRATING.md:23-34`).
- **Enums in the schema:**
  - Object types: `archive-record`, `social-post`, `entity`, `relationship`, `dataset`, `source-file`, `generated-artifact`, `feature-record` (`schema.json:185`).
  - Event types: `source-check`, `capture-attempt`, `wayback-reference`, `artifact-created`, `storage-copy-created`, `fixity-check`, `rights-decision`, `review-decision` (`schema.json:731`).
  - Semantic outcomes (`schema.json:394`).
  - Artifact types, which include `warc`, `wacz`, `screenshot`, `pdf` and `transcript` (`schema.json:948`).
  - Storage classes: `working`, `preservation`, `replica`, `public-deposit` (`schema.json:902`).
  - Fixity is only `match` or `mismatch` (`schema.json:603-629`).
  - Rights states (`schema.json:515-555`).
- **Validation rules.** The validator enforces append-only supersession and references that stay within one object (`preservation/README.md:211-232`, `:284-296`). `buildPreservationIndex()` is a derived projection you can throw away and rebuild (`preservation/validate-preservation-manifests.mjs:715`, `preservation/README.md:314-328`).
- **Examples.** Five example manifests: successful capture, existing Wayback reference, bot wall, oversize abort, rights hold (`preservation/examples/`, `preservation/README.md:36-37`).
- **Commands.**
  - `npm run validate:preservation` (`package.json:17`). Here it validated 5 manifests, 11 Winer records, 30,146 social rows (38 missing a URL; pin matched 29,868 rows, 278 rows are new since the pin) and 100 sample sources, in about 5 seconds.
  - `node --test` across the seven preservation test files: 152 passed, 0 failed.

### 1b. Importers that produce schema-v1 manifests (no network)
- **Winer evidence.** `import-winer-evidence.mjs --verify` covers 11 `feature-record` objects. Storage copies are empty, because the evidence names response digests, not locations (`preservation/README.md:346-354`).
- **Social baseline (#717, closed).** `import-social-baseline.mjs --verify` builds one `social-post` object, one `artifact-created` event and one generated `metadata` artifact per row.
  - The artifact URI is a content hash and `storageCopies` is empty (`preservation/README.md:364-369`).
  - The full manifest is about 123 MB and is not committed (`:429-434`). Only the per-row digest pin `preservation/social-baseline-checksums.json` is committed. It was generated 2026-08-27 and covers 29,868 rows (file header). Refresh it with `--write-checksums` (`:445-453`).
- **Preservation sample (#704/#857, closed).** `import-preservation-sample.mjs --verify` covers 100 sources: 52 social posts and 48 archive records (`data/preservation-sample.json`). The output has objects only, with no events or artifacts (`preservation/README.md:476-480`). Seven sources use the `missing-url` URN (`:482-488`).

### 1c. Whole-archive baseline bag (#702, open)
- **Commands.** `npm run baseline:create -- --output <dir>` and `npm run baseline:verify -- <bag> [--restore-root <checkout>]` (`package.json:18-19`, `preservation/BASELINE.md:105-171`, `:202-211`).
- **Contents.** A BagIt-compatible bag of an explicit list of files: the source CSVs, runtime JSON, entity and relationship data, and schemas (`BASELINE.md:12-28`, `:80-103`). HEAD is pinned instead of `43bb423`, with the reason recorded (`:37-78`). `/preservation/baseline/` is gitignored (`.gitignore:124-129`).
- **Not done.** No bag has been stored anywhere. The two storage locations are proposals only, and their retention rule contradicts itself (`BASELINE.md:173-200`).

### 1d. Offline CDX result parser (part of #714)
`preservation/cdx-result.mjs` parses recorded CDX JSON pages and only bytes it is given. It makes no network request (`preservation/README.md:54-113`). Coverage claims are conservative: `complete` only when the request fits a narrow shape (`:95-103`). Version 1.0.0 has no live fetch and no cursor ledger (`:112-113`). Tests: `tests/cdx-result.test.js`.

### 1e. Save Page Now planner (part of #715)
`preservation/save-page-now-planner.mjs` (`save-page-now-planner@0.1.0`, `:3`) exports `planSavePageNowSubmission()` (`:142`). It is a pure dry-run decision function that returns submit, skip or hold:
- skip: unsupported URL, or a verified acceptable capture already exists;
- hold: capture not verified, rights not cleared, inventory not complete, budget exhausted, or no object ID;
- submit: eligible (`:145-207`).

It never submits. It is not listed in `preservation/README.md:19-38`. Tests: `tests/save-page-now-planner.test.js`.

### 1f. Bounded Browsertrix adapter (part of #716)
- **Command.** `npm run capture:browsertrix -- --capture-id … --source-url … --output-dir … --network … --task-type static-article` (`package.json:20`, `preservation/README.md:136-145`). `--plan` prints the Docker command without running a crawl (`:147`).
- **Profile.** Pins `webrecorder/browsertrix-crawler:1.14.3` (`browsertrix-capture.mjs:19`): 1 CPU, 1.5 GB, one worker, 300 seconds, 256 MB (`README.md:147-154`).
- **Network gate.** Requires an operator-managed Docker network labeled `org.rosen-archive.public-egress=restricted` (`:131-134`).
- **Acceptance.** Failed output is quarantined (`:156-161`).
- **No captures yet.** The repo contains no WACZ outputs. Tests: `tests/browsertrix-capture.test.js`.

### 1g. Source-version journals (article intake)
- **PressThink journal.**
  - **Contents.** `preservation/pressthink/versions.jsonl` has 227 entries, all on host `pressthink.org`. Each holds the full WordPress `html` and `text`. 213 are `linked` to 213 distinct record IDs and 14 are `review`. All were captured 2026-11-02T19:55:34Z, and none has a `previous` hash yet.
  - **Integrity.** The append-only SHA-256 chain is checked on every run (`docs/operations/pressthink-ingestion.md:27-32`, `backend/scripts/pressthink_batch_update.py:203-226`, `:428-437`).
  - **Gaps.** It is excluded from public deploys, and its presence in Git does not establish a verified independent copy (`docs/HANDOFF.md:80`).
- **Publisher-feeds journal.** `preservation/publisher-feeds/versions.jsonl` has 22 metadata-only entries: 10 CJR search, 10 Common Dreams author, 2 CJR author. 8 are linked and 14 are in review. Article bodies are not captured (`docs/operations/pressthink-ingestion.md:130-135`, `backend/scripts/publisher_feed_batch_update.py:296-305`).

### 1h. Stewardship task ledger (#706, closed)
`stewardship/` holds the task-event stream, a SQLite index you can rebuild, and the proposal contract (`stewardship/README.md:1-46`, merged in PR #925, `69ef28a6`). It is offline tooling only; leases are still open in #707/#885 (issue #706 closing comment).

### 1i. Salon package
See section 6. `(cd preservation/salon && sha256sum -c SHA256SUMS)` passes all 88 entries here. `node preservation/salon/verify-recovery.mjs` failed in this environment only because Chromium is missing at `/usr/bin/chromium`. Set `CHROMIUM_PATH` to run it (`preservation/salon/verify.mjs:13`). `pdftotext`, `ffprobe` and `ffmpeg` are present.

---

## 2. Designed but not built (open issues)

| Issue | Design | Built today |
|---|---|---|
| #697 epic | 5 tiers: manifest and checksum, then Wayback reference, then Save Page Now, then WACZ/screenshot/text QA, then immutable deposit. Two copies required for high-fidelity captures. | Tier 1 contracts only (1a–1c) |
| #702 | Baseline bag, two outside copies with recorded retention | Tool done; no copy stored (`BASELINE.md:180-200`) |
| #705 | 100-source pilot with measured budgets and a go/revise/stop decision | Sample selected; no capture run (`README.md:476`) |
| #714 | Live CDX inventory as ledger tasks; replay sampling | Offline parser only |
| #715 | Save Page Now adapter: auth, polling, idempotency, budgets | Dry-run planner only |
| #716 | Browsertrix WACZ profile, offline replay acceptance | Adapter only; no fixtures run live; no WACZ in repo |
| #718 | Semantic QA classifier (bot, login, error, wrong content) | Vocabulary in the schema (`schema.json:394`); no classifier |
| #719 | Dedicated bucket separate from `pi-transfer`, with prefixes, locks and lifecycle | Nothing |
| #720 / #907 | Scheduled fixity and repair. #907: per-copy check and repair events, successor-history validation | Fixity is artifact-level `match`/`mismatch` only (`schema.json:603-629`); no `storageCopyId` on fixity |
| #721 | Immutable Internet Archive batch deposits after curator approval | Nothing (labeled `needs-curator-decision`) |
| #722 / #908 | Risk-prioritized rollout. #908: admission snapshot that partitions every source row | Nothing; the census exists (`data/stewardship-census.md`) |
| #726 | Sidecar record-to-capture index | Only the generic `buildPreservationIndex()` |
| #742 | Backups of ledgers, manifests and artifacts, with restore drills | Nothing preservation-specific |

Bluesky pipeline: R2 preservation packages, the office runner and SingleFile snapshots are all "Planned" (`docs/bluesky-stewardship-pipeline.md:3-11`, `:50-53`, `:118-122`). The daily Bluesky raw snapshots are temporary runner artifacts; attached media and full conversations are not preserved (`docs/HANDOFF.md:78`, `docs/research/2026-10-14-archive-health-and-bluesky-backfill.md:35`).

`DEPLOYMENT.md` mentions preservation only in two places. One is the LFS materialization rule (`DEPLOYMENT.md:125-129`). The other is an instruction to refresh "public archive preservation copies" after source-discovery recovery, with no procedure attached (`:376-377`).

---

## 3. How records map to captures today

- **Curated CSV Google Drive columns.** These are the only per-record pointers to copies in canonical data.
  - `gdrive_pdf_link`: 500 rows (RECORD only). All 500 hold the same single Drive folder URL (`…/folders/1rzZQXt-oVXRejKGqej1aGPsKhI2KhnEJ`), so they are not per-record file links. 416 are archive.pressthink.org records and 26 are pressthink.org.
  - `gdrive_raw_file_link`: 83 rows, all distinct per-file Drive links: all 82 CLIP rows plus RECORD-00024.
  - `gdrive_transcript_link`: 1 row (RECORD-00028).
  - `transcript_filepath`: 1 row (RECORD-00040), and it holds text, not a path.
  - Social CSV: no Drive links at all.
- **No Wayback column.** No record `url` points at web.archive.org. Wayback URLs appear only inside the text of 90 `raw_text` values, 11 `notes` values and 1 `excerpt` in curated rows, plus 4 social `related_to` values.
- **PressThink journal.** `record_id` links 213 records to their source-version entries (section 1g).
- **Salon.** `preservation/salon/sources.json` maps 4 of its 8 URLs to records RECORD-00713/00716/00718/00908. The 3 recovery sources map to none (`recovery/sources.json`). The CSV Drive fields were left empty on purpose (`preservation/salon/README.md:9`). No schema-v1 manifest exists; `capture-report.json` is a separate receipt (`:30`).
- **Schema-v1 manifests.** The social baseline (generated on demand, not committed), the 100-object sample (no events) and Winer (11) carry object IDs. None names a storage copy.
- **No sidecar index (#726).** Nothing in the frontend reads `preservation/`. `deploy_full_site.py` does not reference `preservation/`, and the journals are excluded from deploys (`docs/HANDOFF.md:80`).

---

## 4. Record classes with url and raw_text counts

Current CSVs: 1,220 curated rows and 30,146 social rows. The `CLAUDE.md` table (1,218 / 30,129) is stale. The census agrees with the current counts (`data/stewardship-census.md:9-14`, `:41-42`).

| Class (how identified) | Rows | url | raw_text | Copy pointer |
|---|---|---|---|---|
| RECORD-* curated (articles, interviews, PressThink and others) | 991 | 991 | 972 | 500 share one Drive folder; 1 per-file link |
| TUMBLR-* | 137 | 137 | 137 | none |
| CLIP-* newspaper clippings (newspapers.com) | 82 | 82 | 82 (median 225 characters; OCR snippets) | 82 per-file Drive links |
| THREAD-* curated Bluesky threads | 10 | 10 | 10 | none |
| PressThink (pressthink.org host) | 215 | 215 | 215 | 26 shared Drive folder; 213 linked in journal |
| PressThink (archive.pressthink.org host) | 420 | 420 | 417 | 416 shared Drive folder; not in journal |
| Audio/video (format audio/video or content_type Interview (Audio/Video)/Video) | 92 | 92 | 86 | 5 have any Drive link; no media bytes in repo except the Salon MP3 |
| — of which format `audio` / `video` | 53 / 29 | all | 52 / 24 | — |
| Newspaper Clipping content_type | 26 | 26 | 26 | 26 |
| Social: Twitter/X (TWTR) | 26,114 | 26,114 | 26,114 | baseline digest pin only |
| Social: Bluesky (BSKY) | 3,516 | 3,478 | 3,511 | baseline digest pin only |
| Social: Mastodon (MAST) | 516 | 516 | 516 | baseline digest pin only |
| Dissertation | 1 | none (not a CSV row) | n/a | Original PDF in Git LFS |

Totals: 19 curated rows and 5 social rows have no `raw_text`, and 38 social rows (all Bluesky) have no `url`.

The dissertation is not a CSV row. It is injected as `dissertation-1986` (`data/export-archive-data.js:34-36`, `:638-639`), and its PDF is in Git LFS at `dissertation/reader/THE_IMPOSSIBLE_PRESS_NYU_ROSEN-JAY-1986.pdf` (`.gitattributes:2`, `git lfs ls-files`).

**LFS rules.** In the root `.gitattributes`, only dissertation PDFs and the semantic ONNX/WASM files use LFS (`.gitattributes:1-4`). The Salon MP3 uses LFS through `preservation/salon/.gitattributes:6`. Captures and response bytes are marked `-text` to preserve fixity (`:2-5`).

---

## 5. Salon shutdown recovery (PRs #952 and #953)

Salon posted its farewell on 2026-11-05. Captures were made 2026-11-07 UTC (`preservation/salon/README.md:5`).

**Batch 1: 8 articles.**
- Each article has four files: SingleFile `.html`, a text-derivative `.pdf`, the untouched HTTP response as `.source.html`, and the body as `.txt` (`README.md:13-24`).
- Coverage: all 4 curated Salon records, all 4 Rosen-authored pieces on the author page, and a 2009 Salon Radio item from the scrape queue.
- Tooling: SingleFile CLI 2.25.0 with Playwright/Chromium, publisher scripts blocked, source commit `4a16b0c` (`README.md:32`, `captures/capture-report.json`).
- Verification: hashes recomputed, an offline browser load with zero external requests, and a `pdftotext` line match (`README.md:34-41`).

**Batch 2 (recovery).**
- 3 more interviews: 2008 Anthrax, 2009 WashPost/Froomkin, 2017 normalizing Trump. Legacy URLs returned 410; current paths returned 200 (`recovery/README.md:5-13`). Total is now 11 PDFs and 11 HTML copies.
- The Berkeleyside MP3 embedded in RECORD-00718 was recovered from the original Libsyn enclosure through a saved 2018 RadioPublic page: 52,903,373 bytes, SHA-256 `32f8b73f…b801`, checked with ffprobe and a full decode (`:15-21`).
- The MP3 is stored in Git LFS. A GitHub contents-API readback matched it, but a git-lfs batch fetch returned 503 (`:23-25`, `recovery/github-storage-readback.json`).
- Evidence retained: the 2012 Wayback author page, the topic inventory, and 28 probe receipts (`:27-31`, `:41`, `recovery/probes.json`).

**Unresolved.** The January and June 2009 Salon Radio MP3s and the May 2017 MP4 were blocked by a proxy 403, and exact CDX queries returned `[]` (`recovery/README.md:33-39`).

**Explicit non-claims.** No Drive deposit, no independent second copy, no public archive submission, no reuse license, and no exhaustive Salon history (`README.md:61-65`).

**How to verify.** Run `node preservation/salon/verify-recovery.mjs` with Chromium installed, then `(cd preservation/salon && sha256sum -c SHA256SUMS)`. The second check passed here; the first needs Chromium.
