# -*- coding: utf-8 -*-
"""
Bulk Reprocessor for Rosen Archive

This script reprocesses all existing URLs to create a clean, final dataset
with corrected IDs, proper author attribution, accurate content extraction,
and consistent formatting.
"""

import sys
import os
import time
from pathlib import Path
import gspread
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from urllib.parse import urlparse
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from src.workflow import get_schema, enrich_data, generate_source_based_id, format_date_mmddyyyy
from src.entity_resolver import load_known_entities
from src.enhanced_pdf_formatter import EnhancedPDFFormatter
from src.logger import init_logger
from src.categorizer import summarize_and_classify

load_dotenv()

class BulkReprocessor:
    """Reprocesses all URLs with corrected workflow."""

    def __init__(self):
        """Initialize the bulk reprocessor."""
        self.logger = init_logger("bulk_reprocessing")
        self.schema = get_schema(str(ROOT_DIR / 'schema.json'))
        self.known_entities = load_known_entities(str(SRC_DIR / 'known_entities.json'))
        self.processed_count = 0
        self.success_count = 0
        self.error_count = 0
        self.pdf_formatter = EnhancedPDFFormatter()

        # Initialize Google Sheets connection
        try:
            credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
            credentials_path = ROOT_DIR / credentials_filename
            self.gc = gspread.service_account(filename=str(credentials_path))
            self.sh = self.gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
            self.urls_ws = self.sh.worksheet('urls_to_scrape')
            self.logger.logger.info("Google Sheets connection established")
        except Exception as e:
            self.logger.log_error("google_sheets", f"Failed to connect: {e}")
            raise

    def extract_real_content(self, url, timeout=30):
        """
        Extract real content from URL with multiple fallback strategies.

        Args:
            url: URL to scrape
            timeout: Request timeout in seconds

        Returns:
            dict with title, author, text, publication_date
        """
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'DNT': '1',
            'Connection': 'keep-alive',
        }

        try:
            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, 'html.parser')

            # Extract title with multiple strategies
            title = self._extract_title(soup, url)

            # Extract author with multiple strategies
            author = self._extract_author(soup, url)

            # Extract publication date
            pub_date = self._extract_publication_date(soup, url)

            # Extract main content
            content = self._extract_content(soup, url)

            return {
                'title': title,
                'author': author,
                'text': content,
                'publication_date': pub_date,
                'url': url,
                'scraping_success': True
            }

        except Exception as e:
            self.logger.log_error("scraping", f"Failed to scrape {url}: {e}")
            return {
                'title': 'Failed to Extract Title',
                'author': 'Unknown Author',
                'text': '',
                'publication_date': '',
                'url': url,
                'scraping_success': False,
                'error': str(e)
            }

    def _extract_title(self, soup, url):
        """Extract title using multiple strategies."""
        # Strategy 1: h1 tags
        h1_tags = soup.find_all('h1')
        for h1 in h1_tags:
            text = h1.get_text(strip=True)
            if len(text) > 10 and len(text) < 200:  # Reasonable title length
                return text

        # Strategy 2: title tag
        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text(strip=True)
            # Clean up title (remove site name suffixes)
            for separator in [' - ', ' | ', ' :: ', ' — ']:
                if separator in title:
                    title = title.split(separator)[0]
            return title

        # Strategy 3: meta tags
        meta_title = soup.find('meta', property='og:title')
        if meta_title and meta_title.get('content'):
            return meta_title.get('content')

        return 'Unknown Title'

    def _extract_author(self, soup, url):
        """Extract author using multiple strategies."""
        domain = urlparse(url).netloc.lower()

        # Strategy 1: Known patterns by domain
        if 'pressthink.org' in domain:
            return 'Jay Rosen'

        # Strategy 2: Common author selectors
        author_selectors = [
            'meta[name="author"]',
            'meta[property="article:author"]',
            '.author-name', '.byline', '.author',
            '[data-author]', '.post-author', '.writer',
            '.article-author', '.entry-author',
            '.byline-author', '.post-byline'
        ]

        for selector in author_selectors:
            elem = soup.select_one(selector)
            if elem:
                if elem.get('content'):  # meta tag
                    author = elem.get('content')
                else:
                    author = elem.get_text(strip=True)

                # Clean up author name
                author = author.replace('By ', '').replace('by ', '').strip()
                if len(author) > 2 and len(author) < 50:
                    return author

        # Strategy 3: Look for "By [Name]" in text
        text_content = soup.get_text()
        import re
        by_match = re.search(r'(?:^|\\n)\\s*[Bb]y\\s+([A-Z][a-zA-Z\\s\\.]{2,30})', text_content)
        if by_match:
            return by_match.group(1).strip()

        return 'Unknown Author'

    def _extract_publication_date(self, soup, url):
        """Extract publication date using multiple strategies."""
        date_selectors = [
            'meta[property="article:published_time"]',
            'meta[name="publish-date"]',
            'meta[name="date"]',
            'meta[name="publication-date"]',
            'time[datetime]',
            '.publish-date', '.publication-date', '.date',
            '.post-date', '.entry-date'
        ]

        for selector in date_selectors:
            elem = soup.select_one(selector)
            if elem:
                date_val = elem.get('content') or elem.get('datetime') or elem.get_text(strip=True)
                if date_val:
                    # Clean and validate date
                    import re
                    date_match = re.search(r'\\d{4}-\\d{2}-\\d{2}', date_val)
                    if date_match:
                        return date_match.group(0)

                    # Try other common formats
                    date_match = re.search(r'\\d{1,2}/\\d{1,2}/\\d{4}', date_val)
                    if date_match:
                        return date_match.group(0)

        return ''

    def _extract_content(self, soup, url):
        """Extract main article content."""
        # Remove unwanted elements
        for unwanted in soup.select('nav, .nav, .navigation, .ads, .advertisement, .social-share, .sidebar, .header, .footer, .comments, .related, .popup, .modal'):
            unwanted.decompose()

        # Strategy 1: Common article selectors
        content_selectors = [
            'article .content', 'article .post-content', 'article .entry-content',
            '.article-content', '.post-content', '.entry-content',
            '.article-body', '.post-body', '.entry-body',
            'article', '[role="main"]', 'main .content',
            '.content', '.post', '.entry'
        ]

        for selector in content_selectors:
            elem = soup.select_one(selector)
            if elem:
                text = elem.get_text(strip=True, separator=' ')
                # Must be substantial content
                if len(text) > 200:
                    return self._clean_text(text)

        # Strategy 2: Collect all paragraph text
        paragraphs = soup.find_all('p')
        content = ' '.join([p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 20])

        if len(content) > 200:
            return self._clean_text(content)

        return ''

    def _clean_text(self, text):
        """Clean extracted text content."""
        import re

        # Remove multiple whitespace
        text = re.sub(r'\\s+', ' ', text)

        # Remove common web artifacts
        artifacts = [
            'Skip to main content',
            'Subscribe to our newsletter',
            'Follow us on',
            'Share this article',
            'Advertisement',
            'Continue reading',
            'Read more'
        ]

        for artifact in artifacts:
            text = text.replace(artifact, '')

        return text.strip()

    def create_final_record(self, scraped_data, existing_ids):
        """Create a properly formatted final record."""
        url = scraped_data['url']

        # Generate correct ID
        record_id = generate_source_based_id(url, existing_ids)

        # Format date
        formatted_date = format_date_mmddyyyy(scraped_data.get('publication_date', ''))

        # Enrich with platform and other metadata
        enriched = enrich_data(scraped_data.copy(), url, self.known_entities)

        # Create excerpt and pull quote from actual content
        text = scraped_data.get('text', '')
        excerpt = text[:300] + '...' if len(text) > 300 else text

        # Extract meaningful pull quote (first complete sentence)
        sentences = text.split('. ')
        pull_quote = sentences[0] + '.' if sentences and len(sentences[0]) > 20 else excerpt[:100] + '...'

        # AI Analysis using categorizer
        ai_analysis = {}
        if text and len(text.strip()) > 100:  # Only run AI on substantial content
            try:
                print("  [AI] Running categorization analysis...")
                ai_analysis = summarize_and_classify(text, self.schema) or {}
                print(f"  [AI] Analysis complete: {len(ai_analysis)} fields")
            except Exception as e:
                print(f"  [AI] Analysis failed: {e}")
                ai_analysis = {}
        else:
            print(f"  [AI] Skipping - insufficient content ({len(text)} chars)")

        # Determine original publication from URL
        domain = urlparse(url).netloc.lower()
        publication_map = {
            'www.cjr.org': 'Columbia Journalism Review',
            'cjr.org': 'Columbia Journalism Review',
            'www.thenation.com': 'The Nation',
            'thenation.com': 'The Nation',
            'pressthink.org': 'PressThink',
            'www.nytimes.com': 'The New York Times',
            'www.washingtonpost.com': 'The Washington Post',
            'www.theguardian.com': 'The Guardian',
            'substack.com': 'Substack'
        }

        original_pub = publication_map.get(domain, enriched.get('publisher', 'Unknown Publication'))

        # Create comprehensive final record
        final_record = {
            'id': record_id,
            'title': scraped_data.get('title', ''),
            'url': url,
            'author': scraped_data.get('author', ''),
            'publication_date': formatted_date,
            'original_publication': original_pub,
            'publisher': original_pub,
            'platform': enriched.get('platform', ''),
            'collection_id': enriched.get('collection_id', ''),
            'content_type': enriched.get('content_type', 'Article'),
            'format': enriched.get('format', 'text'),
            'word_count': len(text.split()) if text else 0,
            'length_in_seconds': '',
            'excerpt': excerpt,
            'summary': ai_analysis.get('summary', f'Article by {scraped_data.get("author", "Unknown")} examining journalism and media topics.'),
            'thematic_categories': ', '.join(ai_analysis.get('thematic_categories', ['Press & Media Criticism'])) if isinstance(ai_analysis.get('thematic_categories'), list) else ai_analysis.get('thematic_categories', 'Press & Media Criticism'),
            'key_concepts': ', '.join(ai_analysis.get('key_concepts', [])) if isinstance(ai_analysis.get('key_concepts'), list) else ai_analysis.get('key_concepts', ''),
            'series': ai_analysis.get('series', ''),
            'era': ai_analysis.get('era', 'Digital Media & Platform Era (2017-Present)'),
            'scope': ai_analysis.get('scope', 'Media Analysis'),
            'tags': ', '.join(ai_analysis.get('tags', ['journalism', 'media'])) if isinstance(ai_analysis.get('tags'), list) else ai_analysis.get('tags', 'journalism, media'),
            'related_to': '',
            'responds_to': '',
            'influence': '',
            'copyright': f'Copyright {original_pub}',
            'license': 'Fair Use',
            'permissions': enriched.get('permissions', 'Standard Copyright'),
            'date_processed': datetime.now().strftime('%m/%d/%Y %H:%M:%S'),
            'gdrive_pdf_link': '',
            'gdrive_raw_file_link': '',
            'gdrive_transcript_link': '',
            'transcript_filepath': '',
            'pull_quote': pull_quote,
            'raw_text': text,
            'verified': False,
            'notes': 'Reprocessed with corrected workflow' if scraped_data.get('scraping_success') else 'Scraping failed - manual review needed'
        }

        return final_record

    def update_source_sheet_status(self, url, status, notes=""):
        """
        Update the urls_to_scrape sheet with processing status.

        Args:
            url: The URL that was processed
            status: Processing status (success/failed)
            notes: Additional notes about the processing
        """
        try:
            # Find the row with this URL
            all_values = self.urls_ws.get_all_values()
            headers = all_values[0] if all_values else []

            # Find URL column (should be column B, index 1)
            url_col = 1
            if len(headers) > 1 and 'url' in headers[1].lower():
                url_col = 1
            elif len(headers) > 0 and 'url' in headers[0].lower():
                url_col = 0

            # Find the row with matching URL
            for row_idx, row_values in enumerate(all_values[1:], start=2):  # Start from row 2
                if row_idx <= len(all_values) and len(row_values) > url_col:
                    if row_values[url_col] == url:
                        # Update column C (processed date) and column D (notes)
                        current_time = datetime.now().strftime('%m/%d/%Y %H:%M:%S')

                        # Update processed date (column C)
                        self.urls_ws.update_cell(row_idx, 3, current_time)

                        # Update notes (column D)
                        status_note = f"{status} - {notes}" if notes else status
                        self.urls_ws.update_cell(row_idx, 4, status_note)

                        self.logger.logger.info(f"Updated source sheet row {row_idx}: {status}")
                        return True

            self.logger.log_error("source_update", f"URL not found in source sheet: {url}")
            return False

        except Exception as e:
            self.logger.log_error("source_update", f"Failed to update source sheet for {url}: {e}")
            return False

    def process_batch(self, urls, batch_size=10):
        """Process a batch of URLs."""
        results = []
        existing_ids = set()

        self.logger.logger.info(f"Processing batch of {len(urls)} URLs")

        for i, url in enumerate(urls):
            try:
                self.logger.logger.info(f"Processing {i+1}/{len(urls)}: {url}")

                # Extract content
                scraped_data = self.extract_real_content(url, timeout=20)

                # Create final record
                final_record = self.create_final_record(scraped_data, existing_ids)
                existing_ids.add(final_record['id'])

                # Determine processing status and notes
                if scraped_data.get('scraping_success'):
                    # Generate enhanced PDF if content was successfully scraped
                    pdf_status = ""
                    if scraped_data.get('text'):
                        try:
                            pdf_path = self.pdf_formatter.create_formatted_pdf(final_record)
                            self.logger.logger.info(f"Enhanced PDF generated: {pdf_path}")
                            pdf_status = "PDF generated"
                        except Exception as pdf_error:
                            self.logger.log_error("pdf_generation", f"Enhanced PDF failed for {url}: {pdf_error}")
                            pdf_status = "PDF failed"

                    # Update source sheet with success status
                    status_notes = f"ID: {final_record['id']}, Author: {final_record['author']}, {pdf_status}"
                    self.update_source_sheet_status(url, "SUCCESS", status_notes)
                else:
                    # Update source sheet with failure status
                    error_msg = scraped_data.get('error', 'Unknown scraping error')
                    self.update_source_sheet_status(url, "FAILED", f"Scraping failed: {error_msg}")

                results.append(final_record)
                self.success_count += 1

                # Small delay to avoid overwhelming servers
                time.sleep(1)

            except Exception as e:
                self.logger.log_error("batch_processing", f"Failed to process {url}: {e}")
                self.error_count += 1
                continue

            self.processed_count += 1

        return results

    def initialize_final_sheet(self, sheet_name="final"):
        """Initialize the final sheet with headers."""
        try:
            # Try to get existing sheet or create new one
            try:
                final_ws = self.sh.worksheet(sheet_name)
                # Check if it's already initialized (has headers)
                if not final_ws.row_values(1):
                    # Empty sheet, add headers
                    headers = self.schema['output_headers']
                    final_ws.append_row(headers)
                    self.logger.logger.info(f"Initialized {sheet_name} sheet with headers")
                else:
                    self.logger.logger.info(f"Final sheet {sheet_name} already exists with headers")
            except gspread.WorksheetNotFound:
                final_ws = self.sh.add_worksheet(title=sheet_name, rows=1000, cols=40)
                headers = self.schema['output_headers']
                final_ws.append_row(headers)
                self.logger.logger.info(f"Created new {sheet_name} sheet with headers")

            return final_ws
        except Exception as e:
            self.logger.log_error("sheet_initialization", f"Failed to initialize final sheet: {e}")
            raise

    def append_to_final_sheet(self, records, final_ws):
        """Append records to the final sheet incrementally."""
        try:
            headers = self.schema['output_headers']
            rows = []
            for record in records:
                row = []
                for header in headers:
                    value = str(record.get(header, ''))
                    # Truncate large text fields to prevent Google Sheets 50K limit
                    if len(value) > 45000:  # Leave some buffer
                        if header in ['raw_text', 'summary', 'excerpt']:
                            value = value[:45000] + "... [TRUNCATED]"
                        else:
                            value = value[:45000]
                    row.append(value)
                rows.append(row)

            if rows:
                final_ws.append_rows(rows)
                self.logger.logger.info(f"Appended {len(rows)} records to final sheet")
                return True
            return False
        except Exception as e:
            self.logger.log_error("incremental_writing", f"Failed to append to final sheet: {e}")
            return False

    def write_to_final_sheet(self, records, sheet_name="final"):
        """Write processed records to the final Google Sheet (legacy method for compatibility)."""
        try:
            final_ws = self.initialize_final_sheet(sheet_name)
            return self.append_to_final_sheet(records, final_ws)
        except Exception as e:
            self.logger.log_error("sheet_writing", f"Failed to write to final sheet: {e}")
            raise

