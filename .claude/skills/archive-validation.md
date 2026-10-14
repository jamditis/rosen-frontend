---
name: archive-validation
description: Validate archive data quality, schema compliance, and content integrity. Use when checking data before deployment or after imports.
---

# Archive Data Validation

Ensure data quality and schema compliance for Jay Rosen's Internet Archive. This skill covers validation patterns for CSV sources, JSON exports, and entity relationships.

## When to Activate

- Before deploying new data to production
- After running import scripts
- After entity extraction batches
- When investigating data quality issues
- During periodic data audits

## Schema Definition

### Archive Record (Required Fields)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `id` | string | Yes | Format: `PREFIX-NNNNN` (e.g., PRESSTH-00001) |
| `title` | string | Yes | 3-500 characters |
| `author` | string | Yes | Default: "Jay Rosen" |
| `date` | string | Yes | Format: YYYY-MM-DD |
| `year` | integer | Yes | 1950-2030 |
| `pub` | string | Yes | Publication source |
| `url` | string | Yes | Valid URL or empty for clippings |
| `summary` | string | Yes | 50-2000 characters |
| `categories` | array | Yes | At least one category |
| `concepts` | array | No | From approved concept list |
| `era` | string | Yes | From approved era list |
| `verified` | boolean | Yes | true/false |

### ID Prefix Standards

| Prefix | Source |
|--------|--------|
| `PRESSTH-` | PressThink blog |
| `CJR-` | Columbia Journalism Review |
| `NYT-` | New York Times |
| `TUMBLR-` | Tumblr posts |
| `CLIP-` | Newspaper clippings |
| `THREAD-` | Social media threads |
| `DISS-` | Dissertation content |
| `SOCIAL-` | Social media posts |
| `TWTR-` | Twitter/X posts |

### Approved Eras

Archive records and social posts use different era taxonomies.

```javascript
// Archive record eras (from archive_records-public.csv)
const VALID_ARCHIVE_ERAS = [
    "Early Career & Public Journalism (1990-1999)",
    "Public Journalism (90s)",
    "Blogging Launch & Digital Disruption (2000-2004)",
    "Web & Blogging (00s)",
    "Web & Blogging (2000s)",
    "Peak Blogging & Citizen Journalism (2005-2009)",
    "Social Media & Financial Crisis (2010-2015)",
    "View from Nowhere (10s)",
    "View From Nowhere (2010s)",
    "Trump Era & Democratic Crisis (2016-2020)",
    "Democracy in Crisis (20s)",
    "Platform Transition & Future Models (2021-Present)"
];

// Social post eras (from social_posts.csv)
const VALID_SOCIAL_ERAS = [
    "Post-Trump & Future of News (2022-Present)"
];

// Frontend display eras (short-form, used in constants.js)
const FRONTEND_ERAS = [
    "Public Journalism (90s)",
    "Web & Blogging (00s)",
    "View from Nowhere (10s)",
    "Democracy in Crisis (20s)"
];
```

### Approved Categories

Archive records and social posts share a thematic category taxonomy.

```javascript
// Thematic categories (from both archive_records and social_posts)
const VALID_CATEGORIES = [
    "Academic & Institutional",
    "Audience & Public Engagement",
    "Democracy & Public Life",
    "Digital Media & Innovation",
    "Digital Media & Technology",
    "Education & Academia",
    "Journalism Education",
    "Journalism Theory & Practice",
    "Media & Technology",
    "Media Business & Economics",
    "Media Ethics",
    "Media Theory",
    "Political Communication",
    "Politics & Democracy",
    "Press & Media Criticism",
    "Press Criticism",
    "Public Journalism Movement",
    "Public Life",
    "Technology & Digital Media",
    "Trump & Authoritarianism"
];
```

## Validation Commands

Run the maintained validator from the backend directory. It validates the
archive and social CSV files and reports entity and relationship findings when
those inputs load. A missing or unreadable entity or relationship CSV is a
warning, not an error, so the command can exit zero with either check skipped.
Read the warning section as well as the exit status. The command exits nonzero
when the report contains errors.

