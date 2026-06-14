# Submission pipeline burn-down — design + sequencing

**Status**: Approved shape (Joe, 2026-06-12 via brainstorming). Execution in a self-paced loop.
**Goal**: Get the Rosen record submission and processing pipeline up and running smoothly, effectively, and accessibly (frictionless for non-technical curators Jay/Hali).
**Parent design (locked, do not relitigate)**: `docs/plans/2026-05-24-pillar3a-free-auto-deploy-design.md`.

---

## What this is

The Pillar 3a architecture is already designed and approved, and `submit-record.yml` +
`process_submission.py` are built. This doc is the **execution plan** to close the gap between
"built" and "running," plus two scoped feature additions. It does not redesign the pipeline.

The locked architecture stands: Apps Script mints a GitHub App JWT and POSTs `workflow_dispatch`
directly to GitHub — no Flask proxy, no Cloudflare Worker — because Pillar 3a's hard constraint is
$0 ongoing cost and zero dependency on Joe's personal accounts after handoff to Jay/Hali. A proxy
would reintroduce the houseofjawn/Flask dependency the pillar exists to remove.

## Convergence criteria (when the loop stops)

1. Phases 0–3 shipped (code hardening, infra+live, curator bridge, public form). Phase 4 (#353) shipped or explicitly deferred by Joe.
2. A real test URL flows Sheet-checkbox → live archive record end-to-end.
3. The submission endpoints are correct and SSRF/allowlist-safe (no open P2s in the cluster below).
4. Curator path needs no terminal, SSH, or FTP — a checkbox tick is the whole interface.

## Research notes

- **Apps Script → GitHub auth**: `workflow_dispatch` (per-workflow endpoint) needs only `actions:write` on the dispatching credential; the workflow's own in-run token does the `contents:write` push to `main`. The GitHub App is scoped to one repo, so a leaked Script-Properties key can only dispatch this workflow / push this repo — recovery is revoke+regenerate (~5 min), already accepted in the parent design. A Flask proxy is the abstract best practice but is ruled out by the no-Joe-dependency constraint. (Sources: GitHub docs issue #23176; Elio Struyf fine-grained-PAT dispatch writeup; Jared Whalen sheets→Action tutorial.)
- **Playwright SSRF (#287)**: `--host-resolver-rules="MAP * <validated_ip>"` is a *global* override on Chromium's resolver, so it covers redirects and subresources by construction — but only if it pins *every* host to the one validated IP (a per-host `MAP host ip` rule lets a cross-host redirect escape). The `requests` path is separate: set `allow_redirects=False` and re-validate each hop. `0.0.0.0` and `[::]` are real headless-Chrome localhost bypasses and must be in the blocklist explicitly. (Sources: chromium net/dns; GHSA-w8g9-x8gx-crmm; Gotenberg CVE-2026-42592; windshock SSRF-defense 2025.)
- **Codebase prior art**: `backend/scripts/deploy_full_site.py:257–282` already has the path-or-content known_hosts logic to backport to `sftp_push.py` (#298/#304). `backend/tests/test_process_submission.py` (~1,493 lines) is the pattern for new pipeline tests.

---

## Phase 0 — Code hardening (autonomous; no infra)

Make the pipeline correct and safe before real traffic. Each themed PR follows the repo's
bug-fixing workflow: **failing test first** → fix → green. Bounded Codex gate per `~/.claude/CLAUDE.md`.

| Themed PR | Issues | Touch points |
|---|---|---|
| Dispatch / processor hardening | #286, #288, #292 | `dispatcher.py` (Tumblr/PDF construct args), `processors/video_processor.py` (unique tempdir), `scripts/extract_entities_full_parallel.py` (exit 1 on worker error) |
| Submission allowlists | #285, #293 | `submission_server/app.py` + `sheets_callback.py` (sheet_id allowlist), `app.py` + `config.py` (category allowlist) |
| SSRF + SFTP correctness | #287, #298/#304, #303 | `rosen_scraper/url_safety.py` + article/Playwright path (global resolver pin, redirect block), `submission_server/sftp_push.py` (inline-or-path known_hosts), `scripts/process_submission.py` (`_git_commit_and_push` fetch+rebase+retry) |

Order within the phase: dispatch/processor first (pure correctness), then allowlists, then SSRF/SFTP
(touches the security boundary; lands last so it's reviewed against a stable base).

## Phase 1 — Infra + first live run (together; needs Joe's keyboard)

- #226: create `rosen-archive-bot` GitHub App (`contents:write`, `actions:write`, `metadata:read`), install on the repo, add it to the `main` branch-protection bypass list.
- Add the exact repo-secret set, enumerated from the live `submit-record.yml` + `sweep-stuck-rows.yml` (the "11" in #226 is approximate; verify against the actual `${{ secrets.* }}` references).
- #302: SFTP key auth — confirm whether Bluehost needs key vs password; set the matching `ROSEN_SFTP_*` secrets.
- Smoke test: one `https://example.com/...` (RFC 2606 reserved) URL → confirm `submitted → processing → live` and a real CSV/JSON/SFTP round-trip; then the scrape-fail and dedup paths.

## Phase 2 — Curator bridge (#308 sheet half / #310)

Rewrite `automation/apps-script/Code.gs` to the locked v2: read row → mint GH App JWT
(`Utilities.computeRsaSha256Signature`, RS256, 10-min expiry) → exchange for a 1-hour installation
token → POST `workflow_dispatch` with `{ref: main, inputs: {url, title, notes, sheet_id, sheet_tab, sheet_row}}`.
Script properties: `GITHUB_APP_ID`, `GITHUB_APP_INSTALL_ID`, `GITHUB_APP_PRIVATE_KEY`. The current
Code.gs (POSTs to the dead Flask `/submit`) is fully replaced. Validate `http(s)://` pre-dispatch
(defense in depth — the workflow re-validates). #310 is the demo/verification of this path for Jay.

## Phase 3 — Public engagement form (#308 form half)

A "Ways to Participate" form, **human-gated** — public suggestions never reach the publish pipeline
directly. Flow: on-brand HTML form (paper/typewriter aesthetic, Special Elite + Roboto Mono, favicon +
full OG tags per the web rules) → `POST` to an Apps Script web-app `doPost` → append to a separate
**Triage** tab (not the curator queue). A human reviews and promotes good suggestions into the curator
queue, where the Phase 2 trigger picks them up. No client-side credential. Survives handoff (form is
static; the Apps Script and Sheet transfer to Jay/Hali). This is a creative build — gets its own
`writing-plans` cycle when reached. (#347, the standalone landing page, is `do-not-automate` — skip.)

## Phase 4 — Self-serve raw_text (#353)

Carry pasted article text through an automated retry for un-scrapeable URLs (Medium, paywalled).
Add a `raw_text` column (I) to the queue sheet; teach `sweep_stuck.py:fetch_rows()` to read A:I and
thread it through `dispatch_workflow()`. Hard limit: `workflow_dispatch` inputs cap at 65,535 chars —
document the cap; very large bodies stay a manual maintainer paste. #311 (email intake) is **deferred
out of this loop** per Joe 2026-06-12 — the team-whitelist half of #311 is already done and is separate
from the pipeline, so what remains deferred is only the automated email-to-dispatch path.

---

## Test strategy

- Phase 0: a failing pytest per bug reproducing the defect first (repo CLAUDE.md mandate), then the fix turns it green. Extend `backend/tests/test_process_submission.py` / `test_sftp_push.py`; add `test_dispatcher.py`, `test_video_processor.py` as needed.
- Phase 1: live smoke test (not unit) — the Action run itself is the test; `example.com` reserved URLs only.
- Phase 2: Apps Script has no native unit harness — verify against a TEST sheet + TEST App install before pointing the production sheet at it (parent design's migration plan §"Migration from Pillar 3").
- Phase 3: an Apps Script `doPost` test sheet; axe-core pass on the form for the WCAG baseline even though "accessibly" here means curator-friendly.

## PR discipline

Themed PRs (Joe 2026-06-12). One local Codex pass (5.5 high for security-touching: the allowlist and
SSRF PRs; 5.4 low for the mechanical ones), fix what's actionable, file the rest as issues, ≤2 local
passes, push, let the cloud review fire, one fix round, stop. Never merge — Joe merges. No AI
attribution anywhere.

## Out of scope

- #311 email intake (deferred this loop).
- #347 Ways-to-Participate landing page (`do-not-automate`).
- Pillar 3b in-archive editing (separate pillar).
- The data gap-fill cluster (#208/#209/#242) — not pipeline plumbing.
