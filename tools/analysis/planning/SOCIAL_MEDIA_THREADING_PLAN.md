# Social Media Threading Implementation Plan

**Created:** 2025-12-01
**Status:** Planning
**Priority:** High

## Problem Statement

The archive contains **29,818 records**, of which **16,079 are social media replies** (54%). These replies:
- Have generic titles like "Reply by Jay Rosen"
- Contain minimal content (many are just emojis or short phrases like "Thanks")
- Have no connection to their parent posts
- Flood the archive with low-value content

### Data Origin

The Twitter and Bluesky posts were obtained via **account exports/extractions** of Jay Rosen's complete post history, not by scraping individual URLs. This means:
- Parent post references may exist in original export data but weren't preserved during import
- We can use platform APIs to backfill parent info for existing replies
- Future processing should capture threading info at import time

### Current Data Example

```json
{
  "id": "BSKY-00001",
  "title": "Reply by Jay Rosen",
  "quote": "😎",
  "summary": "Reply by Jay Rosen",
  "relatedIds": []  // Empty - no parent reference
}
```

## Solution Overview

Properly thread replies with their parent posts to:
1. Provide context for replies
2. Group conversations together
3. Filter low-value standalone replies
4. Enable conversation-view browsing

---

## Phase 1: Backend - Bluesky Processor (Quick Win)

### Goal
Create a Bluesky processor that extracts parent post information when scraping replies.

### Implementation

**File:** `backend/src/rosen_scraper/processors/bluesky_processor.py`

**Key Features:**
- Use Bluesky AT Protocol API (public, no auth required for public posts)
- Extract `reply.parent.uri` for replies
- Fetch parent post content
- Store parent reference in output

**API Endpoints:**
- `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread` - Get post with thread context
- `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts` - Get specific posts by URI

**Output Schema Addition:**
```json
{
  "parentPostId": "BSKY-XXXXX",  // ID of parent post in our archive
  "parentPostUri": "at://did:plc:.../app.bsky.feed.post/...",  // AT Protocol URI
  "parentPostContent": "...",  // Cached parent content for display
  "isReply": true,
  "threadDepth": 1  // How deep in thread (1 = direct reply)
}
```

### Dispatcher Update

Update `backend/src/rosen_scraper/dispatcher.py`:
```python
# Bluesky posts
elif re.search(r"bsky\.app/profile/.*/post/", url):
    processor = BlueskyProcessor()
    result = processor.process(url)
    # ... AI analysis
```

---

## Phase 2: Backend - Twitter Processor Enhancement

### Goal
Update existing Twitter processor to extract parent tweet info.

### Implementation

**File:** `backend/src/rosen_scraper/processors/twitter_processor.py`

**Changes to `_parse_nitter_thread()`:**
- Extract reply context from Nitter HTML
- Look for `.replying-to` element
- Store parent tweet ID

**Changes to `_parse_twitter_html()`:**
- Extract `data-reply-to-status-id` attribute
- Capture in-reply-to information from page structure

---

## Phase 3: Schema & Data Export Updates

### Schema Changes

**File:** `backend/schema.json`

Add fields:
```json
{
  "parentPostId": {
    "type": "string",
    "description": "ID of the parent post this is replying to"
  },
  "parentPostUri": {
    "type": "string",
    "description": "Original platform URI of parent post"
  },
  "isReply": {
    "type": "boolean",
    "description": "Whether this is a reply to another post"
  },
  "threadId": {
    "type": "string",
    "description": "ID of the root post in the thread"
  }
}
```

### Data Export Updates

**File:** `csv/export-archive-data.js`

Ensure new fields are included in JSON export.

---

## Phase 4: Frontend - Thread Display

### RecordModal Enhancement

When viewing a reply, show parent context:

```
┌─────────────────────────────────────┐
│ In reply to:                        │
│ ┌─────────────────────────────────┐ │
│ │ [Parent post preview]           │ │
│ │ "Original post content..."      │ │
│ │ - @otheruser · 2025-10-29       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Jay Rosen's reply:                  │
│ "😎"                                │
└─────────────────────────────────────┘
```

### Thread View Component

New component for viewing full conversation threads:
- Expandable thread tree
- Show all replies in context
- Navigate between thread participants

### Archive View Changes

- Group replies with parent posts in grid view
- Show thread indicator on cards that have replies
- "View thread" button on reply cards

---

## Phase 5: Data Migration / Backfill

### Strategy
1. Re-process existing social posts to extract parent info
2. Use Bluesky API to fetch parent posts for existing replies
3. Update `relatedIds` to link replies to parents

### Backfill Script

**File:** `backend/scripts/backfill/thread_backfill.py`

```python
# Pseudocode
for record in social_records:
    if record.title.startswith("Reply"):
        parent_info = fetch_parent_from_api(record.url)
        if parent_info:
            record.parentPostId = find_or_create_parent(parent_info)
            record.isReply = True
```

---

## Success Metrics

1. **Replies with parent context:** Target 80%+ of replies linked to parents
2. **Archive noise reduction:** Meaningful records more visible
3. **User engagement:** Thread view usage metrics

---

## Implementation Order

1. **[QUICK WIN]** Create Bluesky processor with parent extraction
2. Update dispatcher to route Bluesky URLs
3. Add schema fields for threading
4. Update Twitter processor for parent extraction
5. Frontend: Show parent context in RecordModal
6. Backfill existing data
7. Frontend: Full thread view component

---

## Technical Notes

### Bluesky AT Protocol

- Public API requires no authentication
- Post URIs format: `at://did:plc:xxx/app.bsky.feed.post/yyy`
- Thread endpoint returns full context (parents + replies)

### Rate Limits

- Bluesky public API: ~3000 requests/5 min
- Add exponential backoff for bulk processing

### Error Handling

- Parent post may be deleted → store cached content
- API may be unavailable → queue for retry
- Private accounts → mark as "parent unavailable"
