# Unified Threading & Relationship Mapping Roadmap

**Created:** 2025-12-03
**Status:** Planning Phase
**Priority:** High

## Cross-Reference: Related Documentation

This roadmap consolidates and supersedes:
- `/tools/analysis/planning/SOCIAL_MEDIA_THREADING_PLAN.md` - Original threading plan (Dec 1)
- `/data/IMPLEMENTATION_PLAN.md` - Data loading optimization plan
- `/backend/SOCIAL_POSTS_THREADING_PLAN.md` - Detailed threading analysis (Dec 3)
- `/backend/entity_extraction_schema_v3.json` - Entity/relationship schema

**Existing Infrastructure:**
- Entity extractor: `backend/src/rosen_scraper/entity_extractor.py`
- Entity deduplicator: `backend/src/rosen_scraper/entity_deduplicator.py`
- Entity registry: `backend/src/rosen_scraper/entity_registry.py`
- Batch processor: `backend/src/rosen_scraper/entity_extraction_batch_processor.py`

## Executive Summary

**Goal:** Transform 29,187 isolated social media posts into a connected knowledge graph by:
1. Reconstructing conversation threads (Twitter & Bluesky)
2. Extracting entities and relationships from post content
3. Linking posts to main archive records via shared topics/entities
4. Generating comprehensive relationship data for navigation/visualization

**Current State:**
- 29,187 social posts (26,116 Twitter + 3,071 Bluesky)
- 659 main archive records (+ 200 pending: Tumblr & clippings)
- 7,500 existing relationships (incomplete, main archive only)
- Bluesky: 67.7% have parent threading
- Twitter: 0% have threading metadata (but 65.5% are replies)

**Target State:**
- >90% of posts linked to thread parents
- >50,000 total relationships (threads + topics + cross-references)
- All 29K+ social posts entity-analyzed with v3 schema
- Unified `all_relationships.csv` combining threads + entities + archive links

---

## Phase 1: Thread Reconstruction

### 1.1 Bluesky Thread Mapping (Quick Win)

**Status:** Mostly done in data, needs formalization

**Task:** Parse existing AT protocol URIs and build thread hierarchy.

**Implementation:**
```python
# File: backend/scripts/reconstruct_bluesky_threads.py

import csv
import json
import re

def parse_at_uri(uri):
    """
    Extract components from AT protocol URI.
    Example: at://did:plc:xyz/app.bsky.feed.post/abc123
    Returns: {did: "did:plc:xyz", rkey: "abc123"}
    """
    pattern = r'at://([^/]+)/app\.bsky\.feed\.post/(\w+)'
    match = re.match(pattern, uri)
    if match:
        return {"did": match.group(1), "rkey": match.group(2)}
    return None

def build_bluesky_threads(posts_csv):
    """
    Build thread hierarchy from Bluesky posts.
    """
    # Load all Bluesky posts
    posts = {}
    with open(posts_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row['platform'] == 'Bluesky':
                posts[row['id']] = row

    # Build parent-child mapping
    threads = {}
    for post_id, post in posts.items():
        parent_uri = post.get('responds_to')
        if parent_uri:
            parent_info = parse_at_uri(parent_uri)
            # Find parent post by matching rkey in URL
            parent_id = find_parent_by_rkey(posts, parent_info['rkey'])
            threads[post_id] = {
                'parent_id': parent_id,
                'parent_uri': parent_uri,
                'depth': calculate_depth(threads, parent_id)
            }

    return threads
```

**Output:** `backend/thread_mappings_bluesky.json`

**Estimated Time:** 2-3 hours

---

### 1.2 Twitter Thread Reconstruction (Complex)

**Status:** Not started

**Challenge:** No thread metadata in data. Must infer from URLs and content.

**Approach:** Multi-strategy heuristic

#### Strategy A: URL Proximity Analysis

Twitter status IDs are roughly chronological snowflake IDs. Replies often have IDs close to their parents.

