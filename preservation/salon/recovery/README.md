# Historical and media recovery

Follow-up retrievals were made November 6, 2026, America/New_York (November 7 UTC). These supplement the original eight-article package without replacing its captures or receipts.

Three additional interviews now have verified PDF, SingleFile HTML, untouched HTTP response, and body-text copies in [`captures/`](captures/):

| Date | Article | Recovery path |
| --- | --- | --- |
| 2008-08-08 | [Salon Radio: Anthrax edition](captures/2008-08-08-anthrax_5.html) | Brad Blog linked the legacy interview/transcript. That URL returned 410; Salon’s current canonical path returned 200. |
| 2009-06-19 | [The Washington Post, Dan Froomkin and the establishment media](captures/2009-06-19-washpost.html) | Greenwald’s following-day article linked this interview. The legacy URL returned 410; the current date/slug path returned 200. |
| 2017-05-06 | [Press critic Jay Rosen on how and why the media is normalizing Trump](captures/2017-05-06-press-critic-jay-rosen-on-how-and-why-the-media-is-normalizing-trump-the-need-to-be-truthful-conflicts-with-the-duty-to-appear-neutral.html) | Publisher search and related coverage identified the extended interview. |

The collection now contains **11 article PDFs and 11 self-contained HTML copies**, including all four curated Salon records, the four Rosen-authored articles on the publisher’s author page, and additional interviews/related coverage. These newly recovered interviews are by Glenn Greenwald and Paul Rosenberg; they are not new Rosen bylines. The combined interview transcripts account for much more of Rosen’s own speech than the current author listing alone.

## Recovered recording

[`media/2017-09-14-berkeleyside-jay-rosen.mp3`](media/2017-09-14-berkeleyside-jay-rosen.mp3) is the recording embedded in RECORD-00718, “What are journalists for in the age of Trump?”

The live RadioPublic embed could not be reached from this environment. A saved 2018 RadioPublic show page exposed the episode’s metadata and its original Libsyn enclosure. The encoded episode ID exactly matches Salon’s iframe. The recording was downloaded from that publisher enclosure, not reconstructed from text. Its ID3 tags identify Jay Rosen and the Berkeleyside Uncharted Festival 2016; the archived episode was published July 7, 2017 and later embedded by Salon in September. Keep event, podcast publication, Salon publication, and retrieval dates separate.

The MP3 is 52,903,373 bytes, SHA-256 `32f8b73fecda0acdd2e9401ae45c217dcb77b3a9710632209722e91008cab801`. `ffprobe` reports stereo MP3, 44.1 kHz, 2,204.020917 seconds (36:44), within one second of the archived 36:45 display. A complete FFmpeg decode finished without errors. This verifies the file’s structure and its documented identity chain; it is not a full manual listening review.

The upload to GitHub LFS completed successfully. A subsequent independent download through the GitHub contents API returned all 52,903,373 bytes with the same SHA-256; see [`github-storage-readback.json`](github-storage-readback.json). A separate git-lfs batch-fetch attempt returned HTTP 503, so that particular CLI download path was not verified.

The audio is retained with **Git LFS**, keeping the 53 MB payload outside ordinary frontend git objects. Run `git lfs pull` after cloning to obtain the actual audio bytes. The checksum and verifier reject a small LFS pointer as an incomplete offline copy. The article HTML itself remains a separate self-contained text/page capture; play the local MP3 separately.

## Historical coverage evidence

A Wayback capture of Salon’s author page from July 26, 2012 lists the same four Rosen-authored pieces as the live author page: Postman (2003), Nullifying the press (2006), campaign coverage (2008), and bogus hype (2012). This independently checks an older publisher inventory against today’s list. It does not prove no earlier contribution was ever published or omitted.

The current Jay Rosen topic page was also retained. [`topic-inventory.json`](topic-inventory.json) records its 17 related-coverage cards and their displayed bylines. A topic tag is not a Rosen byline. The topic page includes other writers’ commentary, quotations, and discussions of Rosen; the full bodies of every tagged article are not claimed as captured here.

## Remaining media gaps and exact limits

- The January 2009 interview’s MP3 URL was recovered from a contemporaneous repost: `http://static.salon.com/media/mp3/2009/01/conversations_gg_rosen.mp3`. This environment’s HTTPS connection to that host failed with a tunnel 403. Exact public Wayback CDX queries, including one without status filters, returned `[]`. That is an empty index result for those queries, not proof the recording is globally lost. The complete transcript is in the original article capture.
- The June 2009 interview’s source names `http://media.www.salon.com/2009/06/conversations_gg_rosen.mp3`. An exact Wayback query returned `[]`. A prior HTTPS connection to this media host for the May 2017 video had already failed with a tunnel 403; the June MP3 was not downloaded. The complete transcript is preserved.
- The May 2017 article contains a literal JWPlayer shortcode naming `http://media.www.salon.com/2017/05/3f8f877605c7f05d8814731f4733b0f5.mp4`. The HTTPS request failed with a tunnel 403, and an exact successful-capture CDX query returned `[]`. Its contents/identity were not verified and the video is not retained.
- The 2008 interview transcript is preserved. No playable recording URL was recovered from the current source in this pass.
- No conclusion of exhaustive Salon history is warranted. A general whole-domain crawl, every third-party quotation, all public archive holdings, and all original audio/video are outside this completed bounded pass.

[`probes.json`](probes.json) records exact request URLs, UTC retrieval times, HTTP outcomes or transport errors, and hashes of retained responses. CDX result files are raw query evidence, not schema-v1 canonical preservation manifests, and their filtered/collapsed queries do not assert complete capture histories. The first author query used an overly broad `matchType=domain` and timed out; the corrected prefix query succeeded. The old-route 410 attempts remain in [`initial-capture-attempt.json`](initial-capture-attempt.json); corrected successful receipts are retained separately and projected into the final three-item capture report.

Validate all 11 article copies, discovery evidence, episode provenance, audio checksum and duration, and full audio decode from the repository root:

```sh
node preservation/salon/verify-recovery.mjs
(cd preservation/salon && sha256sum -c SHA256SUMS)
```

A new supplemental capture can use `capture.mjs <empty-output-directory> <inventory.json>` and be independently checked with `verify.mjs <output-directory> <inventory.json>`. Explicit supplemental mode verifies all supplied sources without claiming the four-record base inventory was included; `verify-recovery.mjs` always runs the required base inventory separately.
