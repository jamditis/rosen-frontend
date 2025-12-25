---
name: archive-validation
description: Validate archive data quality, schema compliance, and content integrity. Use when checking data before deployment or after imports.
---

# Archive Data Validation

Ensure data quality and schema compliance for the Jay Rosen Digital Archive. This skill covers validation patterns for CSV sources, JSON exports, and entity relationships.

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

### Approved Eras (8 total)

```javascript
const VALID_ERAS = [
    "Dissertation Era (1982-1986)",
    "Public Journalism Era (1990-2000)",
    "Early Internet Era (1999-2004)",
    "Blogging Revolution (2004-2010)",
    "Social Media Era (2010-2016)",
    "Trump Era (2016-2020)",
    "COVID-19 Era (2020-2021)",
    "Trump II & Beyond (2025-Present)"
];
```

### Approved Categories

```javascript
const VALID_CATEGORIES = [
    "Academic Work",
    "Blog Post",
    "Book Chapter",
    "Conference Paper",
    "Interview",
    "Journalism",
    "Media Criticism",
    "Opinion",
    "PressThink Blog",
    "Social Media",
    "Video"
];
```

## Validation Commands

### Quick Validation Script

```bash
cd /home/user/rosen-frontend/backend
source venv/bin/activate

# Validate schema compliance
python -c "
import pandas as pd
import json

# Load CSV
df = pd.read_csv('../data/archive_records-public.csv')

# Check required fields
required = ['id', 'title', 'author', 'date', 'year', 'pub', 'url', 'summary', 'categories', 'era', 'verified']
missing = [col for col in required if col not in df.columns]
print(f'Missing columns: {missing or \"None\"}')

# Check for empty required fields
for col in ['id', 'title', 'date', 'summary']:
    empty = df[df[col].isna() | (df[col] == '')].shape[0]
    print(f'Empty {col}: {empty}')

# Check ID format
invalid_ids = df[~df['id'].str.match(r'^[A-Z]+-\d{5}$')]['id'].tolist()[:5]
print(f'Invalid ID format (first 5): {invalid_ids or \"None\"}')

# Check date format
import re
invalid_dates = df[~df['date'].astype(str).str.match(r'^\d{4}-\d{2}-\d{2}$')]['date'].tolist()[:5]
print(f'Invalid date format (first 5): {invalid_dates or \"None\"}')

print(f'\\nTotal records: {len(df)}')
"
```

### Comprehensive Validation

```python
# backend/scripts/validate_schema.py
import pandas as pd
import json
from pathlib import Path

def validate_archive():
    data_dir = Path(__file__).parent.parent.parent / 'data'

    errors = []
    warnings = []

    # Load CSV
    df = pd.read_csv(data_dir / 'archive_records-public.csv')

    # 1. ID Format Validation
    invalid_ids = df[~df['id'].str.match(r'^[A-Z]+-\d{5}$', na=False)]
    if len(invalid_ids):
        errors.append(f"Invalid ID format: {len(invalid_ids)} records")

    # 2. Duplicate IDs
    dupes = df[df['id'].duplicated()]['id'].tolist()
    if dupes:
        errors.append(f"Duplicate IDs: {dupes}")

    # 3. Date Validation
    invalid_dates = df[~df['date'].astype(str).str.match(r'^\d{4}-\d{2}-\d{2}$', na=False)]
    if len(invalid_dates):
        errors.append(f"Invalid dates: {len(invalid_dates)} records")

    # 4. Year Range
    out_of_range = df[(df['year'] < 1950) | (df['year'] > 2030)]
    if len(out_of_range):
        warnings.append(f"Year out of range: {len(out_of_range)} records")

    # 5. Summary Length
    short_summaries = df[df['summary'].str.len() < 50]
    if len(short_summaries):
        warnings.append(f"Short summaries (<50 chars): {len(short_summaries)} records")

    # 6. Era Validation
    valid_eras = [
        "Dissertation Era (1982-1986)",
        "Public Journalism Era (1990-2000)",
        "Early Internet Era (1999-2004)",
        "Blogging Revolution (2004-2010)",
        "Social Media Era (2010-2016)",
        "Trump Era (2016-2020)",
        "COVID-19 Era (2020-2021)",
        "Trump II & Beyond (2025-Present)"
    ]
    invalid_eras = df[~df['era'].isin(valid_eras)]
    if len(invalid_eras):
        errors.append(f"Invalid eras: {invalid_eras['era'].unique().tolist()}")

    return {
        'errors': errors,
        'warnings': warnings,
        'record_count': len(df),
        'valid': len(errors) == 0
    }

if __name__ == '__main__':
    result = validate_archive()
    print(json.dumps(result, indent=2))
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