```python
def extract_status_id(url):
    """Extract status ID from Twitter URL"""
    match = re.search(r'/status/(\d+)', url)
    return int(match.group(1)) if match else None

def find_likely_parent_by_proximity(reply_id, all_posts, time_window=3600):
    """
    Find posts within ±1 hour that might be parents.
    Status IDs are roughly chronological.
    """
    reply_timestamp = snowflake_to_timestamp(reply_id)
    candidates = []

    for post in all_posts:
        post_id = extract_status_id(post['url'])
        if not post_id:
            continue
        post_timestamp = snowflake_to_timestamp(post_id)

        # Parent must be BEFORE reply
        if post_timestamp < reply_timestamp:
            time_diff = reply_timestamp - post_timestamp
            if time_diff <= time_window:
                candidates.append((post, time_diff))

    # Return closest in time
    return min(candidates, key=lambda x: x[1])[0] if candidates else None
```

#### Strategy B: @Mention Analysis

Replies starting with `@username` are likely responses to that user's posts.

```python
def extract_mentions(text):
    """Extract @mentions from tweet text"""
    return re.findall(r'@(\w+)', text)

def find_parent_by_mention(reply, all_posts):
    """
    If reply starts with @username, look for recent posts by that user.
    """
    mentions = extract_mentions(reply['raw_text'])
    if not mentions:
        return None

    first_mention = mentions[0]

    # Find recent posts by mentioned user
    candidates = [
        p for p in all_posts
        if first_mention.lower() in p.get('author', '').lower()
        and p['publication_date'] < reply['publication_date']
    ]

    # Return most recent
    return max(candidates, key=lambda p: p['publication_date']) if candidates else None
```

#### Strategy C: Content Similarity (Fallback)

For posts without clear parents via A/B, use semantic similarity.

```python
from sentence_transformers import SentenceTransformer

def find_parent_by_similarity(reply, all_posts, threshold=0.6):
    """
    Use sentence embeddings to find semantically similar posts.
    """
    model = SentenceTransformer('all-MiniLM-L6-v2')

    reply_embedding = model.encode(reply['raw_text'])

    candidates = []
    for post in all_posts:
        if post['publication_date'] < reply['publication_date']:
            post_embedding = model.encode(post['raw_text'])
            similarity = cosine_similarity(reply_embedding, post_embedding)
            if similarity >= threshold:
                candidates.append((post, similarity))

    return max(candidates, key=lambda x: x[1])[0] if candidates else None
```

**Combined Implementation:**

```python
def reconstruct_twitter_thread(reply, all_posts):
    """
    Try strategies in order: Proximity → Mention → Similarity
    """
    # Strategy A: Proximity (high confidence)
    parent = find_likely_parent_by_proximity(reply, all_posts)
    if parent:
        return parent, 0.8  # confidence score

    # Strategy B: @Mention (medium confidence)
    parent = find_parent_by_mention(reply, all_posts)
    if parent:
        return parent, 0.6

    # Strategy C: Similarity (low confidence)
    parent = find_parent_by_similarity(reply, all_posts)
    if parent:
        return parent, 0.5

    return None, 0.0
```

**Output:** `backend/thread_mappings_twitter.json`

**Estimated Time:** 5-7 hours (includes testing/validation)

---

### 1.3 Thread Hierarchy Generation

**Task:** Convert parent-child mappings into full thread trees.

```python
def build_thread_hierarchy(thread_mappings):
    """
    Build complete thread trees from parent-child mappings.
    """
    # Find all root posts (no parents)
    roots = [post_id for post_id, data in thread_mappings.items()
             if data.get('parent_id') is None]

    threads = {}
    for root in roots:
        thread_id = f"THREAD-{root}"
        tree = build_tree_from_root(root, thread_mappings)
        threads[thread_id] = {
            'root_post_id': root,
            'total_posts': count_nodes(tree),
            'max_depth': calculate_max_depth(tree),
            'participants': extract_participants(tree),
            'tree': tree
        }

    return threads
```

**Output:** `backend/thread_hierarchies.json`

**Estimated Time:** 2-3 hours

