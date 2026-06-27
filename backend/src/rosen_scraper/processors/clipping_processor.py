# -*- coding: utf-8 -*-
"""
Newspaper Clipping Processor
Processes OCR'd newspaper clippings for Jay Rosen's Internet Archive.

This processor handles:
- OCR text cleanup (artifacts, line breaks, hyphenation)
- Metadata extraction (publication, date, author, page)
- AI enrichment (categorization, entities, summaries)
- ID generation (NYT-XXXXX, WSJ-XXXXX, CLIP-XXXXX)

Expected input formats:
- Text files (.txt) with OCR output
- JSON files with pre-extracted metadata
- Directory of clipping files
"""

import re
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass

from rosen_scraper.processors import base


@dataclass
class ClippingMetadata:
    """Extracted metadata from a newspaper clipping."""
    publication: str = ''
    date: str = ''
    author: str = ''
    headline: str = ''
    page: str = ''
    section: str = ''
    confidence: float = 0.0


class ClippingProcessor:
    """Process newspaper clippings from OCR output."""

    # Known publications with their ID prefixes
    PUBLICATION_PREFIXES = {
        'new york times': 'NYT',
        'nytimes': 'NYT',
        'ny times': 'NYT',
        'wall street journal': 'WSJ',
        'wsj': 'WSJ',
        'washington post': 'WP',
        'wapo': 'WP',
        'los angeles times': 'LAT',
        'la times': 'LAT',
        'chicago tribune': 'CT',
        'boston globe': 'BG',
        'guardian': 'GRD',
        'the guardian': 'GRD',
        'columbia journalism review': 'CJR',
        'american journalism review': 'AJR',
        'editor & publisher': 'EP',
        'nieman reports': 'NR',
        'poynter': 'PYN',
    }

    # Common OCR artifacts to fix
    OCR_FIXES = [
        # Character substitutions
        (r'\bl\s*l\b', 'll'),  # Spaced ll
        (r'\brn\b', 'm'),  # rn → m (common OCR error)
        (r'\bvv\b', 'w'),  # vv → w
        (r'0(?=[a-zA-Z])', 'O'),  # Leading 0 before letters
        (r'(?<=[a-zA-Z])1\b', 'l'),  # Trailing 1 after letters
        # Spacing issues
        (r'(\w)-\s*\n\s*(\w)', r'\1\2'),  # Hyphenated line breaks
        (r'\s+', ' '),  # Multiple spaces
        (r'\n{3,}', '\n\n'),  # Multiple newlines
        # Common words
        (r'\bth\s+e\b', 'the'),
        (r'\bw\s*h\s*i\s*c\s*h\b', 'which'),
        (r'\bj\s*o\s*u\s*r\s*n\s*a\s*l\s*i\s*s\s*m\b', 'journalism'),
    ]

    def __init__(self, clippings_dir: Optional[str] = None):
        """
        Initialize the clipping processor.

        Args:
            clippings_dir: Optional directory containing clipping files
        """
        self.clippings_dir = Path(clippings_dir) if clippings_dir else None
        self.processed_count = 0
        self.error_count = 0
        self.publication_counters = {}  # Track IDs per publication

    def process_directory(self, output_file: Optional[str] = None) -> List[Dict]:
        """
        Process all clippings in the configured directory.

        Args:
            output_file: Optional JSON output file path

        Returns:
            List of processed clipping records
        """
        if not self.clippings_dir or not self.clippings_dir.exists():
            print(f"[CLIPPING] Directory not found: {self.clippings_dir}")
            return []

        records = []

        # Find all text and JSON files
        files = list(self.clippings_dir.glob('*.txt'))
        files.extend(self.clippings_dir.glob('*.json'))

        print(f"[CLIPPING] Found {len(files)} files to process")

        for file_path in sorted(files):
            try:
                record = self.process_file(file_path)
                if record:
                    records.append(record)
                    self.processed_count += 1
            except Exception as e:
                print(f"[CLIPPING] Error processing {file_path.name}: {e}")
                self.error_count += 1

        print(f"[CLIPPING] Processed {self.processed_count} clippings ({self.error_count} errors)")

        if output_file:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(records, f, indent=2, ensure_ascii=False)
            print(f"[CLIPPING] Wrote {len(records)} records to {output_file}")

        return records

    def process_file(self, file_path: Path) -> Optional[Dict]:
        """
        Process a single clipping file.

        Args:
            file_path: Path to the clipping file

        Returns:
            Processed record dict or None
        """
        file_path = Path(file_path)

        if file_path.suffix == '.json':
            return self._process_json_file(file_path)
        else:
            return self._process_text_file(file_path)

    def process_text(self, raw_text: str, filename: str = '') -> Dict:
        """
        Process raw OCR text into a clipping record.

        Args:
            raw_text: Raw OCR text
            filename: Original filename for metadata hints

        Returns:
            Processed record dict
        """
        # Clean the OCR text
        cleaned_text = self.clean_ocr_text(raw_text)

        # Extract metadata
        metadata = self.extract_metadata(cleaned_text, filename)

        # Generate ID
        archive_id = self._generate_id(metadata.publication)

        # Build the record
        record = {
            'id': archive_id,
            'url': '',  # Clippings typically don't have URLs
            'title': metadata.headline or self._extract_title_from_text(cleaned_text),
            'author': metadata.author or 'Jay Rosen',
            'publication_date': metadata.date,
            'original_publication': metadata.publication or 'Unknown Publication',
            'publisher': metadata.publication or 'Unknown',
            'platform': 'newspaper',
            'content_type': 'Article',
            'format': 'text',
            'raw_text': cleaned_text,
            'excerpt': self._generate_excerpt(cleaned_text),
            'summary': '',  # To be filled by AI
            'thematic_categories': '',  # To be filled by AI
            'key_concepts': '',  # To be filled by AI
            'tags': '',
            'notes': f"OCR'd newspaper clipping. Source file: {filename}. Metadata confidence: {metadata.confidence:.0%}",
            'verified': 'false',
            'date_processed': datetime.now().strftime('%m/%d/%Y'),
        }

        # Add page/section if available
        if metadata.page:
            record['notes'] += f". Page: {metadata.page}"
        if metadata.section:
            record['notes'] += f". Section: {metadata.section}"

        return record

    def clean_ocr_text(self, text: str) -> str:
        """
        Clean OCR artifacts from text.

        Args:
            text: Raw OCR text

        Returns:
            Cleaned text
        """
        if not text:
            return ''

        cleaned = text

        # Apply OCR fixes
        for pattern, replacement in self.OCR_FIXES:
            cleaned = re.sub(pattern, replacement, cleaned, flags=re.IGNORECASE)

        # Fix smart quotes and special characters
        cleaned = cleaned.replace('"', '"').replace('"', '"')
        cleaned = cleaned.replace(''', "'").replace(''', "'")
        cleaned = cleaned.replace('—', '--').replace('–', '-')

        # Remove page markers and headers
        cleaned = re.sub(r'^.*?(?:Page|PAGE)\s*\d+.*?$', '', cleaned, flags=re.MULTILINE)

        # Normalize paragraph breaks
        cleaned = re.sub(r'\n\s*\n\s*\n+', '\n\n', cleaned)

        # Strip excessive whitespace
        cleaned = cleaned.strip()

        return cleaned

    def extract_metadata(self, text: str, filename: str = '') -> ClippingMetadata:
        """
        Extract metadata from clipping text and filename.

        Args:
            text: Clipping text
            filename: Original filename

        Returns:
            ClippingMetadata object
        """
        metadata = ClippingMetadata()
        confidence_factors = []

        # Try to extract from filename first (often formatted)
        # Expected formats: "NYT_1998-03-15_headline.txt" or "1998-03-15_publication.txt"
        if filename:
            # Extract date from filename
            file_date = base.us_date_from_iso(filename, anchored=False)
            if file_date:
                metadata.date = file_date
                confidence_factors.append(0.3)

            # Extract publication from filename prefix
            for pub_name, prefix in self.PUBLICATION_PREFIXES.items():
                if prefix.lower() in filename.lower() or pub_name in filename.lower():
                    metadata.publication = self._normalize_publication(pub_name)
                    confidence_factors.append(0.2)
                    break

        # Extract from text
        lines = text.split('\n')
        header_lines = lines[:20]  # Check first 20 lines for metadata

        for line in header_lines:
            line = line.strip()
            if not line:
                continue

            # Look for publication name
            if not metadata.publication:
                for pub_name, prefix in self.PUBLICATION_PREFIXES.items():
                    if pub_name in line.lower():
                        metadata.publication = self._normalize_publication(pub_name)
                        confidence_factors.append(0.2)
                        break

            # Look for date patterns
            if not metadata.date:
                date = self._extract_date(line)
                if date:
                    metadata.date = date
                    confidence_factors.append(0.2)

            # Look for byline
            if not metadata.author:
                author = self._extract_author(line)
                if author:
                    metadata.author = author
                    confidence_factors.append(0.15)

            # Look for page number
            if not metadata.page:
                page_match = re.search(r'(?:Page|PAGE|p\.?)\s*(\d+)', line)
                if page_match:
                    metadata.page = page_match.group(1)
                    confidence_factors.append(0.1)

        # Extract headline (usually first substantive line after metadata)
        metadata.headline = self._extract_headline(text)
        if metadata.headline:
            confidence_factors.append(0.15)

        # Calculate overall confidence
        metadata.confidence = min(sum(confidence_factors), 1.0)

        return metadata

    def _extract_date(self, text: str) -> str:
        """Extract date from text, return MM/DD/YYYY format."""
        # Pattern 1: March 15, 1998
        month_match = re.search(
            r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+'
            r'(\d{1,2}),?\s+(\d{4})',
            text, re.IGNORECASE
        )
        if month_match:
            month_names = {
                'january': '01', 'february': '02', 'march': '03', 'april': '04',
                'may': '05', 'june': '06', 'july': '07', 'august': '08',
                'september': '09', 'october': '10', 'november': '11', 'december': '12'
            }
            month = month_names[month_match.group(1).lower()]
            day = month_match.group(2).zfill(2)
            year = month_match.group(3)
            return f"{month}/{day}/{year}"

        # Pattern 2: 03/15/1998 or 15/03/1998
        date_match = re.search(r'(\d{1,2})/(\d{1,2})/(\d{4})', text)
        if date_match:
            # Assume MM/DD/YYYY for US newspapers
            return f"{date_match.group(1).zfill(2)}/{date_match.group(2).zfill(2)}/{date_match.group(3)}"

        # Pattern 3: 1998-03-15 (ISO)
        iso_date = base.us_date_from_iso(text, anchored=False)
        if iso_date:
            return iso_date

        return ''

    def _extract_author(self, text: str) -> str:
        """Extract author from byline text."""
        # Common byline patterns
        patterns = [
            r'^By\s+(.+?)(?:\s*[,|]|$)',
            r'^BY\s+(.+?)(?:\s*[,|]|$)',
            r'(?:Written by|Author:)\s*(.+?)(?:\s*[,|]|$)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                author = match.group(1).strip()
                # Clean up common suffixes
                author = re.sub(r'\s*(?:Staff Writer|Special to|Correspondent).*$', '', author, flags=re.I)
                if len(author) > 3 and len(author) < 50:
                    return author

        return ''

    def _extract_headline(self, text: str) -> str:
        """Extract headline from clipping text."""
        lines = text.split('\n')

        # Skip metadata lines, find first substantive headline
        for i, line in enumerate(lines[:15]):
            line = line.strip()
            if not line:
                continue

            # Skip common metadata patterns
            if re.match(r'^(By|BY|Page|PAGE|Section|\d{1,2}/\d{1,2})', line):
                continue
            if any(pub in line.lower() for pub in self.PUBLICATION_PREFIXES.keys()):
                continue

            # Headline candidates: relatively short, no periods at end, possibly uppercase
            if len(line) > 10 and len(line) < 200:
                if not line.endswith('.'):
                    return line
                # Allow sentence-style headlines
                if i < 5:  # Early in document
                    return line.rstrip('.')

        return ''

    def _extract_title_from_text(self, text: str) -> str:
        """Generate a title from the text content."""
        # Get first meaningful sentence
        sentences = re.split(r'[.!?]\s+', text[:500])
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) > 20 and len(sentence) < 200:
                return sentence[:100] + ('...' if len(sentence) > 100 else '')

        # Fallback: first N characters
        return text[:50].strip() + '...' if len(text) > 50 else text

    def _normalize_publication(self, name: str) -> str:
        """Normalize publication name to canonical form."""
        normalizations = {
            'nytimes': 'The New York Times',
            'ny times': 'The New York Times',
            'new york times': 'The New York Times',
            'wsj': 'The Wall Street Journal',
            'wall street journal': 'The Wall Street Journal',
            'wapo': 'The Washington Post',
            'washington post': 'The Washington Post',
            'lat': 'Los Angeles Times',
            'la times': 'Los Angeles Times',
            'los angeles times': 'Los Angeles Times',
            'chicago tribune': 'Chicago Tribune',
            'boston globe': 'The Boston Globe',
            'guardian': 'The Guardian',
            'the guardian': 'The Guardian',
            'columbia journalism review': 'Columbia Journalism Review',
            'american journalism review': 'American Journalism Review',
            'editor & publisher': 'Editor & Publisher',
            'nieman reports': 'Nieman Reports',
            'poynter': 'Poynter',
        }
        return normalizations.get(name.lower(), name.title())

    def _generate_id(self, publication: str) -> str:
        """Generate archive ID for a clipping."""
        # Determine prefix
        prefix = 'CLIP'
        for pub_name, pub_prefix in self.PUBLICATION_PREFIXES.items():
            if pub_name in publication.lower():
                prefix = pub_prefix
                break

        # Get next number for this prefix
        if prefix not in self.publication_counters:
            self.publication_counters[prefix] = 0
        self.publication_counters[prefix] += 1

        return f"{prefix}-{self.publication_counters[prefix]:05d}"

    def _generate_excerpt(self, text: str, length: int = 300) -> str:
        """Generate excerpt from text."""
        if not text:
            return ''

        # Skip headline (first line), get content
        lines = text.split('\n')
        content_start = 1 if len(lines) > 1 else 0
        content = '\n'.join(lines[content_start:])

        # Get first paragraph
        paragraphs = content.split('\n\n')
        excerpt = paragraphs[0] if paragraphs else content

        return base.truncate_on_word_boundary(excerpt, length).strip()

    def _process_text_file(self, file_path: Path) -> Optional[Dict]:
        """Process a text file containing OCR output."""
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            raw_text = f.read()

        return self.process_text(raw_text, file_path.name)

    def _process_json_file(self, file_path: Path) -> Optional[Dict]:
        """Process a JSON file with pre-extracted metadata."""
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # If it's already in our format, just clean and validate
        if 'raw_text' in data:
            data['raw_text'] = self.clean_ocr_text(data['raw_text'])
            if not data.get('id'):
                data['id'] = self._generate_id(data.get('original_publication', ''))
            return data

        # Otherwise, treat raw_text or text field as OCR output
        raw_text = data.get('raw_text', data.get('text', data.get('content', '')))
        return self.process_text(raw_text, file_path.name)

    def get_stats(self) -> Dict:
        """Get processing statistics."""
        return {
            'processed': self.processed_count,
            'errors': self.error_count,
            'publications': dict(self.publication_counters)
        }


