# Live archive design improvement spec plan

- [x] Inspect the live Rosen Archive across desktop and mobile viewports.
- [x] Capture notes on layout, typography, color, navigation, search, filters, cards, and record interactions.
- [x] Review open GitHub issues with `do-not-automate` excluded.
- [x] Write a sentence-case design improvement spec with evidence, priorities, acceptance criteria, and rollout guidance.
- [x] Run documentation checks and review the diff.
- [x] Commit the spec and create a pull request record.

## Review notes

Documentation checks, frontend tests, and the full Node test suite passed. Browser screenshot verification remains blocked because the Playwright CDN returns 403 for Chromium downloads in this environment.

# Read-only WebMCP pilot

- [x] Confirm the current site-tools contract in official OpenAI documentation.
- [x] Inspect the archive data, search, record-detail, entity, and version interfaces.
- [x] Add regression tests for tool registration, search, record details, and related entities.
- [x] Register four read-only archive tools with progressive browser support detection.
- [x] Bump the deploy version and document the site-tools surface.
- [x] Run targeted frontend tests and the full test suite.
- [x] Review every changed line and record the result below.

## Review notes

The eight site-tool tests, 453 frontend tests, and 1,589 full repository tests pass.
The browser registers and invokes all four read-only tools against the real archive data.
The browser reports no page errors. The production dependency audit reports no vulnerabilities.
The full audit still reports the four development-only advisories covered by the issue #804 accepted-risk record.