**Success Metrics:**
- [ ] >90% of Bluesky replies mapped to parents
- [ ] >75% of Twitter replies mapped to parents (heuristic, lower confidence)
- [ ] Thread IDs assigned to all connected posts
- [ ] Max thread depth calculated (expect 5-10 for long threads)

---

## Phase 2: Entity & Relationship Extraction

### 2.1 Run Entity Extraction on Social Posts

**Status:** Infrastructure exists, needs execution

**Existing Tools:**
- `backend/src/rosen_scraper/entity_extractor.py`
- `backend/src/rosen_scraper/entity_extraction_batch_processor.py`
- Schema: `backend/entity_extraction_schema_v3.json`

**Task:** Adapt batch processor for social posts

```python
# File: backend/scripts/extract_entities_from_social_posts.py

from src.rosen_scraper.entity_extraction_batch_processor import BatchProcessor
import csv

def prepare_social_posts_for_extraction(posts_csv):
    """
    Convert social posts CSV to format expected by entity extractor.
    """
    records = []
    with open(posts_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Only extract from substantive posts (>10 words)
            word_count = int(row.get('word_count', 0))
            if word_count >= 10:
                records.append({
                    'record_id': row['id'],
                    'title': row['title'],
                    'content': row['raw_text'],
                    'author': row['author'],
                    'publication_date': row['publication_date'],
                    'platform': row['platform']
                })

    return records

def main():
    posts = prepare_social_posts_for_extraction('data/social_posts.csv')

    # Filter: Only posts with >10 words (skip "😎", "Thanks", etc.)
    substantive_posts = [p for p in posts if len(p['content'].split()) >= 10]

    print(f"Processing {len(substantive_posts)} substantive posts (out of {len(posts)} total)")

    processor = BatchProcessor(
        schema_path='backend/entity_extraction_schema_v3.json',
        output_dir='backend/output/social_entities/'
    )

    processor.process_batch(substantive_posts, batch_size=100)

if __name__ == '__main__':
    main()
```

**Filtering Strategy:**
- Only extract from posts with ≥10 words (excludes "😎", "Thanks", "@user ok")
- Prioritize posts with high engagement (likes, reposts)
- Estimate: ~15,000 posts meet threshold (out of 29K)

**Output:**
- `backend/output/social_entities/entities.csv`
- `backend/output/social_entities/relationships.csv`

**Estimated Time:** 15-20 hours (AI API calls + processing)

**Cost Estimate:** ~$50-100 in Gemini API calls (15K posts × $0.003-0.007 per post)

---

### 2.2 Generate Thread Relationships

**Task:** Convert thread mappings into relationship records.

```python
# File: backend/scripts/generate_thread_relationships.py

def generate_thread_relationships(thread_hierarchies):
    """
    Create relationship records from thread hierarchies.
    """
    relationships = []
    rel_id = 1

    for thread_id, thread_data in thread_hierarchies.items():
        root_id = thread_data['root_post_id']

        # Traverse tree and create relationships
        def traverse(node, depth=0):
            nonlocal rel_id

            if node.get('parent_id'):
                # REPLIES_TO relationship
                relationships.append({
                    'relationship_id': f'{node["post_id"]}_REL_{rel_id:03d}',
                    'source_record_id': node['post_id'],
                    'source_entity_id': '',  # N/A for thread rels
                    'source_entity_name': '',
                    'relationship_type': 'REPLIES_TO',
                    'target_entity_id': '',
                    'target_entity_name': '',
                    'target_record_id': node['parent_id'],
                    'context_snippet': f'Reply in thread {thread_id}',
                    'confidence_score': node.get('confidence', 1.0),
                    'extracted_date': datetime.now().strftime('%Y-%m-%d')
                })
                rel_id += 1

            # PART_OF_THREAD relationship
            if node['post_id'] != root_id:
                relationships.append({
                    'relationship_id': f'{node["post_id"]}_REL_{rel_id:03d}',
                    'source_record_id': node['post_id'],
                    'relationship_type': 'PART_OF_THREAD',
                    'target_record_id': root_id,
                    'context_snippet': f'Thread member, depth={depth}',
                    'confidence_score': 1.0,
                    'extracted_date': datetime.now().strftime('%Y-%m-%d')
                })
                rel_id += 1

            # Recurse to children
            for child in node.get('children', []):
                traverse(child, depth + 1)

        traverse(thread_data['tree'])

    return relationships
```

