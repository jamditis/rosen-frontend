# Community wiki spec and roadmap

## Issue

Issue 499 asks for a public wiki for archive records, concepts, entities, and related information. The first useful step is a read-only scaffold that proves the route, page model, search shape, data contract, and editorial policy before public editing is connected.

## Research notes

- MediaWiki separates ordinary page editing from administrator powers such as page protection and rollback. The archive wiki should keep that separation: contributors can propose changes; moderators can protect, revert, and handle reports.
- MediaWiki rollback can confuse editors when a diff spans multiple edits, so the archive wiki should show exactly which revision will become current before a revert is submitted.
- Wikidata's item model is useful for archive concepts and entities because it stores structured statements as property-value pairs, with optional qualifiers, references, and ranks. The archive should keep prose pages, but store relationships as structured fields so search, related panels, and record links do not depend on parsing markdown.
- Wikipedia's content rules are a useful safety baseline for community contributions: claims should be attributable to reliable published sources, avoid original research, and avoid new synthesis. For this archive, archive records can be primary sources for what Rosen said or published, but interpretive claims should cite secondary sources when possible.
- Static-site constraints matter. The production frontend is zero-build and cache-first for JavaScript, so a public wiki can safely launch as read-only data plus frontend rendering. Editing needs a separate authenticated write service later; it should not be faked with local storage.

## Product principles

1. Public readers should never need an account.
2. Community text must be labeled as community-contributed content.
3. Every claim that is likely to be challenged needs a source.
4. Relationships should be structured, not only embedded in prose.
5. Revision history should be append-only.
6. Moderation tools must ship before open editing.
7. The wiki should deepen archive discovery, not become a second unsourced biography site.
8. Read performance should not depend on loading the full archive data set unless a wiki screen needs record-backed context.
9. Graph navigation must be local-first: one hop by default, two hops as expansion, and any global graph is a filterable opt-in.
10. Staleness must be visible per page through a freshness badge derived from last-updated/source metadata or OKF `verified`/`source` metadata.

## Phase 1 acceptance criteria

- A logged-out visitor can open `#wiki` and see a wiki landing page.
- A logged-out visitor can search by title, alias, summary, body text, and page kind.
- A logged-out visitor can filter by page kind.
- A logged-out visitor can open each seed concept/entity/topic page by slug.
- A missing or malformed wiki slug renders a useful not-found state without breaking the app.
- Every seed page has a title, kind, slug, summary, at least one body section, contributor attribution, revision count, last-updated date, and moderation state.
- Every related concept/entity slug points to a seed page that exists.
- Every public reference URL uses `http:` or `https:`.
- Every page and result card shows freshness state.
- Community-contributed labeling appears on every wiki surface.
- The wiki route works with the existing hash router and does not break existing routes.
- A cold `#wiki` deep link does not fetch archive core data or preload archive details.
- Route, schema, search, slug, safety, and frontend tests pass.

## Current scaffold

- `#wiki` route in the existing hash router.
- Wiki landing page with search and kind filters.
- Seed wiki data for concepts and entities.
- Detail pages with summary, aliases, body sections, related concepts, related entities, references, contributors, last updated date, and revision count.
- Read-only contribution policy preview.
- Service layer that validates, normalizes, indexes, filters, and links wiki pages.
- Tests for route vocabulary, seed schema, relationship integrity, safe references, slug parsing, search helpers, and frontend wiring.

## Data contract

### Valid page kinds

- `concept`: ideas, terms, debates, frames, and theories.
- `entity`: people, organizations, publications, projects, and works.
- `topic`: looser grouping pages that may later become tags or curated collections.

### Valid moderation states

- `seed`: committed seed content shipped with the static site.
- `draft`: created but not ready for review.
- `pending`: waiting for moderation.
- `approved`: current public community content.
- `locked`: public but not editable except by moderators.

### Slug rules

- Slugs must match `^(concept|entity|topic)/[a-z0-9]+(?:-[a-z0-9]+)*$`.
- Slugs are stable URLs.
- Rename support must use redirects instead of breaking old links.
- Duplicate pages should be merged through a moderator-reviewed merge flow.

### Page

