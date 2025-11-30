# Entity Extraction Schema Improvements

**Date:** November 2025
**Status:** PROPOSED - Needs Review

---

## Background

Investigation of the incorrect "120+ organizations founded by Jay Rosen" claim revealed systematic issues in the entity extraction and relationship classification pipeline. This document proposes changes to prevent similar errors.

---

## Issues Identified

### 1. Conflation of Relationship Types

**Problem:** The R analysis script combined "Founded By" and "Pioneered" relationships into a single count, even though they represent fundamentally different things:

- **"Founded By"** = Organization/Work was created by someone (institutional action)
- **"Pioneered"** = Person was first to develop a concept/practice (intellectual contribution)

**Impact:** Led to claiming "120+ organizations founded" when the actual count was much lower, with the rest being concepts pioneered.

### 2. Ambiguous "Founded By" Definition

**Current schema definition:**
```json
"Founded By": {
  "description": "Organization or work A was founded, created, or established by person/organization B",
  "valid_source_types": ["Organization", "Work"],
  "valid_target_types": ["Person", "Organization"]
}
```

**Problems:**
- "created" is too broad (could mean created an article, created a concept, etc.)
- "established" is ambiguous (established facts? established relationships?)
- Including "Work" as valid source type conflates authorship with founding

### 3. Low Confidence Threshold

**Current setting:** `MIN_CONFIDENCE_SCORE = 0.5` in `relationship_augmentation.py`

**Problem:** 50% confidence is too permissive, allowing relationships that are only "strongly implied" rather than explicitly stated.

### 4. Overly Broad Keyword Triggers

**Current code:**
```python
founding_keywords = ['founded', 'created', 'pioneered', 'started', 'launched', 'established']
```

**Problem:** Triggers extraction on ANY record containing these words, regardless of context (e.g., "The NY Times was founded in 1851" triggers extraction even though Rosen didn't found it).

---

## Proposed Schema Changes

### Change 1: Restrict "Founded By" to Organizations Only

```json
"Founded By": {
  "description": "Organization A was founded or co-founded by person/organization B. Use ONLY for institutional founding, not for creating works or concepts.",
  "valid_source_types": ["Organization"],
  "valid_target_types": ["Person", "Organization"],
  "extraction_guidance": "Reserve for actual organizational founding. Do NOT use for: articles written, blogs created, concepts developed, or projects managed."
}
```

### Change 2: Add "Author Of" Relationship Type

```json
"Author Of": {
  "description": "Person A authored or wrote work B (article, book, post, tweet, etc.)",
  "valid_source_types": ["Person"],
  "valid_target_types": ["Work"],
  "extraction_guidance": "Use for written works. Not for founding organizations or pioneering concepts."
}
```

### Change 3: Clarify "Pioneered" Definition

```json
"Pioneered": {
  "description": "Person A pioneered, invented, or was the first to develop and popularize concept B. Use for intellectual/theoretical contributions, not organizational founding.",
  "valid_source_types": ["Person"],
  "valid_target_types": ["Concept"],
  "extraction_guidance": "Use ONLY for concepts and ideas, not for organizations or works."
}
```

### Change 4: Add Relationship Type Descriptions to Prevent Conflation

Add a new section to the schema:

```json
"relationship_distinctions": {
  "founded_vs_pioneered": {
    "explanation": "These are DIFFERENT relationship types that should NEVER be combined in analysis.",
    "Founded By": "Institutional founding - creating an organization",
    "Pioneered": "Intellectual contribution - developing a concept or idea",
    "example_founded": "Jay Rosen -> Founded By -> Studio 20 (organization)",
    "example_pioneered": "Jay Rosen -> Pioneered -> View from Nowhere (concept)"
  },
  "founded_vs_authored": {
    "explanation": "Creating a work is not the same as founding an organization.",
    "Founded By": "Use for organizations only",
    "Author Of": "Use for written works (articles, books, posts)",
    "wrong": "PressThink -> Founded By -> Jay Rosen (PressThink is also a Work, not just an Organization)",
    "correct": "Jay Rosen -> Author Of -> [specific PressThink article]"
  }
}
```

---

## Proposed Code Changes

### File: `src/rosen_scraper/relationship_augmentation.py`

#### Change 1: Raise Confidence Threshold

```python
# BEFORE
MIN_CONFIDENCE_SCORE = 0.5  # MODERATE (50%)

# AFTER
MIN_CONFIDENCE_SCORE = 0.7  # HIGH (70%) - require stronger evidence
```

#### Change 2: More Specific Keyword Triggers

```python
# BEFORE
founding_keywords = ['founded', 'created', 'pioneered', 'started', 'launched', 'established']

# AFTER - separate lists for different relationship types
org_founding_keywords = ['founded', 'co-founded', 'started', 'launched']
concept_pioneering_keywords = ['pioneered', 'invented', 'developed', 'coined', 'introduced']
authorship_keywords = ['wrote', 'authored', 'published', 'posted']
```

#### Change 3: Context-Aware Extraction

Add logic to check WHO is doing the founding:

```python
def is_rosen_founding(raw_text: str) -> bool:
    """Check if Jay Rosen is the one doing the founding, not just mentioned."""
    rosen_patterns = [
        r'rosen\s+(founded|co-founded|started|launched)',
        r'founded\s+by\s+(jay\s+)?rosen',
        r'rosen.*created\s+(the\s+)?(organization|program|initiative)',
    ]
    import re
    for pattern in rosen_patterns:
        if re.search(pattern, raw_text.lower()):
            return True
    return False
```

---

## Proposed Analysis Code Changes

### File: `RStudio/scripts/media_industry_analysis.R`

Already fixed to separate "Founded By" from "Pioneered" counts. Key changes:

1. **Separate queries** for each relationship type
2. **Clear labeling** of what each count represents
3. **Warning comments** about not combining different relationship types
4. **Entity type filtering** to ensure Organizations ≠ Concepts

---

## Validation Recommendations

### Before Re-Running Extraction

1. **Manual audit** of existing "Founded By" relationships
   - Check 20 random samples
   - Verify each represents actual organizational founding
   - Reclassify any that should be "Author Of" or "Pioneered"

2. **Create test cases** for the extraction pipeline
   - Positive: "Jay Rosen founded Studio 20 in 2010"
   - Negative: "The New York Times was founded in 1851" (not by Rosen)
   - Edge case: "Rosen created PressThink" (is this founding org or authoring blog?)

3. **Define canonical list** of organizations Rosen actually founded
   - Studio 20 at NYU
   - NewAssignment.net
   - Assignment Zero
   - [others verified through primary sources]

### After Schema Changes

1. **Re-run extraction** on subset of records
2. **Compare** new counts to old counts
3. **Verify** the changes reduce false positives
4. **Document** the correct counts for public communications

---

## Implementation Priority

| Change | Priority | Effort | Impact |
|--------|----------|--------|--------|
| Raise confidence threshold | HIGH | LOW | Immediate reduction in false positives |
| Separate org/concept keywords | HIGH | MEDIUM | Better classification accuracy |
| Add "Author Of" relationship | MEDIUM | MEDIUM | Cleaner data model |
| Restrict "Founded By" to orgs | MEDIUM | LOW | Prevents future confusion |
| Context-aware extraction | LOW | HIGH | Most accurate but complex |

---

## Questions for Review

1. Should we re-run entity extraction with updated schema?
2. How to handle existing "Founded By" relationships that should be "Author Of"?
3. Should we manually curate the "organizations founded" list rather than relying on extraction?
4. What is the acceptable confidence threshold for production use?

---

*Document prepared as part of entity extraction pipeline review, November 2025*