**Output:** `backend/output/thread_relationships.csv`

**Estimated Time:** 1-2 hours

**Expected Relationships:** ~40,000-50,000 (2 per reply: REPLIES_TO + PART_OF_THREAD)

---

### 2.3 Generate Topical Relationships (Cross-Thread)

**Task:** Find posts discussing same topics across different threads.

**Approach:** Shared entity matching + semantic similarity

```python
# File: backend/scripts/generate_topical_relationships.py

def generate_topical_relationships(posts, entities, similarity_threshold=0.75):
    """
    Create DISCUSSES_SAME_TOPIC relationships between posts.
    """
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer('all-MiniLM-L6-v2')

    # Build entity index
    entity_index = build_entity_index(entities)

    relationships = []

    # For each post, find related posts via:
    # 1. Shared entities (high confidence)
    # 2. Semantic similarity (medium confidence)

    for i, post_a in enumerate(posts):
        post_a_entities = entity_index.get(post_a['id'], [])

        # Find posts with overlapping entities
        for post_b in posts[i+1:]:  # Only compare forward (avoid duplicates)
            post_b_entities = entity_index.get(post_b['id'], [])

            shared_entities = set(post_a_entities) & set(post_b_entities)

            if len(shared_entities) >= 2:  # At least 2 shared entities
                relationships.append({
                    'relationship_id': f'{post_a["id"]}_TOP_{len(relationships):05d}',
                    'source_record_id': post_a['id'],
                    'relationship_type': 'DISCUSSES_SAME_TOPIC',
                    'target_record_id': post_b['id'],
                    'context_snippet': f'Shared entities: {", ".join(shared_entities)}',
                    'confidence_score': 0.85,
                    'extracted_date': datetime.now().strftime('%Y-%m-%d')
                })
            elif len(shared_entities) == 1:
                # Check semantic similarity for single-entity matches
                similarity = calculate_similarity(model, post_a['raw_text'], post_b['raw_text'])
                if similarity >= similarity_threshold:
                    relationships.append({
                        'relationship_id': f'{post_a["id"]}_TOP_{len(relationships):05d}',
                        'source_record_id': post_a['id'],
                        'relationship_type': 'DISCUSSES_SAME_TOPIC',
                        'target_record_id': post_b['id'],
                        'context_snippet': f'Shared entity + high similarity ({similarity:.2f})',
                        'confidence_score': similarity,
                        'extracted_date': datetime.now().strftime('%Y-%m-%d')
                    })

    return relationships
```

**Optimization:** Limit to top 10 most similar posts per post (avoid relationship explosion)

**Output:** `backend/output/topical_relationships.csv`

**Estimated Time:** 3-5 hours (compute-intensive)

**Expected Relationships:** ~10,000-20,000 (constrained by top-N limit)

---

### 2.4 Link Social Posts to Main Archive Records

**Task:** Connect social posts to articles, videos, blog posts via shared content.

**Approach:** URL parsing + entity matching + semantic similarity

```python
# File: backend/scripts/link_social_to_archive.py

def link_social_to_archive(social_posts, archive_records, entities):
    """
    Create REFERENCES and RELATED_TO relationships between social posts and archive.
    """
    relationships = []

    # Strategy A: Direct URL references
    for post in social_posts:
        urls = extract_urls(post['raw_text'])
        for url in urls:
            matching_record = find_archive_record_by_url(archive_records, url)
            if matching_record:
                relationships.append({
                    'relationship_id': f'{post["id"]}_ARC_{len(relationships):05d}',
                    'source_record_id': post['id'],
                    'relationship_type': 'REFERENCES',
                    'target_record_id': matching_record['id'],
                    'context_snippet': f'Links to {url}',
                    'confidence_score': 1.0,
                    'extracted_date': datetime.now().strftime('%Y-%m-%d')
                })

    # Strategy B: Entity overlap
    social_entities = build_entity_index(entities, 'social')
    archive_entities = build_entity_index(entities, 'archive')

    for post in social_posts:
        post_entities = social_entities.get(post['id'], [])

        for record in archive_records:
            record_entities = archive_entities.get(record['id'], [])
            shared = set(post_entities) & set(record_entities)

            if len(shared) >= 3:  # At least 3 shared entities
                relationships.append({
                    'relationship_id': f'{post["id"]}_ARC_{len(relationships):05d}',
                    'source_record_id': post['id'],
                    'relationship_type': 'RELATED_TO',
                    'target_record_id': record['id'],
                    'context_snippet': f'Shared entities: {", ".join(shared)}',
                    'confidence_score': 0.80,
                    'extracted_date': datetime.now().strftime('%Y-%m-%d')
                })

    return relationships
```

