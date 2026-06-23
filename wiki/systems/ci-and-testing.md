---
type: system
title: CI and testing
description: The test commands, GitHub Actions gates, and local preview audit paths that protect the archive.
source: [package.json, tests/, .github/workflows/, AGENTS.md]
verified: 2026-06-23
tags: [ci, tests, validation, github-actions]
timestamp: 2026-06-23
---

# CI and testing

Tests use Node's built-in test runner for frontend/data paths and pytest for backend paths. The repo has both local commands and GitHub Actions gates; use local tests before PRs, then let CI confirm the same surfaces.

## Local commands

- `npm test` — all Node tests in `tests/*.test.js`.
- `npm run test:data` — data integrity, CSV quality, feed titles, CSV unescape, and PressThink dedup checks.
- `npm run test:data:extraction-coverage` — coverage check for extraction gaps.
- `npm run test:pipeline` — data pipeline, thread detection, process-record, and thread algorithm tests.
- `npm run test:frontend` — version consistency, structure, analytics, record deep links, and needs-review checks.
- `npm run preview` — local static preview at `http://127.0.0.1:8000/` by default.
- `npm run preview:audit` — starts preview, walks key routes at mobile and desktop sizes, runs axe, and writes `preview-audit-results/`.

Backend commands run from `backend/` with Poetry:

```bash
poetry install --with dev
poetry run pytest -v --tb=short
poetry run ruff check src/ tests/ submission_server/ scripts/
poetry run black --check src/ tests/
poetry run mypy src/
```

Ruff gates backend CI. Black and MyPy currently report without gating in `backend-linting.yml`.

## GitHub Actions map

- `frontend-validation.yml` — syntax checks, required entry points, frontend tests, data tests, extraction coverage, HTML shape, CDN reference listing, and TODO/FIXME scan.
- `backend-tests.yml` — Poetry install, Playwright Chromium, and pytest for backend changes; also has manual dispatch.
- `backend-linting.yml` — Ruff gate, Black check, MyPy check.
- `codeql.yml` — weekly and PR/push JavaScript CodeQL scan.
- `submit-record.yml` and `sweep-stuck-rows.yml` — Pillar 3a submission path and stuck-row recovery; see [submission-server.md](submission-server.md).
- `submit-prototype.yml` — prototype submission workflow without production SFTP credentials.
- `maintenance.yml` — out-of-band enrichment and sync jobs; see [maintenance-automation.md](maintenance-automation.md).
- `deploy.yml` — manual full-site SFTP push; see [deploy-and-hosting.md](deploy-and-hosting.md).
- `post-merge.yml` — dashboard notification hook, inert unless `DASHBOARD_WEBHOOK_URL` is set.
- `claude.yml` and `claude-code-review.yml` — trusted-author agent hooks and review automation.

## Current test coverage notes

The current suite includes wiki service/UI checks, route vocabulary checks, service-worker routing/cache checks, IndexedDB cache checks, URL canonicalization, CSV injection guards, data explorer/data viz security, record deep links, standalone dissertation tool paths, and preview-audit error handling.

`tests/version-consistency.test.js` is strong for `index.html` and `frontend/**.js`, but release sweeps still need a human pass through dissertation pages, feature pages, CSS imports, and any standalone assets outside the enforced scope.
