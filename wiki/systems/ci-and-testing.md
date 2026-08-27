---
type: system
title: CI and testing
description: The test commands, GitHub Actions gates, and local preview audit paths that protect the archive.
source: [package.json, tests/, .github/workflows/, AGENTS.md]
verified: 2026-08-20
tags: [ci, tests, validation, github-actions]
timestamp: 2026-06-23
---

# CI and testing

Tests use Node's built-in test runner for frontend/data paths and pytest for backend paths. The repo has both local commands and GitHub Actions gates; use local tests before PRs, then let CI confirm the same surfaces.

## Local commands

- `npm test` — the complete active Node suite: every `tests/*.test.js` file plus the source-discovery Worker tests.
- `npm run test:data` — a focused local subset for data integrity, CSV quality, feed titles, CSV unescape, PressThink dedup, graph validation, stewardship census, preservation manifests, and relationship adjacency.
- `npm run test:data:extraction-coverage` — focused extraction-gap coverage.
- `npm run test:pipeline` — focused data pipeline, thread detection, process-record, and thread algorithm tests.
- `npm run test:frontend` — a focused frontend subset for fast iteration.
- `npm run test:workers` — the source-discovery Worker subset.
- `npm run test:okf` — the OKF bundle, flight-recorder, and blindfold subset.
- `npm run preview` — local static preview at `http://127.0.0.1:8000/` by default.
- `npm run preview:audit` — starts preview, walks key routes at mobile and desktop sizes, runs axe, measures layout shift, and writes `preview-audit-results/`.

The preview audit also budgets layout shift per route. It records every
Layout Instability entry, splits each route into a hydration phase and a
settled phase at the point the route first goes quiet, and fails the run when
either phase goes over the budget for its route class. Budgets, baselines, and
the route classes live in `scripts/layout-shift-budgets.js`;
`tests/layout-shift-budget.test.js` covers the evaluation logic. Two
environment switches help when the machine is unusual:

- `PREVIEW_AUDIT_CHROMIUM_PATH` — use a Chromium binary already on the machine.
- `PREVIEW_AUDIT_ROUTES` — a comma-separated list of route slugs, for
  re-measuring one route after a fix. Leave it unset for a release run.
- `PREVIEW_AUDIT_LAYOUT_SHIFT_SEED=1` — measure and write
  `preview-audit-results/layout-shift-baseline.json` without failing on
  budget. Use it to refresh the baseline in `scripts/layout-shift-budgets.js`.

The subgroup scripts are development conveniences, not the merge-coverage boundary. Frontend Validation runs for every pull request to `main` and invokes `npm test`, whose globs automatically include new root Node tests. `tests/ci-node-suite-coverage.test.js` fails if an active Node test moves outside the canonical globs, the workflow stops invoking the complete suite, or a pull-request path filter can skip it.

Backend commands run from `backend/` with Poetry:

```bash
poetry install --with dev
poetry run pytest -v --tb=short
poetry run ruff check src/ tests/ submission_runtime/ scripts/
poetry run black --check src/ tests/
poetry run mypy src/
```

Ruff gates backend CI. Black and MyPy currently report without gating in `backend-linting.yml`.

## GitHub Actions map

- `frontend-validation.yml` — production dependency audit, syntax checks, required entry points, the complete Node suite, HTML shape, CDN reference listing, and TODO/FIXME scan.
- `backend-tests.yml` — Poetry install, Playwright Chromium, and pytest for backend changes; also has manual dispatch.
- `backend-linting.yml` — Ruff gate, Black check, MyPy check.
- `codeql.yml` — weekly and PR/push JavaScript CodeQL scan.
- `submit-record.yml` and `sweep-stuck-rows.yml` — Pillar 3a submission path and stuck-row recovery; see [submission-automation.md](submission-automation.md).
- `submit-prototype.yml` — prototype submission workflow without production SFTP credentials.
- `maintenance.yml` — out-of-band enrichment and sync jobs; see [maintenance-automation.md](maintenance-automation.md).
- `deploy.yml` — manual full-site SFTP push; see [deploy-and-hosting.md](deploy-and-hosting.md).
- `post-merge.yml` — dashboard notification hook, inert unless `DASHBOARD_WEBHOOK_URL` is set.
- `claude.yml` and `claude-code-review.yml` — trusted-author agent hooks and review automation.

## Current test coverage notes

The current suite includes wiki service/UI checks, route vocabulary checks, service-worker routing/cache checks, IndexedDB cache checks, URL canonicalization, CSV injection guards, data explorer/data viz security, record deep links, standalone dissertation tool paths, and preview-audit error handling.

`tests/version-consistency.test.js` is strong for `index.html` and `frontend/**.js`, but release sweeps still need a human pass through dissertation pages, feature pages, CSS imports, and any standalone assets outside the enforced scope.
