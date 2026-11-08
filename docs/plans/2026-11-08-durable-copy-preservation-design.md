---
title: Durable-copy preservation design
date: 2026-11-08
status: draft for curator review; D-J1, D-J2, D-J4 path, and D-J8 decided 2026-11-08
issue_parent: "#697"
---

# Durable-copy preservation design

Operator steps: [durable-copy runbook](../operations/durable-copy-runbook.md). Existing work: [preservation inventory](../research/2026-11-08-preservation-inventory.md).

Checked against `main` at `85e5d037`. The inventory pass ran at `d4e0d678`. Both trees have the same preservation files.

## 1. Problem

Salon posted its farewell on 2026-11-05 (`preservation/salon/README.md:5`). The archive had no copy of the four curated Salon records until we captured them by hand (`preservation/salon/README.md:9`). Most other records are in the same position. The only per-record copy pointers in the canonical data are Google Drive columns, and the 500 `gdrive_pdf_link` values all point at one shared folder (inventory section 3; header at `data/archive_records-public.csv:1`).

Joe wants a durable, lasting copy of every record. Text records get a PDF. Audio and video records get a format that suits media. The copies are for preservation and historical accuracy, not for public sharing. Many belong to other publishers (`data/README.md:62`).

## 2. Goals

1. Every published record has at least one durable copy that a person can open in 2050 without the source site.
2. Text records have an archival, accessible PDF: PDF/A-2u and PDF/UA-1 in one file.
3. Audio and video records keep the original media file as delivered, plus a checksum, a transcript, and a metadata sidecar.
4. Every copy states where it came from: record ID, source URL, capture time, tool and version, source hash, and rights.
5. There are two copies of each durable file, and each is checked on a schedule.
6. Third-party copies are never published: not on PressThink, not on GitHub Pages, not in a public repo.
7. Everything is recorded in the existing schema-v1 preservation manifests (`preservation/README.md:163-296`).

## 3. Non-goals

- Public access or redistribution. Public deposit stays in #721 and needs a curator decision.
- A new web-capture system. WACZ capture is #716 (`preservation/README.md:120-161`). CDX inventory is #714 (`preservation/README.md:54-113`). Save Page Now is #715 (`preservation/save-page-now-planner.mjs:142-207`).
- A new fixity model. Per-copy fixity and repair stay in #720 and #907. Today fixity is artifact-level only (`preservation/preservation-manifest.schema.json:603-629`).
- A new storage bucket. #719 owns the cloud bucket. This design adds Legion as a storage location; it does not replace #719.
- Rights clearance. The schema records rights; it does not decide them (`preservation/README.md:298-308`). Policy stays in #700.
- Rewriting the Salon package. It is the first ingest into this layout, not a redo (section 9).

## 4. Key finding: the repo is public

The repository is public. `gh api repos/jamditis/rosen-frontend` returned `"private": false` on 2026-11-08. GitHub Pages publishes the repository root from `main` (`DEPLOYMENT.md:313-316`). The FTP deploy uses an allowlist that skips `preservation/` (`backend/scripts/deploy_full_site.py:98-111`). Pages has no such allowlist.

Two consequences follow:

- Any file committed to this repo can be read by anyone on github.com. It is probably served on `jamditis.github.io` too. Nobody has checked that host yet.
- The Salon package already sits in this public repo, as 89 tracked files under `preservation/salon/` (`git ls-files`). That includes third-party PDFs, HTML copies and the Berkeleyside MP3 (`preservation/salon/README.md:13`, `preservation/salon/recovery/README.md:17`). `docs/HANDOFF.md:80` says the journals are "excluded from public website deployments". That is true for FTP. It is not true for the repository or for Pages.

So "in the repo where size and rights allow" cannot mean this repo for third-party bytes. Section 7 sets the rule.

## 5. Decisions

### D1. PDF profile: PDF/A-2u plus PDF/UA-1 in one file

