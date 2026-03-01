# Category normalization implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Normalize all `thematic_categories` values in both CSVs to 6 canonical names, with consistent comma separators, so the frontend filter sidebar has no duplicate/variant options.

**Architecture:** Write a Python script that reads each CSV, splits each category field on `,` or `;`, maps each token to a canonical name, deduplicates, and writes back with `", "` separators. Update the existing test to enforce canonical names across both CSVs. Re-export JSON.

**Tech Stack:** Python 3 (stdlib only), Node.js (`npm run export-data`), Node test runner (`npm run test:data`)

---

## Canonical category set

```python
CANONICAL = {
    # Identity (already correct)
    'Audience & Public Engagement':   'Audience & Public Engagement',
    'Journalism Education':            'Journalism Education',
    'Journalism Theory & Practice':    'Journalism Theory & Practice',
    'Politics & Democracy':            'Politics & Democracy',
    'Press & Media Criticism':         'Press & Media Criticism',
    'Technology & Digital Media':      'Technology & Digital Media',

    # Variants to normalize
    'Academic & Institutional':        'Journalism Education',
    'Democracy & Public Life':         'Politics & Democracy',
    'Digital Media & Innovation':      'Technology & Digital Media',
    'Digital Media & Technology':      'Technology & Digital Media',
    'Education & Academia':            'Journalism Education',
    'Media & Technology':              'Technology & Digital Media',
    'Media Business & Economics':      'Technology & Digital Media',
    'Media Ethics':                    'Press & Media Criticism',
    'Political Communication':         'Politics & Democracy',
    'Press Criticism':                 'Press & Media Criticism',
    'Public Journalism Movement':      'Journalism Theory & Practice',
}
```

---

### Task 1: Update the category test to enforce canonical names

**Files:**
- Modify: `tests/csv-quality.test.js:157-181`

**Step 1: Replace the existing category test body**

Find the `it('categories use normalized values'` block (line 157) and replace it with:

```js
it('categories use normalized values', () => {
  const CANONICAL = new Set([
    'Audience & Public Engagement',
    'Journalism Education',
    'Journalism Theory & Practice',
    'Politics & Democracy',
    'Press & Media Criticism',
    'Technology & Digital Media',
  ]);

  const unknownCats = new Set();

  for (const row of [...archiveRecords, ...socialPosts]) {
    const raw = (row.thematic_categories || '');
    const cats = raw.replace(/[\[\]"']/g, '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
    for (const cat of cats) {
      if (!CANONICAL.has(cat)) unknownCats.add(cat);
    }
  }

  assert.strictEqual(unknownCats.size, 0,
    `Non-canonical categories found: ${[...unknownCats].sort().join(', ')}`);
});
```

**Step 2: Run test to verify it fails**

```bash
cd ~/projects/rosen-frontend
npm run test:data 2>&1 | grep -A 5 "categories use normalized"
```

Expected: FAIL — lists all the non-canonical names currently in the CSVs.

---

### Task 2: Write the normalization script

**Files:**
- Create: `data/normalize-categories.py`

**Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
Normalize thematic_categories in both archive CSVs.

Splits each cell on , or ;, maps tokens to canonical names,
deduplicates, rejoins with ", ".

Usage: python3 data/normalize-categories.py
"""
import csv
import io
import os
import re

CANONICAL = {
    'Audience & Public Engagement':   'Audience & Public Engagement',
    'Journalism Education':            'Journalism Education',
    'Journalism Theory & Practice':    'Journalism Theory & Practice',
    'Politics & Democracy':            'Politics & Democracy',
    'Press & Media Criticism':         'Press & Media Criticism',
    'Technology & Digital Media':      'Technology & Digital Media',
    'Academic & Institutional':        'Journalism Education',
    'Democracy & Public Life':         'Politics & Democracy',
    'Digital Media & Innovation':      'Technology & Digital Media',
    'Digital Media & Technology':      'Technology & Digital Media',
    'Education & Academia':            'Journalism Education',
    'Media & Technology':              'Technology & Digital Media',
    'Media Business & Economics':      'Technology & Digital Media',
    'Media Ethics':                    'Press & Media Criticism',
    'Political Communication':         'Politics & Democracy',
    'Press Criticism':                 'Press & Media Criticism',
    'Public Journalism Movement':      'Journalism Theory & Practice',
}

DATA_DIR = os.path.join(os.path.dirname(__file__))
FILES = [
    os.path.join(DATA_DIR, 'archive_records-public.csv'),
    os.path.join(DATA_DIR, 'social_posts.csv'),
]


def normalize_cell(raw: str) -> str:
    """Split raw category string, map to canonical, deduplicate, rejoin."""
    tokens = re.split(r'[;,]', raw.replace('[', '').replace(']', '').replace("'", '').replace('"', ''))
    seen = []
    seen_set = set()
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        canonical = CANONICAL.get(token)
        if canonical is None:
            print(f'  WARNING: unknown category {token!r} — left unchanged')
            canonical = token
        if canonical not in seen_set:
            seen.append(canonical)
            seen_set.add(canonical)
    return ', '.join(seen)


def normalize_file(filepath: str) -> None:
    print(f'Normalizing {os.path.basename(filepath)}...')
    with open(filepath, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    changed = 0
    for row in rows:
        raw = row.get('thematic_categories', '')
        normalized = normalize_cell(raw)
        if normalized != raw:
            row['thematic_categories'] = normalized
            changed += 1

    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'  Updated {changed} of {len(rows)} rows.')


if __name__ == '__main__':
    for f in FILES:
        normalize_file(f)
    print('Done.')
```

---

### Task 3: Run the normalization script

**Step 1: Run it**

```bash
cd ~/projects/rosen-frontend
python3 data/normalize-categories.py
```

Expected output:
```
Normalizing archive_records-public.csv...
  Updated N of 701 rows.
Normalizing social_posts.csv...
  Updated N of 29100 rows.
Done.
```

Any `WARNING: unknown category` lines indicate a value we didn't anticipate — investigate before proceeding.

---

### Task 4: Run test to verify it passes

```bash
cd ~/projects/rosen-frontend
npm run test:data 2>&1 | grep -A 5 "categories use normalized"
```

Expected: PASS.

If it fails, check the WARNING lines from Task 3 and add missing mappings to the `CANONICAL` dict.

---

### Task 5: Re-export JSON

```bash
cd ~/projects/rosen-frontend
npm run export-data
```

Expected: completes without errors, updates `data/archive-*.json`.

---

### Task 6: Run full test suite

```bash
cd ~/projects/rosen-frontend
npm test
```

Expected: all tests pass.

---

### Task 7: Commit

```bash
cd ~/projects/rosen-frontend
git add data/archive_records-public.csv data/social_posts.csv \
        data/normalize-categories.py \
        data/archive-core.json data/archive-data.json \
        data/archive-details.json data/archive-entities.json \
        tests/csv-quality.test.js \
        docs/plans/2026-03-01-normalize-categories.md
git commit -m "Normalize thematic_categories to 6 canonical names across both CSVs

Maps 11 variant category names to canonical forms. Updates category test
to enforce canonical set across archiveRecords and socialPosts."
```