```json
{
  "id": "wiki-concept-public-journalism",
  "slug": "concept/public-journalism",
  "kind": "concept",
  "title": "Public journalism",
  "summary": "Short source-backed overview.",
  "aliases": ["Civic journalism"],
  "body": [{ "heading": "Why it matters here", "text": "..." }],
  "relatedConcepts": ["concept/press-public-relationship"],
  "relatedEntities": ["entity/jay-rosen"],
  "relatedRecords": ["record-id"],
  "references": [{ "label": "Source label", "url": "https://example.com" }],
  "contributors": ["display name"],
  "lastUpdated": "2026-06-22",
  "revisionCount": 1,
  "moderationState": "seed"
}
```

### Structured statement

```json
{
  "id": "stmt_01j...",
  "pageId": "wiki-concept-public-journalism",
  "property": "related_to",
  "value": "concept/press-public-relationship",
  "qualifiers": [],
  "references": ["ref_01j..."],
  "rank": "normal"
}
```

### Reference

```json
{
  "id": "ref_01j...",
  "label": "Source label",
  "url": "https://example.com",
  "accessedAt": "2026-06-22",
  "supports": ["section-or-statement-id"]
}
```

### Revision

```json
{
  "id": "rev_01j...",
  "pageId": "wiki-concept-public-journalism",
  "parentRevisionId": "rev_01i...",
  "authorId": "user_123",
  "authorDisplayName": "Jane editor",
  "createdAt": "2026-06-22T16:00:00Z",
  "summary": "Added source for civic journalism alias.",
  "status": "current",
  "sourceRequirementAccepted": true,
  "content": { "title": "...", "body": [] }
}
```

### Report

```json
{
  "id": "report_01j...",
  "pageId": "wiki-concept-public-journalism",
  "revisionId": "rev_01j...",
  "reporterId": "user_456",
  "reason": "unsourced claim",
  "note": "The second paragraph needs a citation.",
  "status": "open",
  "createdAt": "2026-06-22T16:10:00Z"
}
```

### Lock

```json
{
  "pageId": "wiki-concept-public-journalism",
  "type": "soft",
  "reason": "high-risk page",
  "createdBy": "user_789",
  "createdAt": "2026-06-22T16:15:00Z",
  "expiresAt": null
}
```

## URL design

- `#wiki`: wiki index.
- `#wiki/concept/public-journalism`: concept page.
- `#wiki/entity/jay-rosen`: entity page.
- Future: `#wiki/concept/public-journalism/edit`.
- Future: `#wiki/concept/public-journalism/history`.
- Future: `#wiki/concept/public-journalism/diff/rev_a...rev_b`.

The shared view-state contract should preserve wiki detail slugs through `routeParams.wikiSlug` so future share-link and provider code does not collapse detail URLs to the wiki index.

## Namespace policy

### `concept/*`

- Public editing can launch here first.
- Interpretive claims require sources.
- Archive records may support claims about archive contents.
- New claims that synthesize multiple records need secondary sources or moderator review.

### `entity/*`

- Living-person pages require stricter review.
- New edits from non-moderators enter pending review.
- Biographical claims require reliable secondary sources.
- Pages can be locked if reports or disputes exceed moderator capacity.

### `record/*` future namespace

- Should not duplicate archive record metadata.
- Used only for annotations, context, source notes, and source-backed commentary.
- Record pages should link back to canonical archive records.

## Backend decision criteria

The write backend must support:

- Append-only revisions.
- Moderation status transitions.
- Role-based permissions enforced server-side.
- Report and lock records.
- Public read performance compatible with the static frontend.
- Export to static JSON for deploys or cache warming.
- Backup and restore.
- Rate limits, spam controls, and account blocking.
- Audit logs for moderator actions.

| Option | Pros | Cons | Best first use |
| --- | --- | --- | --- |
| Git-backed edits | Reviewable, familiar, durable | Poor fit for low-friction public editing | Maintainer-only bootstrap |
| Authenticated API plus database | Flexible and role-aware | More operations and security work | Public editing |
| Hybrid static export | Fast public reads and stable deploys | Requires sync/export process | Public reading with controlled writes |

## Security requirements