- **Choice.** Each text PDF declares and passes both PDF/A-2u (ISO 19005-2, level u) and PDF/UA-1 (ISO 14289-1).
- **Why A-2 and not A-3.** PDF/A-3 allows arbitrary embedded files. We keep source HTML, WACZ and JSON as separate files with their own SHA-256. Separate files are easier to fixity-check, dedupe and read with ordinary tools. Embedding them would turn one PDF into a bundle that is hard to inspect. PDF/A-2 also allows embedded PDF/A files, which is enough.
- **Why level u and not a.** Level u guarantees Unicode text mapping, which makes search and extraction reliable. PDF/UA-1 adds the structure requirements. PDF/UA-1 plus A-2u covers what A-2a would add, and veraPDF checks both.
- **Both at once.** Both standards build on ISO 32000-1 (PDF 1.7), so one file can meet both. The XMP declares `pdfaid:part=2`, `pdfaid:conformance=U` and `pdfuaid:part=1`.
- **Fixed rules:**
  - Embed every font, subset allowed.
  - Use a pinned open font set (Noto Serif and Noto Sans, with Noto fallbacks for non-Latin text). Hash the fonts and record the hashes.
  - No encryption. No JavaScript. No external links that the PDF must resolve.
  - Hyperlinks stay as link annotations with alt text.
  - Include an sRGB OutputIntent.
  - Set the document `/Lang` (from the record, default `en-US`).
  - Set `dc:title` to the record title, and set `DisplayDocTitle` to true.
  - Build bookmarks from headings. The cover page is the first bookmark.
  - Tag the page structure: headings, paragraphs, lists, block quotes, figures with alt text, and the cover page as its own section.

### D2. Render from stored captures, not from the live page

There are three possible sources:

| Source | Use | Reason |
|---|---|---|
| Live page | Never as the PDF source | It can change between capture and render, and nothing would bind the bytes to a hash. |
| Stored capture: `.source.html`, SingleFile HTML, or a WACZ replay | Default | It is the evidence original, with a SHA-256. Re-rendering later gives the same input. |
| `raw_text` from the CSV | Fallback only, with a label | Curators edited it, and some rows are OCR snippets. CLIP rows have a median of 225 characters (inventory section 4). |

**Pipeline:**

1. Capture. Use the WACZ from #716 where it works, or SingleFile plus the untouched response bytes, as Salon did (`preservation/salon/README.md:13`, `:32`).
2. Extract the main body from the stored capture. Record the extractor and its version.
3. Pour the body into a controlled archival HTML template: the cover page plus the body.
4. Render to PDF with a tool that writes tags and PDF/A natively. WeasyPrint with `pdf_variant=pdf/a-2u` and tagging enabled is the first candidate. Chromium print-to-PDF with `tagged` and `outline` on, finished with pikepdf for the XMP and OutputIntent, is the second. The pilot picks one by veraPDF pass rate (section 10).

The Salon renderer printed a plain template with Chromium. It set no tagging, no PDF/A metadata and no outline (`preservation/salon/capture.mjs:78-86`). Its text check is a good model, and we keep it (`preservation/salon/capture.mjs:87-92`).

Appearance is preserved by the WACZ or the SingleFile HTML, not by the PDF. We do not force a visual PDF. A full-page PNG screenshot from the WACZ replay is optional. It is a `screenshot` artifact (`preservation/preservation-manifest.schema.json:948-958`).

If no capture is possible (dead site, no Wayback), render from `raw_text`. The cover page then says "Derived from the archive's stored text. No source capture exists." The manifest records a capture-attempt event with the failure.

### D3. Provenance: cover page and XMP

**Cover page.** This is page 1, tagged. It shows:

- Archive name, and "Preservation copy. Not for redistribution."
- Record ID and object ID (`urn:rosen:object:archive-record:<id>`, pattern at `preservation/preservation-manifest.schema.json:156-159`).
- Title, authors, publisher, original publication date.
- Source URL as requested, and the final URL after redirects.
- Capture time in UTC, capture tool and version, render tool and version, profile ID `rosen-durable-pdf/1`.
- SHA-256 of the source bytes the PDF was made from, and that artifact's ID.
- Source type: response HTML, WACZ, or `raw_text` fallback.
- Rights statement: copyright holder, rights status, and access decision from the rights event (`preservation/preservation-manifest.schema.json:511-555`).
- What the copy leaves out: embedded media, comments, ads, and live embeds.

**XMP.** The same facts go into XMP, so tools can read them without parsing pages:

- Standard fields:
  - `dc:title`, `dc:creator`, `dc:date`, `dc:source` (the source URL), `dc:rights`, `dc:language`.
  - `xmpRights:Marked=True`, and `xmpRights:UsageTerms` set to "Preservation copy. Not for redistribution."
  - `xmp:CreateDate`, `pdf:Producer`.
