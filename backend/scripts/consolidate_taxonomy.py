# -*- coding: utf-8 -*-
"""
Taxonomy Consolidation Script

SAFE, NON-DESTRUCTIVE data cleaning that:
1. Creates a timestamped backup first
2. Generates a cleaned CSV for review
3. Shows exactly what changed
4. Requires manual approval before replacing original

Fixes:
- Era consolidation (14 → 8 with COVID-19 and Trump II)
- Tag case variations (375 issues)
- Key_concepts case variations (3 issues)
- content_type standardization (10 non-schema values)
- scope standardization (5 non-schema values)
- Remove colQ_changes column
"""

import csv
import shutil
from pathlib import Path
from datetime import datetime
from collections import Counter, defaultdict


class TaxonomyConsolidator:
    """Consolidate and standardize all taxonomy fields."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.changes = []
        self.stats = {
            'era_reassigned': 0,
            'tags_normalized': 0,
            'key_concepts_normalized': 0,
            'content_type_fixed': 0,
            'scope_fixed': 0,
            'column_removed': 0
        }

        # Era mapping based on publication_date
        self.era_mapping = {
            # Format: (start_year, end_year): "Era Name"
            (1990, 1999): "Early Career & Public Journalism (1990-1999)",
            (2000, 2004): "Blogging Launch & Digital Disruption (2000-2004)",
            (2005, 2009): "Peak Blogging & Citizen Journalism (2005-2009)",
            (2010, 2015): "Social Media & Financial Crisis (2010-2015)",
            (2016, 2019): "Trump Era & Democratic Crisis (2016-2019)",
            (2020, 2021): "COVID-19 & Misinformation Crisis (2020-2021)",
            (2022, 2024): "Post-Trump Transition (2022-2024)",
            (2025, 2099): "Second Trump Administration (2025-Present)"
        }

        # Tag normalization (case standardization)
        # Will be built dynamically from data

        # Key concepts canonical forms (from schema.json)
        self.key_concepts_canonical = {
            "view from nowhere": "View from Nowhere",
            "church of the savvy": "Church of the Savvy",
            "the people formerly known as the audience": "The People Formerly Known as the Audience",
            "parity product": "Parity Product",
            "verification in reverse": "Verification in reverse",
            "he said/she said journalism": "He said/she said journalism",
            "audience atomization overcome": "Audience atomization overcome",
            "the production of innocence": "The Production of Innocence",
            "horse-race journalism": "Horse-race journalism",
            "false balance": "False balance",
            "the citizens' agenda": "The Citizens' Agenda",
            "not the odds but the stakes": "Not the odds but the stakes",
            "mindcasting": "Mindcasting",
            "citizen journalism": "Citizen Journalism",
            "pro-am journalism": "Pro-am journalism"
        }

        # content_type mapping
        self.content_type_mapping = {
            'video': 'Video',
            'Video': 'Interview (Audio/Video)',  # Map Video → Interview (Audio/Video)
            'Podcast': 'Interview (Audio/Video)',
            'Radio': 'Interview (Audio/Video)',
            'Twitter Video': 'Tweet/Thread',
            'Social': 'Tweet/Thread',
            'Transcript': 'Lecture/Presentation',
            'Appearance': 'Panel Discussion',
            'Bio': 'Article',
            'Book': 'Book Chapter'
        }

        # scope mapping
        self.scope_mapping = {
            'News': 'Commentary/Critique',
            'Media Industry Analysis': 'Commentary/Critique',
            'Journalism Theory': 'Theoretical',
            'Technology Analysis': 'Commentary/Critique',
            'Commentary/Critique, Theoretical': 'Commentary/Critique'  # Split handled separately
        }

    def assign_era_from_date(self, date_str: str) -> str:
        """Assign era based on publication_date."""
        if not date_str or not date_str.strip():
            return ""

        try:
            # Try multiple date formats
            year = None
            for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%Y/%m/%d', '%d/%m/%Y']:
                try:
                    date = datetime.strptime(date_str.strip(), fmt)
                    year = date.year
                    break
                except ValueError:
                    continue

            if not year:
                return ""

            # Find matching era
            for (start, end), era_name in self.era_mapping.items():
                if start <= year <= end:
                    return era_name

            # If year is before 1990, use earliest era
            if year < 1990:
                return "Early Career & Public Journalism (1990-1999)"

            return ""

        except Exception:
            return ""

    def normalize_tags(self, tags_str: str, tag_map: dict) -> str:
        """Normalize tag casing and consolidate duplicates."""
        if not tags_str or not tags_str.strip():
            return tags_str

        # Split on commas
        tags = [t.strip() for t in tags_str.split(',')]

        # Normalize each tag
        normalized = []
        for tag in tags:
            tag_lower = tag.lower().strip()
            if tag_lower in tag_map:
                normalized_tag = tag_map[tag_lower]
                if normalized_tag != tag:
                    self.stats['tags_normalized'] += 1
                normalized.append(normalized_tag)
            else:
                normalized.append(tag)

        return ', '.join(normalized)

    def normalize_key_concepts(self, concepts_str: str) -> str:
        """Normalize key_concepts casing."""
        if not concepts_str or not concepts_str.strip():
            return concepts_str

        # Split on commas
        concepts = [c.strip() for c in concepts_str.split(',')]

        # Normalize each concept
        normalized = []
        for concept in concepts:
            concept_lower = concept.lower().strip()
            if concept_lower in self.key_concepts_canonical:
                canonical = self.key_concepts_canonical[concept_lower]
                if canonical != concept:
                    self.stats['key_concepts_normalized'] += 1
                normalized.append(canonical)
            else:
                normalized.append(concept)

        return ', '.join(normalized)

    def normalize_content_type(self, value: str) -> str:
        """Normalize content_type to match schema."""
        if not value or not value.strip():
            return 'Article'  # Default

        cleaned = value.strip()

        if cleaned in self.content_type_mapping:
            self.stats['content_type_fixed'] += 1
            return self.content_type_mapping[cleaned]

        return cleaned

    def normalize_scope(self, value: str) -> str:
        """Normalize scope to match schema."""
        if not value or not value.strip():
            return value

        cleaned = value.strip()

        # Handle combined values (comma-separated)
        if ',' in cleaned:
            scopes = [s.strip() for s in cleaned.split(',')]
            # Take first scope only
            cleaned = scopes[0]
            self.stats['scope_fixed'] += 1

        if cleaned in self.scope_mapping:
            self.stats['scope_fixed'] += 1
            return self.scope_mapping[cleaned]

        return cleaned

    def build_tag_normalization_map(self, records):
        """Build tag normalization map from data."""
        print("\n📊 Building tag normalization map...")

        all_tags = []
        for record in records:
            tags_str = record.get('tags', '').strip()
            if tags_str:
                tags = [t.strip() for t in tags_str.split(',')]
                all_tags.extend(tags)

        # Group by lowercase
        tag_groups = defaultdict(list)
        for tag in all_tags:
            tag_lower = tag.lower().strip()
            tag_groups[tag_lower].append(tag)

        # Build normalization map
        tag_map = {}
        for tag_lower, variants in tag_groups.items():
            if len(variants) == 1:
                # No variations, use as-is
                tag_map[tag_lower] = variants[0]
            else:
                # Multiple variations - pick most common
                variant_counts = Counter(variants)
                most_common = variant_counts.most_common(1)[0][0]

                # Prefer Title Case if it exists
                for variant in variants:
                    if variant.istitle() or (variant[0].isupper() and not variant.isupper()):
                        most_common = variant
                        break

                # Map all variants to canonical
                for variant in variants:
                    tag_map[tag_lower] = most_common

        print(f"✅ Built normalization map for {len(tag_map)} unique tags")
        variations = sum(1 for variants in tag_groups.values() if len(variants) > 1)
        print(f"   Found {variations} tags with case variations")

        return tag_map

    def clean_record(self, record: dict, tag_map: dict) -> dict:
        """Clean a single record."""
        cleaned = record.copy()

        # Track changes for this record
        record_changes = []

        # 1. ERA: Always reassign based on publication_date
        old_era = cleaned.get('era', '')
        new_era = self.assign_era_from_date(cleaned.get('publication_date', ''))
        if new_era and new_era != old_era:
            cleaned['era'] = new_era
            record_changes.append(('era', old_era, new_era))
            self.stats['era_reassigned'] += 1

        # 2. TAGS: Normalize casing
        if 'tags' in cleaned:
            old_tags = cleaned['tags']
            cleaned['tags'] = self.normalize_tags(old_tags, tag_map)
            if old_tags != cleaned['tags']:
                record_changes.append(('tags', old_tags[:100], cleaned['tags'][:100]))

        # 3. KEY_CONCEPTS: Normalize casing
        if 'key_concepts' in cleaned:
            old_concepts = cleaned['key_concepts']
            cleaned['key_concepts'] = self.normalize_key_concepts(old_concepts)
            if old_concepts != cleaned['key_concepts']:
                record_changes.append(('key_concepts', old_concepts[:100], cleaned['key_concepts'][:100]))

        # 4. CONTENT_TYPE: Map to schema values
        if 'content_type' in cleaned:
            old_type = cleaned['content_type']
            cleaned['content_type'] = self.normalize_content_type(old_type)
            if old_type != cleaned['content_type']:
                record_changes.append(('content_type', old_type, cleaned['content_type']))

        # 5. SCOPE: Map to schema values
        if 'scope' in cleaned:
            old_scope = cleaned['scope']
            cleaned['scope'] = self.normalize_scope(old_scope)
            if old_scope != cleaned['scope']:
                record_changes.append(('scope', old_scope, cleaned['scope']))

        # 6. REMOVE colQ_changes column
        if 'colQ_changes' in cleaned:
            del cleaned['colQ_changes']
            self.stats['column_removed'] += 1

        if record_changes:
            self.changes.append({
                'record_id': record.get('id', 'UNKNOWN'),
                'changes': record_changes
            })

        return cleaned

    def create_backup(self, csv_file: Path) -> Path:
        """Create timestamped backup of original CSV."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = csv_file.parent / f"{csv_file.stem}_backup_{timestamp}{csv_file.suffix}"
        shutil.copy2(csv_file, backup_file)
        return backup_file

    def clean_csv(self, csv_file: Path, output_file: Path):
        """Clean CSV file and write to output."""
        print(f"\n📖 Reading: {csv_file}")

        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames)
            records = list(reader)

        print(f"✅ Read {len(records)} records with {len(fieldnames)} columns")

        # Build tag normalization map
        tag_map = self.build_tag_normalization_map(records)

        # Clean records
        print("\n🔧 Cleaning records...")
        cleaned_records = [self.clean_record(record, tag_map) for record in records]

        print(f"✅ Cleaned {len(cleaned_records)} records")

        # Remove colQ_changes from fieldnames if it exists
        if 'colQ_changes' in fieldnames:
            fieldnames.remove('colQ_changes')
            print("✅ Removed 'colQ_changes' column from schema")

        print(f"\n💾 Writing cleaned data to: {output_file}")

        with open(output_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(cleaned_records)

        print("✅ Written successfully")

    def print_change_summary(self):
        """Print summary of changes made."""
        print("\n" + "="*80)
        print("CHANGE SUMMARY")
        print("="*80)

        print(f"\nTotal records with changes: {len(self.changes)}")
        print("\nChanges by type:")
        print(f"  - Eras reassigned: {self.stats['era_reassigned']}")
        print(f"  - Tags normalized: {self.stats['tags_normalized']}")
        print(f"  - Key concepts normalized: {self.stats['key_concepts_normalized']}")
        print(f"  - Content types fixed: {self.stats['content_type_fixed']}")
        print(f"  - Scopes fixed: {self.stats['scope_fixed']}")
        print(f"  - Columns removed: {self.stats['column_removed']}")

        if self.changes:
            print("\n" + "-"*80)
            print("DETAILED CHANGES (first 30 records)")
            print("-"*80)

            for change in self.changes[:30]:
                print(f"\n{change['record_id']}:")
                for field, old, new in change['changes']:
                    print(f"  {field}:")
                    print(f"    OLD: {old}")
                    print(f"    NEW: {new}")

            if len(self.changes) > 30:
                print(f"\n... and {len(self.changes) - 30} more records with changes")


def main():
    """Run the consolidation process."""
    data_dir = Path(__file__).parent.parent.parent / 'data'
    csv_file = data_dir / 'archive_records-public.csv'

    print("\n" + "="*80)
    print("TAXONOMY CONSOLIDATION SCRIPT")
    print("="*80)
    print("\n⚠️  SAFETY FEATURES:")
    print("  1. Creates timestamped backup")
    print("  2. Writes cleaned data to separate file for review")
    print("  3. Shows all changes made")
    print("  4. Requires manual approval before replacing original")
    print("\n" + "="*80)

    if not csv_file.exists():
        print(f"\n❌ CSV file not found: {csv_file}")
        return

    # Create backup
    print("\n🔒 Creating backup...")
    consolidator = TaxonomyConsolidator(data_dir)
    backup_file = consolidator.create_backup(csv_file)
    print(f"✅ Backup created: {backup_file}")

    # Clean data to new file
    cleaned_file = data_dir / 'archive_records-public_TAXONOMY_CONSOLIDATED.csv'
    consolidator.clean_csv(csv_file, cleaned_file)

    # Show changes
    consolidator.print_change_summary()

    # Save change log
    change_log = data_dir.parent / 'backend' / 'taxonomy_consolidation_changes.txt'
    with open(change_log, 'w', encoding='utf-8') as f:
        f.write(f"Taxonomy Consolidation Changes - {datetime.now().isoformat()}\n")
        f.write("="*80 + "\n\n")
        f.write(f"Total records with changes: {len(consolidator.changes)}\n\n")
        f.write("Changes by type:\n")
        f.write(f"  - Eras reassigned: {consolidator.stats['era_reassigned']}\n")
        f.write(f"  - Tags normalized: {consolidator.stats['tags_normalized']}\n")
        f.write(f"  - Key concepts normalized: {consolidator.stats['key_concepts_normalized']}\n")
        f.write(f"  - Content types fixed: {consolidator.stats['content_type_fixed']}\n")
        f.write(f"  - Scopes fixed: {consolidator.stats['scope_fixed']}\n")
        f.write(f"  - Columns removed: {consolidator.stats['column_removed']}\n\n")
        for change in consolidator.changes:
            f.write(f"{change['record_id']}:\n")
            for field, old, new in change['changes']:
                f.write(f"  {field}: '{old}' → '{new}'\n")
            f.write("\n")

    print(f"\n📄 Full change log saved to: {change_log}")

    # Instructions for user
    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    print(f"\n1. Review the cleaned file: {cleaned_file}")
    print(f"2. Review the change log: {change_log}")
    print("3. If satisfied, replace the original:")
    print(f"   mv {cleaned_file} {csv_file}")
    print("\n4. If NOT satisfied, discard the cleaned file:")
    print(f"   rm {cleaned_file}")
    print("\n5. Backup is available if needed:")
    print(f"   {backup_file}")
    print("\n" + "="*80)
    print()


if __name__ == "__main__":
    main()
