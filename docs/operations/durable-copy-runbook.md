---
title: Durable-copy runbook
applies_to: docs/plans/2026-11-08-durable-copy-preservation-design.md
profile: rosen-durable-pdf/1
---

# Durable-copy runbook

This runbook covers the operator steps for making, checking and storing durable copies. The design and its reasons are in `docs/plans/2026-11-08-durable-copy-preservation-design.md`. The commands under `preservation/durable/` are planned in design section 8 and do not exist yet. Until they ship, run the underlying tools by hand as shown here.

## 0. Before you start

- Work on Legion, or on a machine that writes straight to it.
- Never commit third-party bytes to `jamditis/rosen-frontend`. The repo is public, and GitHub Pages serves its root (`DEPLOYMENT.md:313-316`).
- Set `ROOT` to `D:/backups`, the folder on Legion's Seagate 24 TB drive (design decision D-J4, decided 2026-11-08). Every path below starts at `$ROOT/rosen-archive-preservation/`.
- Record the version of every tool in each capture receipt.

| Tool | Use | Check |
|---|---|---|
| veraPDF (Java) | PDF/A-2u and PDF/UA-1 checks | `verapdf --version` |
| WeasyPrint or Playwright Chromium | Render | `weasyprint --version` / `npx playwright --version` (repo pins `^1.58.2`, `package.json:48`) |
| pikepdf | XMP and OutputIntent finishing (Chromium path) | `python -c "import pikepdf; print(pikepdf.__version__)"` |
| Poppler | `pdftotext`, `pdffonts`, `pdfinfo` | `pdfinfo -v` |
| yt-dlp | Media download | `yt-dlp --version` |
| ffmpeg, ffprobe | Media checks | `ffprobe -version` |
| rclone | Sync and verify | `rclone version` |
| PAC (Windows) | Manual PDF/UA review | — |
| Browsertrix adapter | WACZ capture (#716) | `npm run capture:browsertrix -- --plan ...` (`preservation/README.md:136-147`) |

## 1. Capture the source

1. Check the manifest first. If a verified capture already exists, skip this step. The Save Page Now planner applies the same rule (`preservation/save-page-now-planner.mjs:145-207`).
2. Check rights. If the record has no rights event, write one with `rightsStatus: unknown`, `accessDecision: private` and `publicDepositEligibility: undetermined` (`preservation/README.md:300-305`).
3. Capture the page.
   - Static article: run the Browsertrix adapter with `--task-type static-article`. Its network gate needs a Docker network with the label `org.rosen-archive.public-egress=restricted` (`preservation/README.md:131-134`).
   - If Browsertrix fails or cannot run, use the SingleFile method from Salon (`preservation/salon/README.md:32`, `:46-52`). Keep the untouched response as `.source.html`.
4. Put failed outputs in `quarantine/`. Never use them as a render source (`preservation/README.md:156-161`).
5. Compute the SHA-256 of each source file. It goes in the cover page and in the XMP.

## 2. Render the PDF

**Input.** The stored capture, never the live page. Use `raw_text` only when no capture exists. Then the cover page must say "Derived from the archive's stored text. No source capture exists."

### 2a. Required PDF settings

| Setting | Value |
|---|---|
| Conformance | PDF/A-2u and PDF/UA-1, both declared in the XMP (`pdfaid:part=2`, `pdfaid:conformance=U`, `pdfuaid:part=1`) |
| PDF version | 1.7 |
| Page | A4 or US Letter, 18 mm margins (same as Salon, `preservation/salon/capture.mjs:85`) |
| Fonts | Pinned Noto Serif body and Noto Sans cover; fallbacks embedded; all fonts embedded (subsets allowed) |
| Text layer | Real text with Unicode mapping. No images of text. No OCR layer, unless the source is a scan (CLIP) |
| Tags | Structure tree on. H1 is the title; H2 and H3 follow the source headings. P, L/LI, BlockQuote, Figure with `/Alt`, Link with alt text |
| Reading order | Cover, then title, byline, body, notes |
| Language | `/Lang` from the record; default `en-US`. Mark quotes in other languages where known |
| Title | `dc:title` set to the record title, `DisplayDocTitle` true |
| Bookmarks | One for the cover, one for each heading. For threads, one for each post |
| Color | sRGB OutputIntent |
| Forbidden | Encryption, JavaScript, embedded files, audio/video annotations, transparency groups that veraPDF rejects |
| Images | Keep source images that belong to the article. Lossless or JPEG quality 85 or higher. 150 to 300 ppi at print size. Each image needs alt text: use the source alt text, or "Image from source page; no description supplied" |
| Links | Keep them as link annotations. Show the URL text too, so the print copy keeps the address |

### 2b. Required contents: cover page (page 1)

The cover page carries all of these. The XMP repeats each one.

| Cover line | XMP property |
|---|---|
| "Jay Rosen's Internet Archive. Preservation copy. Not for redistribution." | `xmpRights:UsageTerms`, `xmpRights:Marked=True` |
| Record ID and object ID | `rap:recordId`, `rap:objectId` |
| Title | `dc:title` |
| Authors | `dc:creator` |
| Publisher and original publication date | `dc:publisher`, `dc:date` |
| Source URL and final URL | `dc:source`, `rap:sourceUrl`, `rap:finalUrl` |
| Capture time (UTC) | `rap:captureTime` |
| Capture tool and version | `rap:captureTool`, `rap:captureToolVersion` |
| Render tool and version, profile `rosen-durable-pdf/1` | `rap:renderTool`, `rap:renderToolVersion`, `rap:profile` |
| SHA-256 of the source bytes, and the source artifact ID | `rap:sourceSha256`, `rap:sourceArtifactId` |
| Source kind: `response-html`, `singlefile`, `wacz` or `raw_text` | `rap:sourceKind` |
| Rights: holder, status, access decision | `dc:rights`, `rap:rightsStatus`, `rap:accessDecision` |
| What is left out (media, comments, ads, live embeds) | — |
| Manifest ID | `rap:manifestId` |

The `rap:` namespace is `https://pressthink.org/j/rosen-archive/ns/preservation/1.0/`. The XMP must include its `pdfaExtension` schema description, or PDF/A validation fails.

### 2c. Body

- The full article body, in source order, with headings, quotes and lists kept.
- Quoted tweets and embeds appear as static text. Salon did this by blocking publisher scripts before capture (`preservation/salon/README.md:32`).
- Leave out site navigation, ads, related-article lists and comment widgets.
- If the source has a print date, an update note or a correction, keep it.

## 3. Validate the PDF

Run all of these. Every step marked "blocks" must pass before you accept the PDF.

```sh
F=RECORD-00718.20261107T000000Z.pdf

# 1. PDF/A-2u (blocks)
verapdf --flavour 2u --format text "$F"

# 2. PDF/UA-1 machine checks (blocks)
verapdf --flavour ua1 --format text "$F"

# 3. Fonts embedded, tagged, titled (blocks)
pdffonts "$F"            # every row: emb = yes
pdfinfo "$F" | grep -E '^(Title|Tagged|PDF version):'
                         # Tagged: yes, Title = the record title, PDF version: 1.7

# 4. Body text check (blocks)
#    Every nonblank line of the extracted body must appear in the PDF text,
#    ignoring whitespace and Unicode compatibility differences.
#    This is the Salon rule (preservation/salon/capture.mjs:87-91).
pdftotext -layout "$F" - > pdf.txt

# 5. raw_text similarity (report only; below 0.85 sends the record to review)

# 6. XMP matches the manifest (blocks)
python -c "import pikepdf,sys; m=pikepdf.open(sys.argv[1]).open_metadata(); print(dict(m))" "$F"
```

**Manual review.** Open the PDF in PAC. Check reading order, headings, alt text and the cover page against the Matterhorn human checkpoints. Review all 20 pilot PDFs, then 5 per batch of 100. Log the result in the batch report.

**Quality checklist.** Tick every line before you accept a PDF.

- [ ] The PDF came from a stored capture, or it is labeled as a `raw_text` fallback.
- [ ] Both veraPDF runs show 0 failed rules.
- [ ] Every font is embedded, `Tagged: yes`, and the title is correct.
- [ ] The body text check passes. The `raw_text` ratio is logged.
- [ ] Every cover-page line in 2b is present and matches the XMP.
- [ ] The "Not for redistribution" notice is on page 1.
- [ ] Bookmarks open at the right headings.
- [ ] The text is readable at 100% zoom, with no clipped lines or overlapping text.
- [ ] Images have alt text.
- [ ] The SHA-256 is written to `SHA256SUMS`.

If a PDF fails, move it to `quarantine/` with the validator output. Fix the template or the extraction, and render again. Never edit an accepted PDF in place.

## 4. Audio and video

1. Find the media URL: an enclosure, a direct file, or a platform page.
2. Check the do-not-download list. If any item applies, skip the download, record a `capture-attempt` with the reason, and keep the transcript and metadata. The list:
   - the media needs a login or a paywall;
   - the media has DRM;
   - the platform returns 403 or another block;
   - the rights event says `hold`;
   - the file is larger than the cap (default 4 GB) and Joe has not approved it;
   - the media is a live stream;
   - the media is not the work the record describes.
3. **Direct files and podcast enclosures.** Download the bytes as they are, with `curl -L --fail -o`. Do not transcode.
4. **Platform pages (YouTube, Vimeo, SoundCloud and similar).**
   ```sh
   yt-dlp --no-playlist --no-overwrites \
     --download-archive "$ROOT/rosen-archive-preservation/logs/yt-dlp-archive.txt" \
     -f "bv*+ba/b" --no-post-overwrites \
     --write-info-json --write-subs --write-auto-subs --sub-langs "en.*" --sub-format vtt \
     --write-thumbnail --limit-rate 2M --sleep-requests 2 \
     -o "%(id)s.%(ext)s" "$URL"
   ```
   - Never pass `--cookies` or `--cookies-from-browser`.
   - When yt-dlp merges separate audio and video streams, record "merged, no re-encode" in the sidecar.
5. **HLS or DASH only.** Remux without re-encoding with `ffmpeg -i in.m3u8 -c copy out.mkv`, and record that it was remuxed.
6. **Rename** the files to the layout: `<id>.<capture>.media.<ext>`, `.info.json`, `.transcript.vtt`, `.thumb.<ext>`.
7. **Check** the media. All three steps block:
   ```sh
   ffprobe -v error -show_format -show_streams -of json media.mp3 > media.ffprobe.json
   ffmpeg -v error -i media.mp3 -f null -   # must print nothing
   sha256sum media.mp3
   ```
   The duration must be within 2 seconds of the stated length. The Salon MP3 met this bar (`preservation/salon/recovery/README.md:21`).
8. **Transcript.** Keep it and record its provenance: human, publisher, or auto-captions. Render the host page or the transcript as a PDF using sections 2 and 3.

## 5. Social posts

- **Threads:** one PDF per thread, with one bookmark per post.
- **Standalone posts:** one PDF per post.
- **Render source:** the post JSON (the CSV row, plus the API record if one is kept). This needs no network.
- **Screenshots:** for posts with images, link cards or quote posts, capture with Browsertrix `page-spa` (`preservation/README.md:125-126`) and store a PNG as a `screenshot` artifact.
- **Media:** store attachments using section 4.
- **Twitter/X:** use the stored text only. Add a Wayback screenshot only where #714 finds one.

## 6. Store and record

1. Write the files to `objects/<class>/<id>/<captureId>/` using the layout in design D7. Never overwrite a file. A new capture gets a new folder.
2. Write `sidecar.json`: the record row at capture time, the capture receipt and the rights decision.
3. Write `SHA256SUMS` last, so it covers every file in the folder, the sidecar included. Run from inside the folder: `find . -type f ! -name SHA256SUMS -printf '%P\0' | sort -z | xargs -0 sha256sum > SHA256SUMS`. A later `sha256sum -c` checks only the files listed, so a file written after this step has no fixity cover.
4. Append schema-v1 events for the record:
   - `capture-attempt`, then `artifact-created` for each file;
   - `rights-decision`;
   - `storage-copy-created` for the Legion copy, with `storageClass: preservation` and `access: private`.

   Each copy needs exactly one current creation event (`preservation/README.md:284-290`). The artifact URI is `urn:sha256:<hex>`. The copy URI is `file://legion/rosen-archive-preservation/objects/...` (`preservation/preservation-manifest.schema.json:148-151`).
5. Validate the manifests with `npm run validate:preservation` (`package.json:17`).
6. Commit only the manifests and checksums to the public repo. Use one branch per batch, stacked on the previous batch's branch, so CI does not re-run after each merge.

## 7. Sync and fixity

**Second copy (storage class `replica`).** After each batch:

Capture objects never change, but manifests gain events and logs grow. Sync them separately:

```sh
P="$ROOT/rosen-archive-preservation"
LOG="$ROOT/sync-logs/$(date -u +%Y%m%dT%H%M%SZ).log"   # outside the synced tree

# 1. Capture objects: immutable. An existing file is never updated.
rclone copy --immutable --checksum "$P/objects" replica:rosen-archive-preservation/objects --log-file "$LOG"
rclone check --checksum "$P/objects" replica:rosen-archive-preservation/objects

# 2. Manifests: updated in place, with the replaced version kept on the replica.
rclone sync --checksum "$P/manifests" replica:rosen-archive-preservation/manifests \
  --backup-dir "replica:rosen-archive-preservation/manifest-history/$(date -u +%Y%m%dT%H%M%SZ)" --log-file "$LOG"
rclone check --checksum "$P/manifests" replica:rosen-archive-preservation/manifests
# If the remote cannot report SHA-256, add --download to each check.
```

`--immutable` stops rclone changing an object that already exists. An error from step 1 means a capture file changed. Treat that as an incident (section 8). A manifest change in step 2 is normal: it appends events, and `--backup-dir` keeps the version it replaces. Keep the sync log outside the synced tree, so the copy and the check never read a file that is still being written. Store `logs/fixity/` results in the repo or in `$ROOT/sync-logs/` for the same reason.

Then write a `storage-copy-created` event for the replica copy.

**Fixity schedule:**

| When | What | Record |
|---|---|---|
| On write | `sha256sum -c SHA256SUMS` in the new folder, on both copies | `fixity-check` event |
| Monthly | Full pass of both copies against every `SHA256SUMS` | `fixity-check` events, plus a `logs/fixity/<copy>-<date>.log` that names the copy (until #907 adds `storageCopyId`) |
| Quarterly | `rclone check` across copies, plus a restore drill of 10 random captures to a scratch folder: re-verify the hashes and open the PDFs (#742) | Drill report under `logs/fixity/` |

Fixity outcomes are `match` or `mismatch` (`preservation/preservation-manifest.schema.json:603-629`).

**Baseline bags (#702).** Create them with `npm run baseline:create -- --output "$ROOT/rosen-archive-preservation/bags/<date>"`. Verify both copies with `npm run baseline:verify` (`preservation/BASELINE.md:105-171`, `:202-211`).

## 8. Incidents

| Incident | Action |
|---|---|
| Fixity mismatch on one copy | Do not touch the good copy. Copy the file back from the matching copy. Verify it. Record a `fixity-check` mismatch, then a match after the repair, and a note. Keep the bad file in `quarantine/` for diagnosis. |
| Mismatch on both copies | Stop syncing. Look for an older bag or a Wayback copy. Record the loss in the manifest, and never overwrite the history. Tell Joe. |
| Legion drive failure or loss | Stop all writes. Restore from the replica to a new drive. Run a full fixity pass. Record new `storage-copy-created` events for the new device. |
| Third-party bytes committed to the public repo | Stop. Do not push more commits. If the commit is pushed, remove the file in a new commit and tell Joe. A history rewrite and a GitHub cache purge are Joe's call. The guard test (design D10) should catch this before merge. |
| Deploy collected a `preservation/` path | The fail-closed check aborts the deploy. Fix the manifest. Do not override the check. |
| veraPDF fails on the whole batch | Treat it as a template or renderer bug. Fix it once, re-render the batch, and keep the failed outputs in `quarantine/`. |
| Media blocked (403 or login) | Record a `capture-attempt` with the exact request. Keep the transcript. Try again only through #714 Wayback or the publisher's enclosure. Never use cookies. |
| Rights complaint about a stored copy | Keep the copy private. Record a `rights-decision` with `hold`. Never delete without Joe. Deletion is a curator decision recorded in the manifest. |
| LFS pointer instead of bytes | Run `git lfs pull`. The checksum rejects pointers, as Salon's verifier does (`preservation/salon/recovery/README.md:25`). |