**Output:** `backend/output/archive_links.csv`

**Estimated Time:** 2-3 hours

**Expected Relationships:** ~5,000-10,000

---

## Phase 3: Relationship Merging & Validation

### 3.1 Merge All Relationship CSVs

**Task:** Combine all relationship sources into single unified file.

**Sources:**
1. `data/extracted_relationships.csv` - Existing main archive (7,500 rows)
2. `backend/output/social_entities/relationships.csv` - Entity-based (from Phase 2.1)
3. `backend/output/thread_relationships.csv` - Thread-based (from Phase 2.2)
4. `backend/output/topical_relationships.csv` - Topical (from Phase 2.3)
5. `backend/output/archive_links.csv` - Cross-reference (from Phase 2.4)

```python
# File: backend/scripts/merge_all_relationships.py

def merge_relationship_csvs(file_paths, output_path):
    """
    Merge multiple relationship CSVs into one unified file.
    """
    all_relationships = []

    for file_path in file_paths:
        with open(file_path) as f:
            reader = csv.DictReader(f)
            all_relationships.extend(list(reader))

    # Deduplicate
    unique_relationships = deduplicate_relationships(all_relationships)

    # Validate
    validated = validate_relationships(unique_relationships)

    # Write unified file
    with open(output_path, 'w', newline='') as f:
        if validated:
            fieldnames = validated[0].keys()
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(validated)

    return len(validated)

def deduplicate_relationships(relationships):
    """
    Remove duplicate relationships (same source + type + target).
    """
    seen = set()
    unique = []

    for rel in relationships:
        key = (rel['source_record_id'], rel['relationship_type'],
               rel.get('target_record_id', rel.get('target_entity_id')))
        if key not in seen:
            seen.add(key)
            unique.append(rel)

    return unique

def validate_relationships(relationships):
    """
    Validate relationship records.
    """
    valid = []
    errors = []

    for rel in relationships:
        # Check required fields
        if not rel.get('source_record_id') or not rel.get('relationship_type'):
            errors.append(f"Missing required field: {rel}")
            continue

        # Check confidence score
        confidence = float(rel.get('confidence_score', 1.0))
        if not 0.0 <= confidence <= 1.0:
            errors.append(f"Invalid confidence score: {confidence}")
            continue

        valid.append(rel)

    if errors:
        print(f"Validation errors: {len(errors)}")
        for error in errors[:10]:  # Show first 10
            print(f"  {error}")

    return valid
```

**Output:** `data/all_relationships.csv`

**Estimated Time:** 1-2 hours

---

### 3.2 Generate Relationship Statistics Report

**Task:** Document what was created.

```python
# File: backend/scripts/generate_relationship_stats.py

def generate_stats_report(relationships_csv):
    """
    Generate comprehensive statistics report.
    """
    from collections import Counter

    rels = load_csv(relationships_csv)

    stats = {
        'total_relationships': len(rels),
        'by_type': Counter(r['relationship_type'] for r in rels),
        'by_source_platform': analyze_source_platforms(rels),
        'by_confidence': {
            'high (0.8-1.0)': sum(1 for r in rels if float(r.get('confidence_score', 1.0)) >= 0.8),
            'medium (0.6-0.8)': sum(1 for r in rels if 0.6 <= float(r.get('confidence_score', 1.0)) < 0.8),
            'low (0.0-0.6)': sum(1 for r in rels if float(r.get('confidence_score', 1.0)) < 0.6)
        },
        'posts_with_relationships': len(set(r['source_record_id'] for r in rels)),
        'avg_relationships_per_post': len(rels) / len(set(r['source_record_id'] for r in rels))
    }

    return stats
```

