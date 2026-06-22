# Wiki scaffold plan

- [x] Read issue 499 and confirm it is not marked do-not-automate.
- [x] Research wiki product patterns: source-backed content, structured statements, revision history, page protection, rollback, and moderation queues.
- [x] Add read-only wiki route scaffold that works in the zero-build frontend.
- [x] Add seed wiki data and a small service layer that can later be swapped for a write API.
- [x] Add tests for route registration, wiki seed data shape, and wiki search helpers.
- [x] Write the roadmap/spec so the next pass can add authenticated editing without rethinking the model.
- [x] Run targeted and broader checks, review the diff, commit, and open a pull request.

## Review notes

Verification passed for targeted wiki/route tests, frontend tests, and the full node test suite. Browser screenshot verification was blocked because the Playwright browser download returned 403 from the CDN.
