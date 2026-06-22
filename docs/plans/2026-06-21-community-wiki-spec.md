# Community wiki spec and roadmap

## Issue

Issue 499 asks for a public wiki for archive records, concepts, entities, and related information. The first useful step is a read-only scaffold that proves the route, page model, search shape, and editorial policy before public editing is connected.

## Research notes

- MediaWiki's mature patterns separate ordinary page editing from administrator powers such as page protection and rollback. The archive wiki should copy the separation: editors can propose changes; moderators can protect, revert, and handle reports.
- MediaWiki rollback is powerful but easy to misunderstand when a diff spans multiple edits, so the archive wiki should show exactly which revision will become current before a revert is submitted.
- Wikidata's item model is useful for archive concepts and entities because it stores structured statements as property-value pairs, with optional qualifiers, references, and ranks. The archive should keep prose pages, but store relationships as structured fields so search, related panels, and record links do not depend on parsing markdown.
- Wikipedia's content rules are a good safety baseline for community contributions: claims should be attributable to reliable published sources, avoid original research, and avoid new synthesis. For this archive, archive records can be primary sources for what Rosen said or published, but interpretive claims should cite secondary sources when possible.
- Static-site constraints matter. The production frontend is zero-build and cache-first for JavaScript, so a public wiki can safely launch as read-only data plus frontend rendering. Editing needs a separate authenticated write service later; it should not be faked with local storage.

## Product principles

1. Public readers should never need an account.
2. Community text must be labeled as community-contributed content.
3. Every claim that is likely to be challenged needs a source.
4. Relationships should be structured, not only embedded in prose.
5. Revision history should be append-only.
6. Moderation tools must ship before open editing.
7. The wiki should deepen archive discovery, not become a second unsourced biography site.

## MVP shipped in this scaffold

- `#wiki` route in the existing hash router.
- Wiki landing page with search and kind filters.
- Seed wiki data for concepts and entities.
- Detail pages with summary, aliases, body sections, related concepts, related entities, references, contributors, last updated date, and revision count.
- Read-only contribution policy preview.
- Service layer that can be replaced with an API-backed source later.
- Tests for route vocabulary, seed schema, and search helpers.

## Data model

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
  "lastUpdated": "2026-06-21",
  "revisionCount": 1,
  "moderationState": "seed"
}
```

### Future revision

```json
{
  "id": "rev_01j...",
  "pageId": "wiki-concept-public-journalism",
  "parentRevisionId": "rev_01i...",
  "authorId": "user_123",
  "authorDisplayName": "Jane editor",
  "createdAt": "2026-06-21T16:00:00Z",
  "summary": "Added source for civic journalism alias.",
  "status": "current",
  "sourceRequirementAccepted": true,
  "content": { "title": "...", "body": [] }
}
```

### Future report

```json
{
  "id": "report_01j...",
  "pageId": "wiki-concept-public-journalism",
  "revisionId": "rev_01j...",
  "reporterId": "user_456",
  "reason": "unsourced claim",
  "note": "The second paragraph needs a citation.",
  "status": "open",
  "createdAt": "2026-06-21T16:10:00Z"
}
```

## URL design

- `#wiki`: wiki index.
- `#wiki/concept/public-journalism`: concept page.
- `#wiki/entity/jay-rosen`: entity page.
- Future: `#wiki/concept/public-journalism/edit`.
- Future: `#wiki/concept/public-journalism/history`.
- Future: `#wiki/concept/public-journalism/diff/rev_a...rev_b`.

The hash router currently accepts exact route names, so nested wiki hashes are rendered by treating any hash that starts with `wiki/` as the wiki route and letting `WikiPage` read the rest of the hash.

## Editing workflow

1. Reader opens a page.
2. Authenticated user clicks edit.
3. Editor shows the current page body, structured relationship fields, source fields, and contribution guidance.
4. User writes an edit summary and confirms source requirements.
5. Save creates a pending or current revision depending on role/trust.
6. Page view reloads from the current approved revision.
7. History shows all revisions, authors, timestamps, statuses, and summaries.
8. Diff view highlights field-level and body-level changes.

## Moderation workflow

- Any authenticated user can report a page or revision.
- Moderators can mark reports as resolved, duplicate, declined, or needs changes.
- Moderators can soft-lock a page, blocking new edits while preserving public reading.
- Moderators can revert by creating a new revision whose content matches a previous revision. Do not mutate or delete old revisions.
- High-risk pages can require approval before changes go live.

## Permission levels

1. Logged-out reader: read pages and search.
2. Authenticated contributor: create pages, submit edits, report content.
3. Trusted contributor: publish low-risk edits immediately, still subject to rollback.
4. Moderator: revert, soft-lock, resolve reports, approve pending edits.
5. Administrator: manage roles, hard-lock pages, configure policy.

## Source policy

- Archive records can support claims about the content of those records.
- Secondary sources should support broad interpretation, biographies, and claims about influence.
- Unsourced factual claims should remain out of the wiki until sourced.
- Quotations need exact source links and should stay short unless rights are clear.
- Pages about living people need stricter review.

## Roadmap

### Phase 1: read-only foundation

- Add seed data and `#wiki` route.
- Add index, search, filters, and detail pages.
- Document source and moderation policy.
- Add tests.

### Phase 2: archive links

- Add `relatedRecords` for seed pages.
- Add a wiki panel to record modals showing related pages.
- Add outbound record chips to wiki detail pages.
- Add tests for record-to-wiki links.

### Phase 3: revision storage service

- Pick a write backend. Candidate choices: GitHub-backed edits for maintainers, a small authenticated API, or a hosted database with row-level security.
- Store pages, revisions, reports, and locks separately.
- Keep revisions append-only.
- Add API contract tests.

### Phase 4: editor and preview

- Build markdown or block editor.
- Add structured fields for aliases, relationships, and sources.
- Add preview mode.
- Add edit summary and source confirmation.
- Gate save by authentication.

### Phase 5: history, diff, and revert

- Add revision timeline.
- Add field-aware diff view.
- Add moderator revert flow that creates a new revision.
- Add tests for diff and revert display.

### Phase 6: reports and locks

- Add report modal.
- Add moderation queue.
- Add soft-lock state to pages.
- Add role-aware controls.

### Phase 7: trust and quality

- Add contributor profile summaries.
- Add pending-review queues for low-trust contributors.
- Add source-quality warnings.
- Add duplicate and alias merge workflow.

## Open decisions

- Should edits be backed by Git commits, a database, or both?
- Should the first editable namespace be concepts only, leaving living-person entity pages read-only until moderation is proven?
- Should archive records auto-suggest related wiki pages, or should all links be human-curated at first?
- Should wiki content be exported as static JSON during deploy, or fetched from an API at runtime?
