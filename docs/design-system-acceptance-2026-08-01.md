# Design-system release acceptance — 3.8.9

Issue: #662  
Acceptance date: 2026-08-01  
Production baseline: `97cb89cae6c273908425682e35423e4a1d81248b` (`3.8.8`)  
Candidate base: `0dbd9f4ed9dc45e95a13fbb90d40ba72e3e0ecb9` (`3.8.9`) plus the acceptance evidence in this pull request

## Decision

The 3.8.9 visual-system refresh is release-ready. All implementation children
#655 through #661 are closed. The candidate passes the complete configured
route and viewport audit, the repository test gates, deploy-manifest checks,
and the fixed visual review matrix. The partial FTP package contains only the
57 changed files selected by the production deploy manifest.

Initial-load layout shift remains observable on asynchronously hydrated archive
and desktop routes. The raw measurement is timing-sensitive, so this release
does not claim a zero or stable CLS value. Deterministic route budgets and CI
enforcement are explicitly deferred to #772; settled screenshots, fonts,
stylesheets, and assets were accepted here.

No production deployment was performed as part of this acceptance pass.

## Acceptance evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Milestone children | Pass | #655, #656, #657, #658, #659, #660, and #661 are closed. |
| Preview audit | Pass | 41 configured routes at mobile, tablet, and desktop: 123 rows, 0 axe violations, 0 custom audit errors. |
| Focus and keyboard | Pass | Route entry, dialogs, record navigation, desktop Start/taskbar/window controls, focus return, and visible focus checks completed in the preview audit. |
| Touch targets | Pass | Required controls and desktop window actions met the 44-pixel checks in the preview audit. |
| Zoom and responsive reflow | Pass | The isolated desktop run completed the 200-percent-equivalent and portrait reflow checks, including focus, window stack, Start-menu reachability, and viewport containment. |
| Reduced motion and forced colors | Pass | Design-system foundation tests require both media-query protections and their action/focus behavior. |
| Assets, fonts, and stylesheets | Pass | A 123-load runtime probe found no page errors, no same-origin asset failures, every used font set completed, and no duplicate external stylesheet path. |
| Layout shift | Deferred with evidence | Hydration-driven CLS was measurable and varied between repeated runs; deterministic budgets and regression enforcement are tracked in #772. |
| Full Node suite | Pass | `npm test`: 1,311 passed, 0 failed. |
| Frontend suite | Pass | `npm run test:frontend`: 320 passed, 0 failed. |
| Deploy tests | Pass | `python -m pytest backend/tests/test_deploy_full_site.py -q`: 48 passed. |
| Full deploy dry-run | Pass | Generated 1,030 record shells and selected 1,191 production files without connecting or uploading. |
| Repository hygiene | Pass | `git diff --check` and the no-AI-authorship attribution scan are clean. |

The preview reports and captures were generated under
`preview-audit-results/shards/{mobile,tablet,desktop}/`. They are local release
evidence rather than deployable site files.

## Fixed screenshot matrix

The comparison uses production 3.8.8 and candidate 3.8.9 at 1440 by 900. Pixel
counts are RGB comparisons over 1,296,000 pixels; visual review determined
whether each difference matched an approved migration.

| State | Capture | Changed pixels | Review |
| --- | --- | ---: | --- |
| Standard archive | `home-archive.png` | 107,234 (8.2742%) | Expected removal of the superseded welcome prompt; archive structure is unchanged. |
| Standalone | `participate.png` | 0 (0.0000%) | Identical. |
| Modal | `record-article.png` | 0 (0.0000%) | Identical. |
| Failure | `record-error.png` | 0 (0.0000%) | Identical and recovery remains visible. |
| Optional desktop | `archive-desktop.png` | 1,295,989 (99.9992%) | Approved Rosen 98 colors, icon treatment, and naming; the same shortcuts, content hierarchy, and exit remain. |
| Optional windowing | `desktop-windowing.png` | 1,016,796 (78.4565%) | Approved window chrome and taskbar treatment; overlapping-window information and controls remain recognizable. |

The changed frames are deliberate and bounded. Standard reading, standalone,
modal, and failure behavior still read as the same product; the optional
desktop keeps its established spatial model while using the completed visual
language.

## Partial FTP package

Artifact: `rosen-3.8.9-issue-662-partial-ftp.tar.gz`  
Archive size: 430,195 bytes  
Extracted file bytes: 1,469,597  
Files: 57  
SHA-256: `2b5acff557144b41fddad24799371ae97267fdf344ebbf14ec8885cccfaaf247`

The file list is the intersection of the exact production delta from 3.8.8
and `collect_local_files()` from the canonical full-site deploy script. The
package excludes tests, audit tooling, backend code, CSV sources, and the
approval-gated `features/making-of` tree. Its per-file checksums and canonical
dependency-first, entry-points-last upload order are recorded in
[`design-system-release-3.8.9.sha256`](design-system-release-3.8.9.sha256).

The final upload group is `index.html`, `frontend/sw.js`, and `version.json`, so
the version signal flips only after the changed application files and worker
payload are in place. The separate root-scope bridge at `/sw.js` is unchanged
from the production baseline and is therefore intentionally absent from this
partial package; the changed `/frontend/sw.js` worker is included.

## Dependency disclosure

The locked install completed with the repository's four existing high-severity
npm advisory reports. They are transitive dependencies in the existing
Transformers stack and have no available lockfile-only remediation. This
acceptance change adds no package or lockfile dependency.
