# -*- coding: utf-8 -*-
"""
Text Cleaning and Formatting System

This module provides comprehensive text cleaning capabilities for scraped content.
It handles common scraping artifacts, formatting issues, and content quality problems.

Features:
- HTML artifact removal
- Navigation and UI element filtering
- Paragraph structure improvement
- Special character normalization
- Content deduplication
- Reading flow optimization
"""

import re
import html
import unicodedata
from typing import List, Dict, Optional, Tuple
import gspread
import os
import sys
from dotenv import load_dotenv
import time
from datetime import datetime

# Set UTF-8 encoding for Windows console
if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())

# Load environment variables
load_dotenv()

class TextCleaner:
    """
    Comprehensive text cleaning system for scraped web content.
    """
    
    def __init__(self):
        self.cleaning_stats = {
            'total_processed': 0,
            'significant_improvements': 0,
            'minor_improvements': 0,
            'no_changes_needed': 0,
            'processing_errors': 0
        }
        
        # Common web navigation and UI patterns to remove
        self.navigation_patterns = [
            r'Skip to main content',
            r'Skip to content',
            r'Jump to navigation',
            r'Main navigation',
            r'Primary navigation',
            r'Secondary navigation',
            r'Breadcrumb navigation',
            r'You are here:',
            r'Home\s*>\s*',
            r'Categories?:',
            r'Tags?:',
            r'Share this:?',
            r'Share on:?',
            r'Follow us:?',
            r'Subscribe to:?',
            r'Newsletter signup',
            r'Email subscription',
            r'Related articles?:?',
            r'More from:?',
            r'Also read:?',
            r'You might also like:?',
            r'Recommended reading:?',
            r'Popular posts?:?',
            r'Recent posts?:?',
            r'Latest news:?',
            r'Breaking news:?',
            r'Advertisement',
            r'Sponsored content',
            r'Ads by',
            r'Cookie policy',
            r'Privacy policy',
            r'Terms of service',
            r'Legal notice',
            r'Copyright notice',
            r'All rights reserved',
            r'Back to top',
            r'Scroll to top',
            r'Print this page',
            r'Email this page',
            r'Save article',
            r'Bookmark this',
            r'Add to favorites',
            r'Reading time:',
            r'Published:',
            r'Updated:',
            r'Last modified:',
            r'Author:',
            r'By:',
            r'Written by:',
            r'Posted by:',
            r'Source:',
            r'Via:',
            r'Originally published:',
            r'Comments?\s*\(\d+\)',
            r'\d+\s*comments?',
            r'Leave a comment',
            r'Post a comment',
            r'Submit comment',
            r'Login to comment',
            r'Sign in to comment',
            r'Register to comment',
        ]
        
        # Social media and sharing patterns
        self.social_patterns = [
            r'Facebook',
            r'Twitter',
            r'LinkedIn',
            r'Instagram',
            r'YouTube',
            r'Pinterest',
            r'Reddit',
            r'WhatsApp',
            r'Telegram',
            r'Share via email',
            r'Copy link',
            r'Get link',
            r'Permalink',
            r'Like this:?',
            r'Tweet this',
            r'Share this',
            r'Pin this',
            r'Follow @\w+',
            r'@\w+\s*on\s*(Twitter|Facebook|Instagram)',
            r'Find us on\s*(Facebook|Twitter|Instagram)',
            r'Connect with us',
            r'Social media',
            r'Social links',
        ]
        
        # Common footer and header content
        self.structural_patterns = [
            r'Header menu',
            r'Footer menu',
            r'Site navigation',
            r'Page navigation',
            r'Pagination',
            r'Previous page',
            r'Next page',
            r'Page \d+ of \d+',
            r'Results \d+-\d+ of \d+',
            r'Showing \d+ of \d+ results',
            r'Load more',
            r'Show more',
            r'Read more',
            r'Continue reading',
            r'Full article',
            r'Complete story',
            r'Entire article',
            r'View full content',
            r'Expand article',
            r'Show full text',
            r'Mobile version',
            r'Desktop version',
            r'Print version',
            r'PDF version',
            r'Text size:',
            r'Font size:',
            r'Increase text',
            r'Decrease text',
            r'Reset text',
        ]
        
        # JavaScript and technical artifacts
        self.technical_patterns = [
            r'JavaScript is disabled',
            r'Enable JavaScript',
            r'This site requires JavaScript',
            r'Please enable JavaScript',
            r'document\.write',
            r'window\.location',
            r'<script[\s\S]*?</script>',
            r'<style[\s\S]*?</style>',
            r'<noscript[\s\S]*?</noscript>',
            r'<!-- [\s\S]*? -->',
            r'&nbsp;',
            r'&amp;',
            r'&lt;',
            r'&gt;',
            r'&quot;',
            r'&#\d+;',
            r'&[a-zA-Z]+;',
        ]
    
    def clean_text(self, raw_text: str, aggressive: bool = False) -> Dict[str, any]:
        """
        Comprehensively cleans scraped text content.
        
        Args:
            raw_text (str): Raw text content from scraping
            aggressive (bool): Whether to apply aggressive cleaning
            
        Returns:
            dict: Cleaning results with cleaned text and metadata
        """
        if not raw_text or not isinstance(raw_text, str):
            return {
                'cleaned_text': '',
                'original_length': 0,
                'cleaned_length': 0,
                'improvement_percentage': 0,
                'cleaning_actions': [],
                'quality_score': 0
            }
        
        original_text = raw_text
        original_length = len(raw_text)
        cleaning_actions = []
        
        try:
            # Step 1: Basic HTML and encoding cleanup
            text = self._clean_html_artifacts(raw_text)
            if text != raw_text:
                cleaning_actions.append('HTML artifacts removed')
            
            # Step 2: Unicode normalization
            text = self._normalize_unicode(text)
            cleaning_actions.append('Unicode normalized')
            
            # Step 3: Remove navigation and UI elements
            text = self._remove_navigation_elements(text)
            if len(text) < len(original_text) * 0.95:
                cleaning_actions.append('Navigation elements removed')
            
            # Step 4: Clean social media and sharing content
            text = self._remove_social_elements(text)
            cleaning_actions.append('Social media content cleaned')
            
            # Step 5: Remove structural web elements
            text = self._remove_structural_elements(text)
            cleaning_actions.append('Structural elements cleaned')
            
            # Step 6: Technical artifact removal
            text = self._remove_technical_artifacts(text)
            cleaning_actions.append('Technical artifacts removed')
            
            # Step 7: Paragraph structure improvement
            text = self._improve_paragraph_structure(text)
            cleaning_actions.append('Paragraph structure improved')
            
            # Step 8: Remove repetitive content
            text = self._remove_repetitive_content(text)
            cleaning_actions.append('Repetitive content removed')
            
            # Step 9: Final formatting cleanup
            text = self._final_formatting_cleanup(text)
            cleaning_actions.append('Final formatting applied')
            
            # Step 10: Aggressive cleaning if requested
            if aggressive:
                text = self._aggressive_cleaning(text)
                cleaning_actions.append('Aggressive cleaning applied')
            
            # Calculate improvement metrics
            cleaned_length = len(text)
            improvement_percentage = self._calculate_improvement_percentage(
                original_text, text
            )
            quality_score = self._calculate_quality_score(text)
            
            return {
                'cleaned_text': text.strip(),
                'original_length': original_length,
                'cleaned_length': cleaned_length,
                'improvement_percentage': improvement_percentage,
                'cleaning_actions': cleaning_actions,
                'quality_score': quality_score,
                'significant_improvement': improvement_percentage > 20,
                'minor_improvement': 5 < improvement_percentage <= 20,
                'no_improvement_needed': improvement_percentage <= 5
            }
            
        except Exception as e:
            self.cleaning_stats['processing_errors'] += 1
            return {
                'cleaned_text': original_text,
                'original_length': original_length,
                'cleaned_length': original_length,
                'improvement_percentage': 0,
                'cleaning_actions': [f'Error during cleaning: {str(e)}'],
                'quality_score': 0,
                'error': str(e)
            }
    
    def _clean_html_artifacts(self, text: str) -> str:
        """Removes HTML tags and decodes HTML entities."""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', ' ', text)
        
        # Decode HTML entities
        text = html.unescape(text)
        
        # Remove common HTML artifacts
        for pattern in self.technical_patterns:
            text = re.sub(pattern, ' ', text, flags=re.IGNORECASE | re.MULTILINE)
        
        return text
    
    def _normalize_unicode(self, text: str) -> str:
        """Normalizes Unicode characters and fixes encoding issues."""
        # Normalize Unicode characters
        text = unicodedata.normalize('NFKC', text)
        
        # Fix common encoding issues
        replacements = {
            '\u2019': "'",  # Right single quotation mark
            '\u2018': "'",  # Left single quotation mark
            '\u201c': '"',  # Left double quotation mark
            '\u201d': '"',  # Right double quotation mark
            '\u2013': '-',  # En dash
            '\u2014': '--', # Em dash
            '\u2026': '...', # Ellipsis
            '\u00a0': ' ',  # Non-breaking space
            '\u200b': '',   # Zero-width space
            '\u200c': '',   # Zero-width non-joiner
            '\u200d': '',   # Zero-width joiner
            '\ufeff': '',   # Zero-width no-break space (BOM)
        }
        
        for old, new in replacements.items():
            text = text.replace(old, new)
        
        return text
    
    def _remove_navigation_elements(self, text: str) -> str:
        """Removes navigation and UI elements."""
        for pattern in self.navigation_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)
        
        return text
    
    def _remove_social_elements(self, text: str) -> str:
        """Removes social media and sharing elements."""
        for pattern in self.social_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)
        
        return text
    
    def _remove_structural_elements(self, text: str) -> str:
        """Removes structural web page elements."""
        for pattern in self.structural_patterns:
            text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.MULTILINE)
        
        return text
    
    def _remove_technical_artifacts(self, text: str) -> str:
        """Removes technical artifacts and code snippets."""
        # Remove URLs that aren't part of article content
        text = re.sub(r'https?://\S+(?=\s|$)', '', text)
        
        # Remove email addresses that aren't part of content
        text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '', text)
        
        # Remove phone numbers
        text = re.sub(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '', text)
        
        # Remove isolated numbers and codes
        text = re.sub(r'\b\d{8,}\b', '', text)  # Long number sequences
        
        return text
    
    def _improve_paragraph_structure(self, text: str) -> str:
        """Improves paragraph structure and flow."""
        # Fix line breaks and create proper paragraphs
        text = re.sub(r'\n{3,}', '\n\n', text)  # Limit to double line breaks
        text = re.sub(r'(?<!\n)\n(?!\n)', ' ', text)  # Convert single line breaks to spaces
        
        # Remove excessive spaces
        text = re.sub(r' {3,}', '  ', text)  # Limit multiple spaces to double
        text = re.sub(r'\t+', ' ', text)  # Convert tabs to spaces
        
        # Fix sentence spacing
        text = re.sub(r'([.!?])\s*([A-Z])', r'\1 \2', text)
        
        return text
    
    def _remove_repetitive_content(self, text: str) -> str:
        """Removes repetitive sentences and paragraphs."""
        paragraphs = text.split('\n\n')
        unique_paragraphs = []
        seen_paragraphs = set()
        
        for paragraph in paragraphs:
            paragraph = paragraph.strip()
            if not paragraph:
                continue
                
            # Create a normalized version for comparison
            normalized = re.sub(r'\s+', ' ', paragraph.lower())
            
            # Skip very short paragraphs that are likely artifacts
            if len(normalized) < 20:
                continue
            
            # Skip if we've seen this paragraph before
            if normalized in seen_paragraphs:
                continue
            
            # Skip paragraphs that are mostly non-alphabetic
            alpha_ratio = sum(c.isalpha() for c in paragraph) / len(paragraph)
            if alpha_ratio < 0.6:
                continue
            
            seen_paragraphs.add(normalized)
            unique_paragraphs.append(paragraph)
        
        return '\n\n'.join(unique_paragraphs)
    
    def _final_formatting_cleanup(self, text: str) -> str:
        """Applies final formatting improvements."""
        # Remove leading/trailing whitespace from paragraphs
        paragraphs = []
        for paragraph in text.split('\n\n'):
            paragraph = paragraph.strip()
            if paragraph:
                paragraphs.append(paragraph)
        
        # Join paragraphs and apply final cleanup
        text = '\n\n'.join(paragraphs)
        
        # Final whitespace cleanup
        text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces/tabs to single space
        text = re.sub(r'\n +', '\n', text)   # Spaces at start of lines
        text = re.sub(r' +\n', '\n', text)   # Spaces at end of lines
        
        return text.strip()
    
    def _aggressive_cleaning(self, text: str) -> str:
        """Applies aggressive cleaning for heavily corrupted content."""
        # Remove lines that are mostly punctuation or special characters
        lines = text.split('\n')
        clean_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Calculate ratio of alphabetic characters
            alpha_count = sum(c.isalpha() for c in line)
            total_count = len(line)
            
            if total_count == 0:
                continue
            
            alpha_ratio = alpha_count / total_count
            
            # Skip lines with too low alphabetic content
            if alpha_ratio < 0.5 and total_count > 5:
                continue
            
            # Skip very short lines that are likely artifacts
            if len(line) < 10 and not any(c in line for c in '.!?'):
                continue
            
            clean_lines.append(line)
        
        return '\n\n'.join(clean_lines)
    
    def _calculate_improvement_percentage(self, original: str, cleaned: str) -> float:
        """Calculates improvement percentage based on content quality."""
        if not original:
            return 0
        
        # Calculate various quality metrics
        original_lines = len(original.split('\n'))
        cleaned_lines = len(cleaned.split('\n'))
        
        original_words = len(original.split())
        cleaned_words = len(cleaned.split())
        
        # If we reduced content by more than 50%, that's likely an improvement
        if cleaned_words < original_words * 0.5:
            reduction_score = min(50, (original_words - cleaned_words) / original_words * 100)
        else:
            reduction_score = 0
        
        # Calculate structure improvement (fewer but longer lines is generally better)
        if original_lines > 0 and cleaned_lines > 0:
            avg_original_line_length = len(original) / original_lines
            avg_cleaned_line_length = len(cleaned) / cleaned_lines
            
            if avg_cleaned_line_length > avg_original_line_length:
                structure_score = min(30, (avg_cleaned_line_length - avg_original_line_length) / avg_original_line_length * 100)
            else:
                structure_score = 0
        else:
            structure_score = 0
        
        return min(100, reduction_score + structure_score)
    
    def _calculate_quality_score(self, text: str) -> int:
        """Calculates a quality score (0-100) for the cleaned text."""
        if not text:
            return 0
        
        score = 0
        
        # Basic length check
        if 100 <= len(text) <= 10000:
            score += 20
        elif len(text) > 50:
            score += 10
        
        # Paragraph structure
        paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        if 2 <= len(paragraphs) <= 20:
            score += 20
        
        # Sentence structure
        sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
        if len(sentences) >= 3:
            score += 15
        
        # Word count and readability
        words = text.split()
        if 50 <= len(words) <= 2000:
            score += 15
        
        # Alphabetic content ratio
        alpha_ratio = sum(c.isalpha() for c in text) / len(text) if text else 0
        if alpha_ratio > 0.7:
            score += 20
        elif alpha_ratio > 0.5:
            score += 10
        
        # Check for common artifacts (negative scoring)
        artifact_patterns = ['javascript', 'cookie', 'advertisement', 'subscribe', 'follow us']
        artifact_count = sum(1 for pattern in artifact_patterns if pattern.lower() in text.lower())
        score -= artifact_count * 5
        
        return max(0, min(100, score))