- Wiki body content must be rendered through an allowlisted markdown or block renderer.
- Raw HTML is disallowed unless explicitly sanitized.
- All write requests require authentication.
- Role checks happen server-side, not only in the frontend.
- Public edit, report, login, and search endpoints are rate-limited.
- Moderator actions are audit-logged.
- Revert, lock, unlock, approve, decline, and role changes require explicit confirmation.
- Titles, aliases, summaries, references, and body sections must be tested for stored XSS.
- Reference URLs allow only `http:` and `https:` unless a future policy adds a named exception.

## Source policy

Acceptable:

- “In this archive record, Rosen argues X” with a direct archive record link.
- “The project was described by [publication] as Y” with a reliable secondary source.

Needs secondary source:

- Claims about influence, reception, biography, controversy, or historical importance.

Not acceptable:

- Original interpretation that combines multiple archive records into a new conclusion.
- Unsourced biographical claims.
- Long copyrighted quotations without rights clearance.

## Contributor experience requirements

- Editors see source requirements before saving.
- Editors must provide an edit summary.
- Editors see whether an edit is live, pending review, declined, or needs changes.
- If the page changed since editing began, the editor sees a conflict resolution screen.
- Preview clearly distinguishes unsaved content from live content.
- Rejection and needs-changes notices include moderator notes.
- New contributors see examples of acceptable sources and unacceptable original synthesis.

## Navigation and trust requirements

- Do not use a global force graph as the default discovery surface.
- Page detail views may show a local graph with one hop by default and two hops as an expansion.
- The global graph, if added, must be an explicit view with filters for kind, moderation state, freshness, relationship type, and text search.
- Graph labels should be gated by zoom level and node degree, not always-on.
- Every wiki page, result card, related-page chip, and graph node should expose freshness state.
- Freshness should include date, source/reference count, and a clear stale/unknown state.
- Staleness must not be hidden behind a history tab.

## Moderator experience requirements

- Moderators have a queue filtered by report reason, page kind, age, and status.
- Moderators can compare pending edits against the current revision.
- Revert screens show the target revision and resulting page before submission.
- Lock screens require reason, scope, and optional expiration.
- All moderator actions require notes and are audit-logged.
- Moderator decisions are visible to other moderators.

## Risk register

| Risk | Likelihood | Impact | Mitigation | Launch gate |
| --- | --- | --- | --- | --- |
| Spam or vandalism | High | High | Authentication, rate limits, moderation queue, rollback | Required before public editing |
| Unsourced living-person claims | Medium | High | Pending review for living-person entity pages | Required before entity editing |
| Copyrighted long quotes | Medium | High | Quote guidance, report reason, moderator removal flow | Required before public editing |
| Moderator overload | High | Medium | Invite-only beta, queue limits, notifications | Required before beta |
| Stored XSS through wiki content | Medium | High | Sanitized renderer and regression tests | Required before editor launch |
| Broken cache freshness | Medium | Medium | API cache headers or static export versioning | Required before runtime reads |

## Static frontend and caching requirements

- Public wiki reads must tolerate stale static assets.
- Runtime API responses must not be cached indefinitely by the service worker.
- If wiki JSON is exported during deploy, the export process must include a version marker.
- If wiki data is fetched at runtime, API responses must include cache headers and stale-data behavior.
- The UI must show last-updated timestamps and distinguish seed/static content from live community content.
- Non-record-backed wiki routes should not load archive core data on first paint.

## Verification strategy

### Static/read-only

- Unit tests for wiki search, filtering, slug lookup, and missing-page states.
- Schema tests for seed data.
- Referential-integrity tests for related page slugs.
- Safe-reference tests for wiki URLs.
- Route tests for `#wiki` and nested wiki hashes.
- Accessibility audit for landing and detail pages.
- Screenshot review for mobile and desktop layouts.

### Editing

- Integration tests for create, edit, save, and preview.
- API contract tests for pages, revisions, reports, locks, and users.
- Authorization tests for each permission level.
- Validation tests for required sources, edit summaries, and structured relationships.
- XSS regression tests for all rendered text fields.

### Moderation

- Scenario tests for report, approve, decline, revert, soft-lock, hard-lock, and duplicate report handling.
- Tests proving revert creates a new revision and never mutates historical revisions.
- Tests proving locked pages remain readable.
- Tests proving high-risk pages require review.

### Operations