def main():
    """
    CLI entry point for clipping processing.

    Usage:
        python clipping_processor.py /path/to/clippings/
        python clipping_processor.py /path/to/clippings/ --output records.json
        python clipping_processor.py --file /path/to/single/clipping.txt
    """
    import argparse

    parser = argparse.ArgumentParser(description='Process newspaper clippings')
    parser.add_argument('directory', nargs='?', help='Directory containing clipping files')
    parser.add_argument('--file', '-f', help='Process a single file')
    parser.add_argument('--output', '-o', help='Output JSON file path')
    parser.add_argument('--text', help='Process raw text directly')

    args = parser.parse_args()

    processor = ClippingProcessor(args.directory)

    if args.text:
        # Process raw text
        record = processor.process_text(args.text)
        print(json.dumps(record, indent=2))

    elif args.file:
        # Process single file
        record = processor.process_file(Path(args.file))
        if record:
            print(json.dumps(record, indent=2))
        else:
            print("[CLIPPING] No content extracted from file")

    elif args.directory:
        # Process directory
        processor.process_directory(args.output)
        if not args.output:
            # Print summary
            stats = processor.get_stats()
            print("\n[CLIPPING] Summary:")
            print(f"  Processed: {stats['processed']}")
            print(f"  Errors: {stats['errors']}")
            print(f"  By publication: {stats['publications']}")

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
