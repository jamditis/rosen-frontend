# Security & bug backlog — priority order

Generated 2026-06-04 from a per-issue triage against current main (each verdict grounded in a file:line or commit). No P0/P1; no launch-blockers. Severity: P0 exploitable/data-loss now, P1 serious-bounded, P2 moderate, P3 minor/hygiene. Effort: S <1h, M few hours, L day+.

Wake sessions: work this top-down. Skip do-not-automate issues. Frontend fixes need no backend setup; backend fixes need Poetry + backend/.env. This file is a reference only — it does not change the wake-session repo list or picker.

## Tier 1 — frontend security (self-contained, highest real-world risk)
- **#322** (P2/S) — record/thread/explorer hrefs render without scheme allowlist (XSS)
  - _Add a shared frontend/utils/sanitizeHref.js (allow http:/https:/mailto:, else return '#'), route RecordModal.js:232, Explorer.js:989, and ThreadModal.js toEmbedUrl through it, and add a unit test…_
- **#290** (P2/S) — fetchCoreData masks fetch failure as 1-record archive
  - _Replace the fallback-return in fetchCoreData's catch with `throw error` (keep DISSERTATION_RECORD injection on the success path only); App.js's existing .catch/setError + error UI will surface…_
- **#291** (P2/S) — sql-wasm.wasm fetched from cdnjs without integrity
  - _Self-host sql-wasm-1.10.3.wasm under frontend/vendor/ and point locateFile at the committed path (or fetch + SHA-384 check, then pass wasmBinary); removes runtime CDN trust and matches the FTP-deploy…_
- **#289** (P2/S) — exportAsCSV no formula-injection guard (currently unwired)
  - _Mirror the backend _sanitize_cell into escapeCSV — prefix cells matching /^[=+\-@]/ with a single quote before quote-wrapping — and add a tests/ case asserting title="=SUM(1+1)" exports as…_

## Tier 2 — backend security (need Poetry/test context)
- **#285** (P2/S) — /submit accepts attacker sheet_id (no allowlist)
  - _Add ROSEN_ALLOWED_SHEET_ID env allowlist; reject /submit payloads (and GHA process_submission writeback) whose sheet_id differs with 422. Also bound sheet_row to positive/sane range._
- **#287** (P2/S) — Playwright recovery script has no SSRF guard
  - _Import is_safe_public_url, validate every --url and modern_url before page.goto (emit source="rejected"), and add the page.route("**/*") abort-unsafe handler copied from scraper.py:449-458; add a…_
- **#293** (P2/S) — /submit accepts categories outside allowlist
  - _Add an allowlist check in app.py submit(): drop empty values and reject categories not in set(THEMATIC_CATEGORIES) with a 422 via _json_or_html; add a test in test_submission_app_json.py asserting a…_
- **#336** (P2/S) — sanitize pre-existing archive CSV cells
  - _Escape every string cell at the write boundary in write_csv_atomic (normalize the whole file on rewrite) OR ship a one-time scrub of the 3 historical cells; land it together with #335's export-layer…_

## Tier 3 — backend bugs
- **#286** (P2/S) — Tumblr/PDF dispatch paths crash on first call
  - _Fix both branches in dispatcher.py: either delete the Tumblr/PDF URL branches (re-ingest is batch/export-driven, not URL-driven) so those URLs fall through to the article processor, or add thin URL…_
- **#288** (P2/S) — video_processor temp_transcript filename race
  - _Fix as described: swap the CWD-relative hardcoded temp_transcript for a per-call tempfile.TemporaryDirectory + tmpdir-relative outtmpl (auto-cleans on exception, makes path CWD-independent and…_
- **#292** (P2/S) — extract_entities_full_parallel exits 0 after worker raises
  - _Fix as the issue describes: collect dropped batch IDs in the except block, write a recovery manifest under data/_recovery_tmp/, and sys.exit(1) when any worker raised; add a unit test that simulates…_

## Tier 4 — frontend bug / hygiene
- **#274** (P2/S) — sw.js: html network-first, precache, swr, silent puts
  - _Fix sw.js: route .html to networkFirst (HTML out of isStaticAsset), precache DATA_URLS on install (Promise.allSettled, tolerate failures), and await/try-catch every cache.put. Land with a…_
- **#337** (P3/S) — sessionStorage cache overflow no-ops every load
  - _Skip the sessionStorage write attempt for payloads above a size threshold (or demote the warn to debug) in setCachedData — one-line frontend guard; SW Cache Storage already covers these files so no…_
- **#167** (P3/S) — SHA-pin floating-tag GitHub Actions
  - _SHA-pin the two secret-bearing workflows (claude.yml + claude-code-review.yml) to commit SHAs with `# vX` comments per the owner's verified diff in the issue comment, and add a grouped…_
- **#327** (P3/S) — dataviz.html renders Sheet CSV via innerHTML
  - _Port escapeHtml()/sanitizeUrl() from data_explorer_grid.html into dataviz.html, route the :286 and :456-460 sinks through escapeHtml, optionally add a CSP meta, and extend a security test to cover…_
- **#332** (P3/S) — add _requests_get_safe IP-pin DNS-rebinding test
  - _Add a pytest to test_scraper.py that drives _requests_get_safe with resolve_and_validate returning a public IP and socket.getaddrinfo rebinding to a private IP at connect time, intercepting at the…_
- **#326** (P3/M) — .htaccess CSP/security headers never deployed
  - _Decide and make explicit: either remove .htaccess + its test assertions + the definition-of-done line, OR fix the CSP origins (cdnjs.cloudflare.com, www.youtube.com in frame-src, docs.google.com in…_

## Large — keep tracked, scope before starting
- **#333** (P2/L) — IP-pin residual egress paths via proxy
  - _Keep open as tracked P2 hardening; build one pinning proxy in front of all backend egress (requests + Chromium --proxy-server + subprocess HTTP(S)_PROXY) that re-validates and connect-pins each host…_

## Closed / scoped-down during this triage (no engineering)
- **#260** — closed: already-fixed (2 no-JS false positives + 1 sacred-content wontfix).
- **#334** — closed: gate ran, PRs #328/#329/#330 merged, siblings #323/#324/#325 closed.
- **#242** — scoped-down: 7/9 recovered via #244/#253; remaining 2 (RECORD-00665/00666) need a curator decision (delete vs reclassify), not code.

## In progress
- **#338** — analytics dashboard perf: prebuilt-aggregates JSON + lazy SQLite + dedupe + skip-redundant fetches (active session 2026-06-04).