- A custom `rap:` namespace for the rest:
  - `rap:recordId`, `rap:objectId`, `rap:artifactId`
  - `rap:sourceUrl`, `rap:finalUrl`
  - `rap:captureTime`, `rap:captureTool`, `rap:captureToolVersion`
  - `rap:renderTool`, `rap:renderToolVersion`
  - `rap:sourceSha256`, `rap:sourceArtifactId`, `rap:sourceKind`
  - `rap:rightsStatus`, `rap:accessDecision`
  - `rap:manifestId`, `rap:profile`
- The namespace URI is `https://pressthink.org/j/rosen-archive/ns/preservation/1.0/`. PDF/A requires a `pdfaExtension` schema block for custom properties. The renderer writes it.

### D4. Validation

A PDF is accepted only when all of these pass:

1. veraPDF, flavour `2u`, with zero failed rules.
2. veraPDF, flavour `ua1`, with zero failed machine checks.
3. `pdffonts` reports every font embedded. `pdfinfo` reports `Tagged: yes` and the expected title.
4. The body text check: `pdftotext` output, normalized for whitespace and Unicode compatibility, contains every nonblank line of the extracted body. This is the Salon rule (`preservation/salon/README.md:39`, `preservation/salon/capture.mjs:87-91`). A failure blocks acceptance.
5. A comparison against `raw_text`, as a similarity ratio. This is report-only, because `raw_text` is edited. A ratio below 0.85 sends the record to review. It does not reject the PDF.
6. The XMP fields match the manifest.

A human checks a sample with PAC on Windows, using the Matterhorn human checkpoints: reading order, alt text, and headings. The sample is 5 per batch, and 100% of the pilot.

Failed PDFs go to `quarantine/`, following the Browsertrix rule (`preservation/README.md:156-161`).

### D5. Audio and video

- **Keep the original file as delivered.** Do not transcode. An MP3 stays an MP3.
- **Streams.** When the only source is a segmented stream (HLS or DASH), remux it losslessly into Matroska (`.mkv`) with `ffmpeg -c copy`. Record that it was remuxed.
- **For each media item, store:**
  - `<id>.media.<ext>`, the original bytes;
  - `<id>.ffprobe.json`;
  - `<id>.info.json`, the yt-dlp or publisher metadata;
  - `<id>.transcript.vtt` or `.txt`, with its provenance (human, publisher, or auto-captions; the CSV already notes "YouTube Auto-Captions" in `permissions` for some rows);
  - a thumbnail, when there is one;
  - a PDF of the host page or transcript, made by the text pipeline.
- **Acceptance.** Same as the Berkeleyside MP3:
  - the SHA-256 is recorded;
  - `ffprobe` reads the file;
  - a full `ffmpeg` decode finishes with no errors;
  - the duration is within 2 seconds of the stated length (`preservation/salon/recovery/README.md:21`).
- **yt-dlp policy.** Pin the version. Never use cookies, logins or account tokens. Never get around DRM. Pass `--no-playlist`, rate-limit the requests, and keep a download-archive ledger.
- **Do not download when:**
  - the media needs a login or a paywall;
  - the media has DRM;
  - the platform blocks the request (403);
  - the rights event says `hold`;
  - the file is above the size cap without approval;
  - the media is a live stream;
  - the media is not the work the record describes.

  In those cases, keep the transcript and metadata. Record a capture attempt with the reason. This matches the Salon handling of the 2009 audio (`preservation/salon/recovery/README.md:33-39`).

### D6. Social posts

There are 30,146 social rows (inventory section 4). The baseline already records a digest per row (`preservation/README.md:356-369`, `preservation/social-baseline-checksums.json`).

- **Threads.** One PDF per thread, for the 10 curated `THREAD-*` records and the 9 generated thread containers. Each post in a thread gets a bookmark and an anchor.
- **Standalone posts.** One PDF per post that is not in a thread.
- **No duplicates.** A post inside a thread appears only in that thread's PDF.
- **Render source.** Render from the stored post JSON offline: the CSV row as JSON, plus the platform API record where one is retained. This needs no network and scales to 30k posts.
- **Screenshots and media.** A screenshot is a separate artifact. Take one only for posts with images, link cards or quote posts, through the Browsertrix `page-spa` profile (`preservation/README.md:125-126`). Store attached media (for example Bluesky blobs) as original files under D5.
- **Twitter/X.** Do not attempt live captures for the 26,114 posts. Use the stored text. Where #714 finds a Wayback capture, store a screenshot from it.

