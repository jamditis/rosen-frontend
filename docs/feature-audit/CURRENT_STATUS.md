# Current feature-audit overrides

The generated feature stories, verdicts, and retest files in this directory are historical evidence. They describe the repository and deployed surface at the time each audit phase ran; they are not automatically rewritten when a later product decision retires a feature.

## Data explorer

Issue #583 supersedes the June 2026 audit’s deployed-state description of `tools/active/dataexplorer/`.

Current status:

- The hardened source and its source-level security regression remain in the repository.
- The tool is not linked from the public archive.
- The full-site deploy does not upload it and removes any stale production copy after successful replacement uploads.
- Production Content Security Policy no longer permits the Google Sheet origins used by the prototype.
- Public deployment requires migration to committed local archive artifacts and a new product, accessibility, security, and deployment review.

Do not rewrite the historical audit verdicts to match this later decision. Use this file and the linked GitHub issue for current status.

## River of News

Issue #584 supersedes the audit’s `UNREACHABLE` description of `frontend/components/RiverOfNews.js`.

Current status:

- The component is archived under `archived/frontend-prototypes/` rather than wired into production.
- Its Today / Yesterday / This week defaults were designed for a live feed and do not fit the historical archive corpus.
- The river-only block has been removed from globally loaded `frontend/index.css`.
- The full-site deploy removes any stale public copy of the old component module after successful replacement uploads.
- Reintroducing a river view requires a new grouping model, navigation decision, and accessibility/behavior review.

Do not rewrite the historical audit verdicts. Use this override and issue #584 for current status.