- Backup/restore rehearsal.
- Static export/runtime API freshness test.
- Cache invalidation test.
- Rate-limit and spam-control smoke tests.

## Roadmap

### Phase 1: read-only foundation

Purpose:
- Prove the route, data contract, UI, and policy boundaries without accepting public writes.

Dependencies:
- Static seed JSON.
- Hash router support for nested wiki slugs.

Build scope:
- Index, search, kind filters, detail pages, validation tests, and source policy.

Out of scope:
- Public editing, authenticated accounts, moderation queue, and write storage.

Launch gate:
- Phase 1 acceptance criteria pass.

Rollback plan:
- Remove wiki navigation links and keep the seed JSON unused until fixed.

### Phase 2: archive links

Purpose:
- Connect wiki pages to archive records without duplicating record metadata.

Dependencies:
- Curated `relatedRecords` values.
- Record modal/wiki panel design.

Build scope:
- Record chips on wiki pages and a wiki panel in record modals.

Out of scope:
- Automated relationship inference as a source of truth.

Launch gate:
- Every record link resolves to an existing record.

Rollback plan:
- Hide record chips while keeping wiki pages readable.

### Phase 3: revision storage service

Purpose:
- Pick and prove the write backend before building editor UI.

Dependencies:
- Backend decision criteria resolved.
- Authentication and authorization model reviewed.

Build scope:
- Pages, revisions, reports, locks, roles, API contract tests, backup/restore rehearsal.

Out of scope:
- Public editing before moderation controls exist.

Launch gate:
- Append-only revision writes, role checks, backups, and audit logs pass tests.

Rollback plan:
- Disable write endpoints and keep read-only static export online.

### Phase 4: editor and preview

Purpose:
- Let invited contributors propose edits with preview, source prompts, and edit summaries.

Dependencies:
- Revision storage service.
- Authenticated user identity.

Build scope:
- Editor, preview, conflict detection, source fields, edit summary, pending-review state.

Out of scope:
- Open public editing.

Launch gate:
- Invited contributors can submit edits and see review status.

Rollback plan:
- Disable editor entry points and leave pending revisions in storage.

### Phase 5: history, diff, and revert

Purpose:
- Make changes inspectable and safely reversible.

Dependencies:
- Revision storage service with immutable history.

Build scope:
- Revision timeline, field-aware diff view, revert confirmation, moderator notes.

Out of scope:
- Bulk moderation automation.

Launch gate:
- Moderator can preview and confirm the exact revision that will become current; old revisions remain unchanged.

Rollback plan:
- Hide revert controls while preserving read-only history.

### Phase 6: reports and locks

Purpose:
- Give moderators the controls required before broader public editing.

Dependencies:
- Reports, locks, audit log, notification rules.

Build scope:
- Report modal, moderation queue, soft locks, hard locks, decision notes, duplicate reports.

Out of scope:
- Public editing without queue capacity.

Launch gate:
- Report, lock, unlock, approve, decline, and revert flows pass scenario tests.

Rollback plan:
- Pause public submissions and continue moderator-only edits.

### Phase 7: trust and quality

Purpose:
- Scale beyond invited contributors without sacrificing source quality.

Dependencies:
- Moderation queue metrics and abuse controls.

Build scope:
- Contributor trust levels, source-quality warnings, duplicate/alias merge workflow, queue limits.

Out of scope:
- Anonymous public editing.

Launch gate:
- Moderators can keep queues within agreed response-time limits during beta.

Rollback plan:
- Return to invite-only contribution mode.

## Open decisions

- Should edits be backed by Git commits, a database, or both?
- Should the first editable namespace be concepts only, leaving living-person entity pages read-only until moderation is proven?
- Should archive records auto-suggest related wiki pages, or should all links be human-curated at first?
- Should wiki content be exported as static JSON during deploy, or fetched from an API at runtime?
- What moderation capacity is available for an invite-only beta?

## Review checklist

- Does every new wiki field have a validation rule?
- Does every relationship point to an existing object or intentionally remain empty?
- Does the UI fail visibly on missing pages or bad data?
- Does the route state preserve wiki slugs through parsing and serialization?
- Can the feature be disabled without breaking the archive?
- Are source, moderation, and security requirements visible before editable work begins?