### D7. Storage layout and naming

Use one layout for Legion, the second copy, and any private repo:

```
<ROOT>/rosen-archive-preservation/
  LAYOUT.md                    # this layout, layout version 1
  objects/
    records/RECORD-00718/
      20261107T000000Z/        # capture ID: UTC capture time
        RECORD-00718.20261107T000000Z.pdf
        RECORD-00718.20261107T000000Z.source.html
        RECORD-00718.20261107T000000Z.singlefile.html
        RECORD-00718.20261107T000000Z.wacz
        RECORD-00718.20261107T000000Z.txt
        RECORD-00718.20261107T000000Z.media.mp3
        RECORD-00718.20261107T000000Z.ffprobe.json
        RECORD-00718.20261107T000000Z.sidecar.json
        SHA256SUMS
    clips/CLIP-*/...
    tumblr/TUMBLR-*/...
    threads/THREAD-*/...
    social/BSKY/0019/BSKY-01912/...   # 4-digit bucket from the ID, at most 100 per folder
    social/TWTR/...
    social/MAST/...
    unlinked/<slug>/...        # finds that have no record yet, such as the 4 Salon author-page items
  manifests/                   # schema-v1 manifests (copies of the repo ones)
  bags/                        # #702 baseline bags
  quarantine/
  logs/fixity/  logs/sync/
```

- Record IDs are the folder names, and they never change.
- A new capture gets a new capture-ID folder. Nothing is overwritten.
- `sidecar.json` holds the record row at capture time, the capture receipt, and the rights decision.
- Paths stay ASCII and under 200 characters, so they work on Windows (Legion) and Linux.

### D8. What goes where

