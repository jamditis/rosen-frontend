# Data integrity session handoff — 2026-07-23

This note records the exact local state after the long data-integrity session on
`legion2025`. The goal is still active: verify every record, complete every
applicable field, map every entity, preserve provenance, and prove the result
with repeatable checks. The archive is materially better, but it is not at
100% and must not be described as complete.

## Safety boundary

- No live archive or production service was touched.
- No FTP, SFTP, production Firebase, WordPress, or Cloudflare state changed.
- Source requests were evidence collection only and are recorded in
  `data/verification-log.md`.
- One-way choices remain held for curator review: permanent record IDs,
  duplicate/entity merges, edition identity, rights, full-text publication,
  and semantic relationship approval.
- At a wind-down checkpoint, keep completed work in a test-green review PR and
  leave unresolved corpus-wide gates in their durable stewardship issues. A
  deliberately red diagnostic branch is a measurement aid, not a merge
  candidate.

## Original session repository state before handoff commits

- Working directory:
  `C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-frontend`
- Starting branch: `joe/rosen-design-improvement-spec`
- Starting HEAD: `10181da4`
- Merge base with `origin/main`: `f4a3d24c`
- Pinned data commit used in evidence packets:
  `5d3d5351346a9712de4f54d95e69ba0f410c6efd`
- Current archive SHA-256:
  `1ade8e3e09868a82f0b9cd916e9a5d922c0b7b6c558ae76fe7d0092c782e0394`
- Current social SHA-256:
  `145c44f52033c7dcfda5f94f9db467ea85d68ecc82048e57067b8bc45a7a98fd`
- Current entity SHA-256:
  `0f8571ba152b38a20e7a5a1e5a7c2b7c80a769c30e71291a4a9c87ccb408e21e`
- Current relationship SHA-256:
  `e1c534d5509e4dbc0d2e6572addd93f2c58b2abecb79f274c13b0d3dabe5739f`

The starting branch contains the closed design-spec commit from PR #606, which
is unrelated to this data work. Publish this session from a new branch based on
`origin/main`; do not add more commits to the old design branch.

## Repository and PR state at handoff

