# Wiki scaffold hardening plan

- [x] Preserve the read-only wiki scaffold instead of enabling editing before moderation exists.
- [x] Add a stricter wiki data contract: accepted page kinds, moderation states, slug format, safe reference URLs, and no dangling related page links.
- [x] Refactor wiki helpers so routing, link generation, page normalization, indexing, and validation are testable outside React.
- [x] Harden the public wiki UI: remove deployment-fragile docs links, add unknown-page handling, use safer external-link attributes, and keep source labels explicit.
- [x] Expand the spec with architecture, acceptance criteria, threat model, storage options, rollout gates, review checklist, and verification strategy.
- [x] Capture the lesson from the requested rework.
- [x] Run adversarial review, targeted tests, frontend tests, full tests, and available static checks.
- [x] Commit the hardening pass and update the pull request record.

## Review notes

Second pass addressed adversarial findings: dangling related links, missing-slug handling, unsafe reference URLs, wiki cold-load archive fetches, route-param round trips, mobile navigation, and numeric HTM guards. Targeted tests, frontend tests, full tests, and git diff whitespace checks passed. Browser screenshot verification remains blocked because the Playwright CDN returns 403 for Chromium downloads.