**Output:** `backend/RELATIONSHIP_STATS_REPORT.md`

**Estimated Time:** 1 hour

---

## Phase 4: Frontend Integration (Future)

**Not part of current scope**, but documented for planning:

1. Update `archiveService.js` to load `all_relationships.csv`
2. Create thread view component (modal or sidebar)
3. Add "Related posts" section to RecordModal
4. Update Explorer to show social posts in network graph
5. Add thread filtering to Sidebar

---

## Implementation Timeline

| Phase | Task | Time | Dependencies |
|-------|------|------|--------------|
| **Phase 1** | Bluesky thread mapping | 2-3h | None |
| | Twitter thread reconstruction | 5-7h | None |
| | Thread hierarchy generation | 2-3h | Phase 1 tasks |
| **Phase 2** | Entity extraction (social posts) | 15-20h | API access |
| | Thread relationships | 1-2h | Phase 1 complete |
| | Topical relationships | 3-5h | Phase 2.1 complete |
| | Archive linking | 2-3h | Phase 2.1 complete |
| **Phase 3** | Merge relationships | 1-2h | Phase 2 complete |
| | Stats report | 1h | Phase 3.1 complete |
| **TOTAL** | | **33-46 hours** | |

**Wall Clock:** ~5-7 days (assuming 6-8 hours/day of work)

---

## Success Metrics

### Thread Reconstruction
- [ ] >95% of Bluesky posts with threading
- [ ] >75% of Twitter posts with threading (heuristic)
- [ ] Thread depth statistics calculated
- [ ] Top 10 longest threads identified

### Entity Extraction
- [ ] ~15,000 substantive posts processed
- [ ] Entities deduplicated and normalized
- [ ] v3 schema validation passes

### Relationship Generation
- [ ] >60,000 total relationships created
- [ ] <5% validation error rate
- [ ] Confidence scores documented
- [ ] Relationship type distribution balanced

### Data Quality
- [ ] All source/target IDs exist in archive
- [ ] No circular dependencies in threads
- [ ] Confidence scores in valid range (0.0-1.0)
- [ ] CSV properly formatted and parseable

---

## Risk Mitigation

### Risk 1: Twitter Threading Accuracy
- **Mitigation:** Use multiple strategies (proximity + mention + similarity)
- **Fallback:** Mark low-confidence relationships; manual validation sample

### Risk 2: Entity Extraction Cost/Time
- **Mitigation:** Filter to substantive posts (10+ words); batch processing
- **Fallback:** Process high-engagement posts first; continue in stages

### Risk 3: Relationship Explosion
- **Mitigation:** Top-N limits per post; confidence thresholds
- **Fallback:** Generate on-demand in frontend rather than pre-compute all

### Risk 4: API Rate Limits (Gemini)
- **Mitigation:** Batch processing with exponential backoff; caching
- **Fallback:** Use smaller batches; extend timeline

---

## Next Steps

1. ✅ Review and approve this roadmap
2. ⬜ Set up development environment (confirm Gemini API access)
3. ⬜ Start Phase 1.1: Bluesky thread mapping
4. ⬜ Validate Phase 1 outputs before proceeding to Phase 2
5. ⬜ Monitor costs during entity extraction
6. ⬜ Generate interim reports after each phase

---

## Questions for User

Before proceeding:
1. **API Access:** Confirm Gemini API key is active and has sufficient quota
2. **Budget:** Approve ~$50-100 for entity extraction API calls
3. **Priority:** Should we prioritize certain time periods (e.g., 2020-2025 posts first)?
4. **Filtering:** Confirm 10-word threshold for entity extraction, or adjust?
5. **Timeline:** Is 5-7 day timeline acceptable, or should we stage it differently?