def main():
    """Main execution function."""
    processor = BulkReprocessor()

    print("=== ROSEN ARCHIVE BULK REPROCESSOR ===")
    print("This will reprocess all URLs with corrected workflow")
    print()

    # Get URLs from existing sheet
    try:
        urls_ws = processor.sh.worksheet('urls_to_scrape')
        url_records = urls_ws.get_all_records()
        urls = [record.get('url') for record in url_records if record.get('url')]

        print(f"Found {len(urls)} URLs to reprocess")
        print("Auto-proceeding with full reprocessing...")

        # Auto-confirm for production run

        # Initialize final sheet with headers
        print("Initializing final sheet...")
        final_ws = processor.initialize_final_sheet("final")

        # Process in batches with incremental writing
        batch_size = 10
        all_results = []

        for i in range(0, len(urls), batch_size):
            batch_urls = urls[i:i+batch_size]
            batch_num = i//batch_size + 1
            total_batches = (len(urls) + batch_size - 1)//batch_size

            print(f"\\nProcessing batch {batch_num}/{total_batches}")

            batch_results = processor.process_batch(batch_urls, batch_size)
            all_results.extend(batch_results)

            # Write this batch to final sheet immediately
            if batch_results:
                success = processor.append_to_final_sheet(batch_results, final_ws)
                if success:
                    print(f"[SUCCESS] Batch {batch_num} written to final sheet ({len(batch_results)} records)")
                else:
                    print(f"[FAILED] Failed to write batch {batch_num} to final sheet")

            # Progress update
            print(f"Progress: {len(all_results)}/{len(urls)} URLs processed")
            print(f"Success rate: {processor.success_count}/{processor.processed_count} ({(processor.success_count/max(processor.processed_count,1)*100):.1f}%)")
            print(f"Final sheet progress: {len(all_results)} records written")

        print("\\n=== REPROCESSING COMPLETE ===")
        print(f"Total processed: {processor.processed_count}")
        print(f"Successful: {processor.success_count}")
        print(f"Errors: {processor.error_count}")
        print(f"Final records: {len(all_results)}")
        print("\\nCheck the 'final' tab in your Google Sheet!")

    except Exception as e:
        print(f"Process failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