```bash
cd /home/user/rosen-frontend/backend
poetry run python scripts/validate_archive_data.py
```

### Entity Validation

```python
# Validate entity relationships
def validate_entities():
    data_dir = Path(__file__).parent.parent.parent / 'data'

    entities = pd.read_csv(data_dir / 'extracted_entities.csv')
    relationships = pd.read_csv(data_dir / 'extracted_relationships.csv')
    records = pd.read_csv(data_dir / 'archive_records-public.csv')

    errors = []

    # 1. Orphan entities (no source record)
    record_ids = set(records['id'].tolist())
    orphans = entities[~entities['source_record_id'].isin(record_ids)]
    if len(orphans):
        errors.append(f"Orphan entities: {len(orphans)}")

    # 2. Invalid relationship references
    entity_ids = set(entities['entity_id'].tolist())
    invalid_sources = relationships[~relationships['source_entity_id'].isin(entity_ids)]
    invalid_targets = relationships[~relationships['target_entity_id'].isin(entity_ids)]
    if len(invalid_sources) or len(invalid_targets):
        errors.append(f"Invalid relationships: {len(invalid_sources) + len(invalid_targets)}")

    # 3. Duplicate entities
    dupes = entities[entities['name'].str.lower().duplicated()]
    if len(dupes):
        errors.append(f"Potential duplicate entities: {len(dupes)}")

    return errors
```

## JSON Export Validation

```bash
cd /home/user/rosen-frontend/data

# Validate JSON structure
node -e "
const fs = require('fs');

const files = ['archive-core.json', 'archive-details.json', 'archive-entities.json'];

files.forEach(file => {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const size = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
        console.log(\`✓ \${file}: \${Array.isArray(data) ? data.length + ' records' : Object.keys(data).length + ' keys'} (\${size}MB)\`);
    } catch (e) {
        console.log(\`✗ \${file}: \${e.message}\`);
    }
});
"
```

## Quality Metrics

### Data Completeness Targets

| Metric | Target | Check Query |
|--------|--------|-------------|
| Records with summary | 100% | `df[df['summary'].isna()].count()` |
| Records with categories | 100% | `df[df['categories'] == '[]'].count()` |
| Records with concepts | 80%+ | `df[df['concepts'] == '[]'].count()` |
| Records verified | 90%+ | `df[df['verified'] == False].count()` |
| Entities extracted | 90%+ | Compare entity count to record count |

### Quality Report Template

```markdown
## Archive Quality Report - [DATE]

### Record Statistics
- Total Records: X
- Records with Summary: X (X%)
- Records with Concepts: X (X%)
- Verified Records: X (X%)

### Era Distribution
- Dissertation Era: X
- Public Journalism Era: X
- [etc.]

### Data Issues
- Missing summaries: X records
- Invalid dates: X records
- Orphan entities: X

### Recommendations
1. [Issue] - [Suggested fix]
2. [Issue] - [Suggested fix]
```

## Pre-Deployment Checklist

```markdown
## Data Validation Checklist

### CSV Sources
- [ ] archive_records-public.csv passes schema validation
- [ ] No duplicate IDs
- [ ] All dates in YYYY-MM-DD format
- [ ] All eras from approved list
- [ ] All categories from approved list

### Entity Data
- [ ] extracted_entities.csv has no orphans
- [ ] extracted_relationships.csv references valid entities
- [ ] Entity deduplication has been run

### JSON Exports
- [ ] archive-core.json is valid JSON
- [ ] archive-details.json is valid JSON
- [ ] archive-entities.json is valid JSON
- [ ] File sizes are reasonable (not empty, not bloated)

### Sanity Checks
- [ ] Record count matches expected (currently ~869 + social)
- [ ] Entity count is reasonable (currently ~5000)
- [ ] Relationship count is reasonable (currently ~16000)
- [ ] No PII or sensitive data exposed
```

## Integration

- **data-pipeline** - Runs before validation
- **deployment-manager** - Blocks deployment on validation failure
- **zero-build-frontend** - Consumes validated data

---

## Skill Metadata
**Created**: 2025-12-25
**Author**: Claude Code
**Version**: 1.0.0