- Ready branch: `agent/data-integrity-verified-batches`.
- Accepted data commit: `4dede919`.
- Ready-for-review PR: [#751](https://github.com/jamditis/rosen-frontend/pull/751),
  based on `main`.
- Current local branch: `agent/data-integrity-completion-gates`.
- Completion-gate commit: `86226f09`.
- Stacked draft PR: [#752](https://github.com/jamditis/rosen-frontend/pull/752),
  based on the ready branch.
- Joe's pre-existing `.gitignore` change for `notebooklm-handoff/` remains
  unstaged and must not be bundled into either PR.

PR #751 is the review boundary for accepted repairs. PR #752 adds tests only
and must remain draft while its nine completion gates fail.

## Current data counts

| Dataset | Current state |
| --- | ---: |
| Archive records | 1,028 rows, 38 columns |
| Social posts | 29,747 rows, 37 columns |
| Entities | 8,134 rows, 11 columns |
| Relationships | 12,686 rows, 10 columns |
| Archive records with entity relationships | 792/1,028 (77.0%) |
| Archive rows explicitly `verified=FALSE` | 38 |
| Archive rows with blank summaries | 34 |
| Archive rows with `needs_review=TRUE` | 10 |
| Social rows with `verified=TRUE` | 54 |
| Social rows without a final verified state | 29,693 |
| Entities with blank `first_mention_record_id` | 49 |

The archive CSV is UTF-8 without a BOM. It has 1,028 CRLF record boundaries
and 81,250 embedded bare LF characters. Preserve those line-ending counts when
editing multiline source text.

## Completed work in this session

### Validation and gates

- Expanded `backend/scripts/validate_archive_data.py` to recognize thread IDs
  and report archive-only entity coverage correctly.
- Added unit coverage in `backend/tests/test_validate_archive_data.py`.
- Added focused regressions for every accepted data repair.
- Added explicit completion gates for core fields, summaries, verification,
  source dates, social identity, social verification, and entity first mentions.
  Eight gates still fail honestly; they are the remaining work, not broken test
  code.
- The archive validator reports no structural errors.
- The CRLF-aware `git diff --check` passes.

### Curated records

- Reconciled all 77 newspaper source-manifest records. The six manifests now
  map every item to a canonical archive record with source evidence; no local
  unprocessed PDF directory remains. `CLIP-00023` stays quarantined as a
  Jay Rosenstein namesake.
- Applied eight five-record HuffPost pilots, covering `RECORD-00804` through
  `RECORD-00843`. Forty records now have source-backed summaries and explicit
  verification. Each pilot has immutable official-response hashes and focused
  regression coverage in `data/verification-log.md`.
- Repaired source-backed defects in `RECORD-00039`, `RECORD-00043`,
  `RECORD-00075`, and `RECORD-00667`.
- Kept `RECORD-00667` metadata, bounded excerpts, and source hashes while
  withholding its recovered full text because the source rights notice forbids
  duplication or redistribution without express written permission.
- Preserved unresolved identity problems instead of guessing:
  `RECORD-00602`, `RECORD-00613`, and composite `RECORD-00614`.
- Seven HuffPost `#NN08` records still use capture-year dates:
  `RECORD-00862`, `RECORD-00863`, and `RECORD-00866` through `RECORD-00870`.
- Removed `RECORD-00865` and its lone relationship after curator review. The
  record was a fragment from the Netroots Nation 2008 sketchbook flow, with no
  direct authored body beyond the title-like snippet.

### Social and graph data

- Added explicit source verification to 54 social rows through bounded
  Bluesky pilots and repaired image-only/source-identity defects.
- Audited 54 non-Rosen Bluesky rows that still carry Jay's profile URL and
  copyright. Their ATProto source records are absent, so the fields remain
  unresolved rather than inferred.
- Added thread relationships with exact source snippets and removed the sole
  semantic duplicate/self-reference found during review.
- Filled 26 relationship-backed entity first mentions from their earliest
  non-quarantined relationship evidence.
- Added 76 source-backed orphan-entity mappings and 76 evidence relationships.
- No relationship-backed entity now has a blank first mention.
- The remaining 49 blanks consist of probable duplicate identities and
  ambiguous or no-evidence entities.
- The entity-merge audit has 28 probable duplicate pairs: 19 mechanical-looking
  candidates and nine curator-required identities. No merge was applied.

### Low-count-year recovery

The sitemap comparison found 182 official PressThink pages missing from the
archive across 2009–2021, 2025, and 2026. Official evidence now exists for all
182 candidates: 164 captured HTML responses plus an official WordPress API
snapshot covering the 18 candidates from 2011.

Audited years:

| Year | Result |
| --- | --- |
| 2012 | 13 distinct missing works |
| 2013 | 27 distinct missing works |
| 2014 | 30 distinct missing works; one existing-source mapping |
| 2015 | 20 distinct missing works; one existing-source mapping |
| 2016 | 11 distinct missing works; one existing-source/expanded-edition mapping |
| 2017 | 10 distinct missing works |

That is 111 distinct missing works plus three mapping/edition decisions across
114 audited candidates. Sixty-eight captured candidates remain to audit: 2009,
2010, 2011, 2018, 2019, 2020, 2021, 2025, and 2026. No recovered work has been
assigned a permanent ID or imported because rights, edition identity, order,
taxonomy, and graph decisions are one-way curator choices.

## Last worker checkpoint: HuffPost pilot 09

K2 finished cleanly with exit code 0 under
`%TEMP%/rosen-k2-huffpost-pilot-09`. It captured first-attempt official HTTP
200 responses for `RECORD-00844` through `RECORD-00848`, verified the stored
titles, authors, dates, bodies, word counts, excerpts, and pull quotes, and
found 100% ordered normalized-token body coverage. An independent replay passed
22 of 22 checks.

The packet proposes one source-identity repair:

- `RECORD-00847`: change the truncated
  `would-you-guys-like-us-t_b_63176` URL to
  `would-you-guys-like-us-to_b_63176`.

The packet intentionally does not propose summaries or verification-state
changes. No pilot-nine data was applied. The next session must read the saved
official bodies, draft source-backed summaries, independently review the URL,
write a failing pilot-nine regression, then apply the accepted five-record
batch. Evidence hashes are in the final pilot-nine section of
`data/verification-log.md`.

## Test and completion-gate state after review

`npm run test:data` reports 135 passing and seven failing tests.
`npm run test:data:extraction-coverage` reports three passing and one failing
test. Together they measure eight intentionally failing completion tests that
remain owned by the stewardship issues:

1. Three core blanks: `RECORD-00602:url`, `RECORD-00613:url`, and
   `RECORD-00614:publisher`.
2. Thirty-four archive summaries are blank (`RECORD-00844` onward).
3. Seven HuffPost `#NN08` rows use capture-year dates.
4. Fifty-four non-Rosen Bluesky rows use Jay's profile URL.
5. The same 54 rows assign copyright to Jay.
6. 29,693 social rows lack explicit verification.
7. Forty-nine entities lack a first-mention record.
8. Seventy-eight records with at least 500 raw-text characters have no
   extracted relationships.

The archive verification gate itself is green: both `TRUE` (served) and `FALSE`
(reviewed exclusion) are explicit verdicts. Do not bypass the remaining work by
weakening gates or bulk-asserting verification without source evidence.

Thirty-eight archive rows still carry `verified=FALSE`. That is an unresolved
curation queue, not a missing-verdict test failure; the test accepts both
`TRUE` and `FALSE` as explicit verification states.

## Evidence packets on this machine

Important `%TEMP%` directories:

- `rosen-k2-huffpost-pilot-01` through `rosen-k2-huffpost-pilot-09`
- `rosen-huffpost-pilot-08-before-20260723-082752`
- `rosen-pressthink-recovery-2012-audit`
- `rosen-pressthink-recovery-2013-audit`
- `rosen-pressthink-recovery-2014-audit`
- `rosen-pressthink-recovery-2015-audit`
- `rosen-pressthink-recovery-2016-audit`
- `rosen-pressthink-recovery-2017-audit`
- `rosen-pressthink-recovery-2009-01`
- `rosen-pressthink-recovery-2010-01` through `-03`
- `rosen-pressthink-recovery-2012-01` through `-03`
- `rosen-pressthink-recovery-2013-01` through `-06`
- `rosen-pressthink-recovery-2017-01` through `-02`
- `rosen-pressthink-recovery-2018-01` through `-03`
- `rosen-pressthink-recovery-2019-01` through `-02`
- `rosen-pressthink-recovery-2020-01` through `-03`
- `rosen-pressthink-recovery-2021-2026-01`
- `rosen-orphan-entity-reconciliation-01`
- `rosen-orphan-entity-merge-audit`

These packets are local evidence, not tracked source files. Preserve them on
`legion2025` until the PRs are reviewed or copy them to durable storage with
their hashes before deleting `%TEMP%`.

## GitHub stewardship linkage

- Program and baseline: #693, #696, #703.
- Curated quality and review: #695, #723, #724, #727, #730.
- Social verification: #725.
- Preservation evidence: #697, #726.
- Knowledge graph: #698, #731, #732, #733, #734, #738.
- PressThink recovery history: #208.

None of the open stewardship issues meets every acceptance criterion yet. They
were left open, with session updates posted here:

- [Program epic #693](https://github.com/jamditis/rosen-frontend/issues/693#issuecomment-5058766695)
- [Curated-record worker #724](https://github.com/jamditis/rosen-frontend/issues/724#issuecomment-5058766867)
- [Social audit worker #725](https://github.com/jamditis/rosen-frontend/issues/725#issuecomment-5058767032)
- [Preservation index #726](https://github.com/jamditis/rosen-frontend/issues/726#issuecomment-5058767210)
- [Cross-file validation #731](https://github.com/jamditis/rosen-frontend/issues/731#issuecomment-5058767418)
- [First-mention reconciliation #733](https://github.com/jamditis/rosen-frontend/issues/733#issuecomment-5058767598)
- [Graph coverage metrics #738](https://github.com/jamditis/rosen-frontend/issues/738#issuecomment-5058767777)
- [Closed PressThink history #208](https://github.com/jamditis/rosen-frontend/issues/208#issuecomment-5058767976),
  updated without reopening it.

Do not close parent epics or claim the 100% goal is complete. The session was
explicitly stopped at the handoff boundary; resume only from an approved item
in the next-actions list.

## Next safe actions

1. Finish pilot nine from its saved evidence without another network call.
2. Audit the remaining 68 PressThink candidates offline, one year packet at a
   time.
3. Prepare a curator proposal for importing the 111 confirmed works, including
   permanent IDs, order, rights, full-text treatment, taxonomy, and graph impact.
4. Continue five-record HuffPost batches through the remaining 35 rows.
5. Resolve the seven remaining `#NN08` dates from primary evidence.
6. Revisit the 54 source-absent Bluesky identities only if native ATProto
   records or another authoritative capture is recovered.
7. Present the 28 entity merge pairs for curator approval before changing any
   canonical entity ID.
8. Regenerate JSON only after accepted CSV work settles, then run the full data,
   pipeline, frontend, and preview-audit checks.

## Worker protocol to retain

- Use one K2 CLI worker at a time with `kimi-code/kimi-for-coding`.
- Give it a pinned CSV snapshot, exact hash, reviewed fetch program, immutable
  append-only request log, and proposal-only output boundary.
- Check long K2 jobs at roughly ten-minute intervals.
- The primary agent independently verifies evidence and writes the failing test
  before any canonical edit.
- Browser, authenticated source retrieval, Firecrawl, and access-policy choices
  stay with the primary agent.