def create_text_cleaning_workflow():
    """
    Creates a comprehensive workflow for cleaning all raw_text in the spreadsheet.
    """
    return TextCleaningWorkflow()


class TextCleaningWorkflow:
    """
    Manages the complete workflow for cleaning text in Google Sheets.
    """
    
    def __init__(self):
        self.cleaner = TextCleaner()
        self.batch_size = 10  # Process records in batches to manage API limits
        self.delay_between_batches = 2  # Seconds
    
    def _column_number_to_letter(self, col_num):
        """Converts column number to Excel-style letter (1=A, 2=B, etc.)"""
        result = ''
        while col_num > 0:
            col_num -= 1
            result = chr(col_num % 26 + ord('A')) + result
            col_num //= 26
        return result
        
    def connect_to_spreadsheet(self):
        """Connects to the Google Sheets spreadsheet."""
        try:
            # Use service account credentials
            credentials_path = 'google_credentials.json'
            gc = gspread.service_account(filename=credentials_path)
            
            # Open spreadsheet
            spreadsheet_name = os.getenv('SPREADSHEET_NAME')
            if not spreadsheet_name:
                # Fallback to spreadsheet key
                spreadsheet_key = os.getenv('SPREADSHEET_KEY')
                if spreadsheet_key:
                    spreadsheet = gc.open_by_key(spreadsheet_key)
                else:
                    raise ValueError("No spreadsheet name or key found in environment")
            else:
                spreadsheet = gc.open(spreadsheet_name)
            
            print(f"Successfully connected to spreadsheet")
            return spreadsheet
            
        except Exception as e:
            print(f"Error connecting to Google Sheets: {e}")
            return None
    
    def analyze_text_quality(self, max_records: int = 50):
        """
        Analyzes the quality of existing raw_text to understand cleaning needs.
        
        Args:
            max_records (int): Maximum number of records to analyze
        """
        spreadsheet = self.connect_to_spreadsheet()
        if not spreadsheet:
            return
        
        try:
            worksheet = spreadsheet.worksheet('test_runs')
            records = worksheet.get_all_records()
            
            if max_records:
                records = records[:max_records]
            
            print(f"Analyzing text quality for {len(records)} records...")
            
            analysis_results = {
                'total_records': len(records),
                'empty_raw_text': 0,
                'very_short_text': 0,
                'low_quality_text': 0,
                'medium_quality_text': 0,
                'high_quality_text': 0,
                'sample_issues': []
            }
            
            for i, record in enumerate(records):
                raw_text = record.get('raw_text', '')
                
                if not raw_text:
                    analysis_results['empty_raw_text'] += 1
                    continue
                
                if len(raw_text) < 100:
                    analysis_results['very_short_text'] += 1
                    continue
                
                # Quick quality assessment
                cleaning_result = self.cleaner.clean_text(raw_text)
                quality_score = cleaning_result['quality_score']
                improvement_potential = cleaning_result['improvement_percentage']
                
                if quality_score < 30:
                    analysis_results['low_quality_text'] += 1
                elif quality_score < 70:
                    analysis_results['medium_quality_text'] += 1
                else:
                    analysis_results['high_quality_text'] += 1
                
                # Collect sample issues
                if improvement_potential > 20 and len(analysis_results['sample_issues']) < 5:
                    analysis_results['sample_issues'].append({
                        'record_id': record.get('id', f'Record_{i+1}'),
                        'title': record.get('title', 'Unknown')[:50],
                        'original_length': len(raw_text),
                        'quality_score': quality_score,
                        'improvement_potential': improvement_potential,
                        'sample_text': raw_text[:200] + '...' if len(raw_text) > 200 else raw_text
                    })
                
                if i % 10 == 0:
                    print(f"  Analyzed {i+1}/{len(records)} records...")
            
            # Print analysis results
            print("\n" + "="*60)
            print("TEXT QUALITY ANALYSIS RESULTS")
            print("="*60)
            print(f"Total records analyzed: {analysis_results['total_records']}")
            print(f"Empty raw_text: {analysis_results['empty_raw_text']}")
            print(f"Very short text (<100 chars): {analysis_results['very_short_text']}")
            print(f"Low quality text (<30 score): {analysis_results['low_quality_text']}")
            print(f"Medium quality text (30-70 score): {analysis_results['medium_quality_text']}")
            print(f"High quality text (>70 score): {analysis_results['high_quality_text']}")
            
            if analysis_results['sample_issues']:
                print(f"\nSample issues found:")
                for issue in analysis_results['sample_issues']:
                    print(f"  - {issue['record_id']}: {issue['title']}")
                    print(f"    Quality: {issue['quality_score']}/100, Improvement potential: {issue['improvement_potential']:.1f}%")
            
            return analysis_results
            
        except Exception as e:
            print(f"Error during analysis: {e}")
            return None
    
    def clean_raw_text_batch(self, start_row: int = 1, num_records: int = 10, aggressive: bool = False):
        """
        Cleans raw_text for a batch of records and updates the spreadsheet.
        
        Args:
            start_row (int): Starting row number (1-based)
            num_records (int): Number of records to process
            aggressive (bool): Whether to apply aggressive cleaning
        """
        spreadsheet = self.connect_to_spreadsheet()
        if not spreadsheet:
            return
        
        try:
            worksheet = spreadsheet.worksheet('test_runs')
            
            # Get headers to find raw_text column
            headers = worksheet.row_values(1)
            if 'raw_text' not in headers:
                print("Error: 'raw_text' column not found in spreadsheet")
                return
            
            raw_text_col = headers.index('raw_text') + 1  # Convert to 1-based
            print(f"Found raw_text in column {raw_text_col} ({self._column_number_to_letter(raw_text_col)})")
            
            print(f"Processing {num_records} records starting from row {start_row + 1}...")
            
            # Get the range of data to process
            end_row = start_row + num_records
            records = worksheet.get_all_records()[start_row:end_row]
            
            updates = []
            results_summary = {
                'processed': 0,
                'improved': 0,
                'errors': 0,
                'significant_improvements': 0
            }
            
            for i, record in enumerate(records):
                try:
                    current_row = start_row + i + 2  # +2 for header and 0-based index
                    raw_text = record.get('raw_text', '')
                    
                    if not raw_text:
                        print(f"  Row {current_row}: Skipping empty raw_text")
                        continue
                    
                    print(f"  Row {current_row}: Processing '{record.get('title', 'Unknown')[:40]}...'")
                    
                    # Clean the text
                    cleaning_result = self.cleaner.clean_text(raw_text, aggressive=aggressive)
                    
                    # Check if cleaning made significant improvements
                    if cleaning_result['improvement_percentage'] > 5:
                        # Create proper cell reference (convert column number to letter)
                        col_letter = self._column_number_to_letter(raw_text_col)
                        cell_range = f'{col_letter}{current_row}'
                        
                        updates.append({
                            'range': cell_range,
                            'values': [[cleaning_result['cleaned_text']]]
                        })
                        
                        results_summary['improved'] += 1
                        
                        if cleaning_result['significant_improvement']:
                            results_summary['significant_improvements'] += 1
                        
                        print(f"    [IMPROVED] by {cleaning_result['improvement_percentage']:.1f}% "
                              f"(Quality: {cleaning_result['quality_score']}/100)")
                    else:
                        print(f"    [NO CHANGE] No significant improvement needed")
                    
                    results_summary['processed'] += 1
                    
                except Exception as e:
                    print(f"    [ERROR] Error processing row {current_row}: {e}")
                    results_summary['errors'] += 1
            
            # Apply updates in batch
            if updates:
                print(f"\nApplying {len(updates)} updates to spreadsheet...")
                
                for update in updates:
                    worksheet.update(range_name=update['range'], values=update['values'])
                    time.sleep(0.5)  # Rate limiting
                
                print("[SUCCESS] Updates applied successfully")
            else:
                print("No updates needed")
            
            # Print summary
            print(f"\n" + "="*50)
            print("CLEANING BATCH RESULTS")
            print("="*50)
            print(f"Records processed: {results_summary['processed']}")
            print(f"Records improved: {results_summary['improved']}")
            print(f"Significant improvements: {results_summary['significant_improvements']}")
            print(f"Errors: {results_summary['errors']}")
            
            return results_summary
            
        except Exception as e:
            print(f"Error during batch cleaning: {e}")
            return None


# Example usage and testing
if __name__ == "__main__":
    import sys
    
    # Create workflow
    workflow = TextCleaningWorkflow()
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == "analyze":
            # Analyze text quality
            max_records = int(sys.argv[2]) if len(sys.argv) > 2 else 50
            workflow.analyze_text_quality(max_records)
            
        elif command == "clean":
            # Clean text batch
            start_row = int(sys.argv[2]) if len(sys.argv) > 2 else 0
            num_records = int(sys.argv[3]) if len(sys.argv) > 3 else 10
            aggressive = len(sys.argv) > 4 and sys.argv[4].lower() == 'aggressive'
            
            workflow.clean_raw_text_batch(start_row, num_records, aggressive)
            
        else:
            print(f"Unknown command: {command}")
    else:
        print("Text Cleaning Workflow")
        print("=" * 25)
        print("Usage:")
        print("  python text_cleaner.py analyze [max_records]")
        print("  python text_cleaner.py clean [start_row] [num_records] [aggressive]")
        print("")
        print("Examples:")
        print("  python text_cleaner.py analyze 100")
        print("  python text_cleaner.py clean 0 10")
        print("  python text_cleaner.py clean 10 5 aggressive")