| Content | Public repo (this one) | Private Git LFS repo (if Joe approves, D-J2) | Legion | Second copy |
|---|---|---|---|---|
| Manifests, checksums, sidecar index (#726) | Yes, metadata only | Yes | Yes | Yes |
| PDFs and HTML of Rosen-owned works (`copyright` = Jay Rosen, PressThink) | No by default (D-J3) | Yes | Yes | Yes |
| Third-party PDFs, HTML, WACZ | Never | Only if Joe approves | Yes | Yes |
| Media files | Never | No (size) | Yes | Yes |
| Files over 50 MB | Never in plain Git | LFS only, under the plan limit | Yes | Yes |

- **Git limits.** GitHub warns at 50 MB per file and rejects files over 100 MB. LFS has its own per-file cap and storage quota by plan, so check the current figures for Joe's plan before committing.
- **The PressThink journal.** It already holds full Rosen HTML in the public repo (`preservation/pressthink/versions.jsonl`, `docs/operations/pressthink-ingestion.md:27-32`). It stays there. Rosen owns it, and it is a source journal, not a durable-copy store.

**Size estimate.** Measure this in the pilot.

| Item | Count | Estimate |
|---|---|---|
| Text PDFs | about 1,230 | about 0.4 GB |
| WACZ files | about 1,220 | 10 to 30 GB (capped at 256 MB each, `preservation/README.md:150-152`) |
| Social PDFs | about 30k | 1 to 2 GB |
| Media (92 audio/video records) | 92 | 50 to 150 GB |

The total is well under 1 TB, a small fraction of the 24 TB drive.

### D9. Where work runs, sync, and fixity

- **Where.** Capture and render run on Legion, or on a machine that writes straight to it. The bytes then never pass through CI or a public host.
- **What goes to the public repo.** Only manifests and checksums, through pull requests.
- **Primary copy.** Legion `<ROOT>` (storage class `preservation`).
- **Second copy.** Storage class `replica`. The location is decision D-J4. It must sit on a different physical device, and ideally in a different building. One drive is one copy. Section 3 of #697 asks for two copies of high-fidelity captures.
- **Sync.** Use rclone because it runs on Windows and Linux:
  - copy with `rclone copy --immutable --checksum`, which refuses to change an existing file;
  - verify with `rclone check --checksum` (`--download` where the remote has no SHA-256).
  - rsync with `--checksum` works where both ends are POSIX.
- **Fixity schedule:**
  - on write, `sha256sum -c` of the new capture folder on both copies;
  - monthly, a full SHA-256 pass of both copies against `SHA256SUMS`;
  - quarterly, a cross-copy compare plus a restore drill of 10 random captures (#742).
- **Recording fixity.** Write results as `fixity-check` events. Until #907 adds `storageCopyId` to fixity, also write a per-copy log under `logs/fixity/` that names the copy.
- **Storage-copy URIs.** Use `file://legion/rosen-archive-preservation/objects/...` and `file://replica/...`. The artifact URI is `urn:sha256:<hex>`. Both fit the `artifactUri` pattern (`preservation/preservation-manifest.schema.json:148-151`). A content-addressed URI must match the digest (`preservation/README.md:291-294`).
- **Copy records.** Each copy needs one current `storage-copy-created` event (`preservation/README.md:284-290`), with `access: private` (`preservation/preservation-manifest.schema.json:908-915`).

### D10. Access control

1. Stop adding third-party bytes to this public repo (D8).
2. Add `/preservation/durable/` and `*.durable.*` to `.gitignore`, next to the baseline safety net (`.gitignore:124-129`).
3. Add `tests/durable-copy-guard.test.js`. It fails when:
   - any tracked file is under `preservation/durable/`;
   - any tracked `.pdf`, `.wacz`, `.warc`, `.mp3`, `.mp4`, `.m4a`, `.mkv`, `.webm` or `.wav` sits outside a short allowlist: `dissertation/**/*.pdf`, `archived/dissertation-tools/source/*.pdf` and the current `preservation/salon/**` files, pinned by path and SHA-256 so it cannot grow quietly;
   - `_DEPLOY_DIRS`, `_DEPLOY_FILES` or `_DEPLOY_DATA_FILES` in `backend/scripts/deploy_full_site.py:81-111`, `:147-188` names anything under `preservation/`;
   - `DEPLOYMENT.md` "What NOT to deploy" (`DEPLOYMENT.md:253-269`) does not list `preservation/`.
4. Add a fail-closed check in `collect_local_files` (`backend/scripts/deploy_full_site.py:299-410`): abort if any collected path starts with `preservation/`.
5. Add `preservation/` to `DEPLOYMENT.md:255-269`. State there that GitHub Pages serves the repo root, so exclusion from FTP does not keep a file private.
6. The Salon package is decision D-J1.

## 6. Data model changes

Extend schema v1. Do not add a parallel format. The changes are additive, so they ship as schema 1.2.0 under the migration rules (`preservation/MIGRATING.md:23-34`):

- An artifact type `media`, for original audio and video. Today the list has no media type (`preservation/preservation-manifest.schema.json:948-958`).
- `derivedFrom`, an array of artifact IDs on an artifact. A PDF names the source HTML or WACZ it came from. There is no such field today (search of the schema).
- `profile`, a string on an artifact, for example `rosen-durable-pdf/1`.
- `software`, a list of `{name, version}` on capture-attempt and artifact-created events.

The per-copy fixity work stays in #907.

The sidecar record-to-copy index is #726. It is built with `buildPreservationIndex()` (`preservation/validate-preservation-manifests.mjs:715`) and holds one row per record: record ID, latest durable PDF artifact, media artifact, copies, last fixity result. It is committed as metadata only.

## 7. Rights

- Every durable copy gets a `rights-decision` event.
- The default for third-party works is `rightsStatus: unknown`, `accessDecision: private` and `publicDepositEligibility: undetermined`. The schema allows this explicitly (`preservation/README.md:300-305`).
- Rosen-owned works can be marked `cleared`, but their access stays `private` until Joe decides otherwise.
- The cover page and XMP repeat the decision. The "not for redistribution" notice is a statement, not DRM. PDF/A forbids encryption.

## 8. Rollout

The user asked for stacked PRs. Each step below is one PR on top of the last, so CI does not re-run after each merge.

| PR | Contents | Depends on |
|---|---|---|
| 1 | Guard test, `.gitignore`, `DEPLOYMENT.md` and deploy fail-closed check (D10). Failing test first, per `CLAUDE.md` | none |
| 2 | Schema 1.2.0 additions, migration note, validator tests | 1 |
| 3 | `preservation/durable/render-pdf.mjs`: template, cover page, XMP, font pins | 2 |
| 4 | `preservation/durable/validate-pdf.mjs`: veraPDF, pdffonts, pdfinfo, text checks | 3 |
| 5 | `preservation/durable/media.mjs`: yt-dlp and ffprobe wrapper, policy checks | 2 |
| 6 | Layout writer, `SHA256SUMS`, rclone sync and verify scripts | 3 |
| 7 | Pilot manifests (metadata only) and the pilot report | 4, 5, 6 |

**Phases:**

0. **Decisions and tools (now).** Joe answers section 9. Pin and install veraPDF, WeasyPrint or Playwright, pikepdf, yt-dlp, ffmpeg and rclone on Legion. Measure the host mix of the 92 audio/video records.
1. **Pilot: 20 sources drawn from the #705 sample (`data/preservation-sample.json`).**
   - The mix: 5 PressThink, 5 third-party articles, 3 CLIP, 3 audio/video (including ingesting the Salon MP3), 2 threads, 2 standalone posts.
   - **Go** means all of the following:
     - 100% of PDFs pass veraPDF 2u and ua1;
     - 100% pass the body text check;
     - the PAC human review passes on all 20;
     - both copies exist and verify;
     - time and size per record are measured.
   - **Revise or stop** per #705.
2. **Salon and at-risk publishers.** Ingest the 11 Salon items into the layout and render new profile PDFs beside the old ones; never replace the old ones. Then go by risk order from #722/#908, with defunct or closing publishers first.
3. **All curated records** (1,220), in batches of 100, each with a fixity pass on both copies.
4. **Audio and video** (92), under D5.
5. **Social**: threads first, then standalone posts.
6. **Steady state.** Each new record from `submit-record.yml` creates a durable-copy task in the stewardship ledger (`stewardship/README.md:1-46`). Monthly fixity runs.

## 9. Decisions for Joe

### Decided on 2026-11-08

| Id | Question | Decision |
|---|---|---|
| D-J1 | The 89 Salon recovery files in the public repo and on GitHub Pages | Keep them public. No removal and no history rewrite. |
| D-J2 | Where third-party PDFs, HTML and WACZ may live | Keep them on GitHub (this repo) for now. Joe's main coding agent will move them to Legion. |
| D-J4 | The Legion path | `<ROOT>` in D7 and D9 is `D:/backups` on the Seagate 24 TB drive, so the tree is `D:/backups/rosen-archive-preservation/`. Storage-copy URIs stay `file://legion/rosen-archive-preservation/...`. The second copy is still open. |
| D-J8 | Social scope | PDFs for curated `THREAD-*` records, the 9 generated threads, and a risk-ranked subset. Other posts keep JSON and screenshots. |

Effect on D8 and D10, until the move to Legion is done:

- Third-party bytes may stay in this public repo. D8 "Never" for the public repo and D10 step 1 apply only after the move.
- D10 steps 2 to 5 still apply now. They block new durable copies from the deploy manifest and keep `preservation/` out of the FTPS upload. They do not remove the Salon files.
- The D10 guard test pins the current Salon files by path and SHA-256, so the set cannot grow by accident before the move.

### Still open

- D-J3: Should Rosen-owned works get durable PDFs in a repo at all? If yes, which repo?
- D-J4 (second part): Where is the second copy? One drive counts as one copy.
- D-J5: The GitHub storage budget for LFS, and the per-file cap.
- D-J6: The default rights statement on cover pages, and whether Rosen-owned works may be marked `rightsStatus=cleared` while access stays private.
- D-J7: The media cap per file (proposed 4 GB), the media budget, and whether to download platform video (YouTube, PBS, MSNBC) or keep only transcripts and metadata.
- D-J9: The renderer. The pilot picks WeasyPrint or Chromium tagged print plus pikepdf by veraPDF pass rate.
- D-J10: Where capture and render run (on Legion or on a machine that writes to it), and whether Legion can stay on for the monthly fixity pass.
- D-J11: Page size, A4 (matches the Salon PDFs) or US Letter.
- D-J12: Approve the 20-source pilot from `data/preservation-sample.json` and its go criteria: 100% veraPDF 2u and ua1 passes, 100% body-text match, a PAC review of all 20, and both copies verified.

## 10. Risks

- **Renderer quality.** veraPDF UA checks catch only the machine-checkable rules. Reading order still needs a human. The PAC sample covers that.
- **A single drive.** Until the second copy exists, Legion is one point of failure.
- **Legion is a working laptop or desktop.** Sync must not depend on it being on at a set hour. Run the jobs when it is online and log any gaps.
- **Blocked platforms.** Some platforms block downloads. D5 records the attempt and keeps the transcript.
- **Rights.** Private hosting of third-party bytes on GitHub is still hosting. D-J2 decides it.
