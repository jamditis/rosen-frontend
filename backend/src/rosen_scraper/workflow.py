# -*- coding: utf-8 -*-
"""
This module orchestrates the entire backend pipeline for the Rosen Scraper project.
It reads URLs from a Google Sheet, dispatches them to the appropriate content
processor, enriches the extracted data, and writes the final records back to
another sheet.
"""

from rosen_scraper import dispatcher
from rosen_scraper.processors import article_processor
import gspread
import os
import json
import time
from urllib.parse import urlparse
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime
import re
from rosen_scraper import pdf_generator
from rosen_scraper import transcript_saver
from rosen_scraper import entity_resolver
from rosen_scraper.logger import get_logger, init_logger, PoisonPillType
from rosen_scraper.poison_pill_handler import get_poison_pill_manager
from rosen_scraper.path_utils import find_project_root

# Load environment variables from a .env file for secure configuration management.
load_dotenv()

# --- Configuration ---
# A list of domains known to be behind a paywall, which are handled separately.
# Note: This is now also handled by the poison pill detection system
PAYWALLED_DOMAINS = ["www.washingtonpost.com", "www.nytimes.com", "www.wsj.com"]

# Define key file paths using pathlib for cleaner path handling.
SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = find_project_root()
SCHEMA_FILE = BASE_DIR / 'schema.json'
KNOWN_ENTITIES_FILE = BASE_DIR / 'known_entities.json'

def get_schema(schema_file):
    """
    Loads the JSON schema from the specified file.
    The schema contains taxonomy and configuration needed for processing.
    """
    try:
        with open(schema_file, 'r', encoding='utf-8-sig') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"FATAL: Could not load schema. Error: {e}")
        return None

def generate_source_based_id(publication, existing_ids):
    """
    Generates a unique ID based on the source publication.
    The ID consists of a 5-8 character uppercase prefix derived from the publication
    name and a 5-digit number that increments from the last ID of the same source.
    """
    if not publication or publication == 'Not Found':
        publication = "MISC"

    # Handle URL input by extracting domain first
    if publication.startswith('http'):
        from urllib.parse import urlparse
        domain = urlparse(publication).netloc
        # Map domains to proper publication names
        domain_to_pub = {
            'www.cjr.org': 'Columbia Journalism Review',
            'cjr.org': 'Columbia Journalism Review',
            'www.thenation.com': 'The Nation',
            'thenation.com': 'The Nation',
            'pressthink.org': 'PressThink',
            'www.pressthink.org': 'PressThink',
            'www.nytimes.com': 'New York Times',
            'nytimes.com': 'New York Times',
            'www.washingtonpost.com': 'Washington Post',
            'washingtonpost.com': 'Washington Post'
        }
        publication = domain_to_pub.get(domain.lower(), domain)

    # Create publication-based prefix
    pub_to_prefix = {
        'Columbia Journalism Review': 'CJR',
        'The Nation': 'NATION',
        'PressThink': 'PRESSTH',
        'New York Times': 'NYT',
        'Washington Post': 'WAPO',
        'The Guardian': 'GUARDIAN',
        'CNN': 'CNN',
        'Substack': 'SUBSTACK'
    }

    prefix = pub_to_prefix.get(publication, re.sub(r'[^A-Z0-9]', '', publication.upper())[:8])
    
    # Find the highest number for the given prefix.
    last_num = 0
    for i in existing_ids:
        if i.startswith(prefix):
            num = int(i.split('-')[1])
            if num > last_num:
                last_num = num
    
    new_id_num = last_num + 1
    # Format the new ID with leading zeros.
    return f"{prefix}-{new_id_num:05d}"

def format_date_mmddyyyy(date_str):
    """
    Convert various date formats to MM/DD/YYYY format.
    """
    if not date_str:
        return ""

    # Handle common formats
    from datetime import datetime
    formats = [
        '%Y-%m-%d',      # 2024-03-15
        '%m/%d/%Y',      # 03/15/2024
        '%d/%m/%Y',      # 15/03/2024
        '%Y-%m-%d %H:%M:%S',  # 2024-03-15 10:30:00
        '%m-%d-%Y',      # 03-15-2024
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime('%m/%d/%Y')
        except ValueError:
            continue

    # If no format matches, return original
    return date_str

def enrich_data(data, url, known_entities):
    """
    Adds final calculated and derived fields to the data dictionary before saving.
    This includes processing timestamps, word counts, platform information, and new schema fields.
    """
    data['date_processed'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if data.get('text') and not data.get('word_count'):
        data['word_count'] = len(data['text'].split())

    # Extract the domain and a simplified platform name from the URL.
    domain = urlparse(url).netloc
    platform = entity_resolver.resolve_platform(url, known_entities)
    if not platform:
        platform = re.sub(r'^(www\.)?(.+?)\..+$', r'\2', domain).capitalize()
    data.setdefault('platform', platform)
    # Use the original publication if found, otherwise default to the platform name.
    data.setdefault('publisher', data.get('original_publication') or platform)

    # Set default metadata fields.
    data.setdefault('content_type', "Article")
    data.setdefault('format', "text")

    # Set new schema fields with defaults
    data.setdefault('collection_id', generate_collection_id(data, url))
    data.setdefault('permissions', determine_permissions(data, url))
    data.setdefault('verified', False)  # Default to unverified, can be updated later
    data.setdefault('notes', "")  # Empty notes by default

    return data

def generate_collection_id(data, url):
    """
    Generate a collection ID based on content patterns.
    Groups related content together for better organization.
    """
    # Try to identify collections based on various factors
    series = data.get('series', '')
    if series:
        # Use series name as collection base
        collection_base = re.sub(r'[^A-Z0-9]', '', series.upper())[:10]
        return f"SERIES-{collection_base}"

    # Check for recurring themes or formats
    thematic_cats = data.get('thematic_categories', '')
    if 'Journalism Education' in str(thematic_cats):
        return "COLLECTION-EDUCATION"
    elif 'Press & Media Criticism' in str(thematic_cats):
        return "COLLECTION-CRITICISM"
    elif 'Technology & Digital Media' in str(thematic_cats):
        return "COLLECTION-DIGITAL"

    # Default: no specific collection
    return ""

def determine_permissions(data, url):
    """
    Determine permission/rights status based on source and content.
    """
    domain = urlparse(url).netloc.lower()

    # Known permissive sources
    permissive_domains = [
        'pressthink.org',  # Jay Rosen's own blog
        'twitter.com',
        'medium.com'
    ]

    if any(domain.endswith(perm_domain) for perm_domain in permissive_domains):
        return "Open Access"

    # Paywall/premium sources
    if domain in PAYWALLED_DOMAINS:
        return "Premium/Subscription Required"

    # Academic or institutional sources
    if any(suffix in domain for suffix in ['.edu', '.org']):
        return "Educational Use"

    # Default
    return "Standard Copyright"

def append_record_to_sheet(worksheet, data, headers, logger=None):
    """
    Formats and appends a new row to the specified Google Sheet.
    The row is ordered according to the provided headers.
    """
    if not logger:
        logger = get_logger()

    if not headers:
        logger.log_error("sheets_operation", "Cannot append row: No headers defined.", record_id=data.get('id'))
        return False

    # Create a list of values in the correct order for the sheet.
    new_row = [str(data.get(header, "")) for header in headers]
    try:
        # Append the new row to the worksheet.
        worksheet.append_row(new_row)
        logger.log_sheets_operation("write", data.get('id'), True, {"url": data.get('url')})
        return True
    except Exception as e:
        logger.log_sheets_operation("write", data.get('id'), False, {"error": str(e), "url": data.get('url')})
        return False

def main():
    """The main workflow for the backend pipeline with enhanced error handling and logging."""
    # Initialize logging system
    logger = init_logger()
    poison_manager = get_poison_pill_manager()

    logger.logger.info("Starting Rosen Archive processing pipeline")

    try:
        # Load the schema which defines data structure and taxonomy.
        schema = get_schema(SCHEMA_FILE)
        if not schema:
            logger.log_error("configuration", "Could not load schema file", details={"schema_file": SCHEMA_FILE})
            return

        # Load known entities for resolving publication names.
        known_entities = entity_resolver.load_known_entities(KNOWN_ENTITIES_FILE)
        if not known_entities:
            logger.log_error("configuration", "Could not load known entities file", details={"entities_file": KNOWN_ENTITIES_FILE})
            return

        # Get the expected order of columns for the output sheet.
        headers = schema.get('output_headers', [])

        # --- 1. Connect to Google Sheets ---
        try:
            credentials_path = BASE_DIR / os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
            gc = gspread.service_account(filename=str(credentials_path))
            sh = gc.open(os.environ.get("SPREADSHEET_NAME", "Rosen Archive URL List"))
            urls_worksheet = sh.worksheet("urls_to_scrape")
            processed_worksheet = sh.worksheet("test_runs")
            access_worksheet = sh.worksheet("access")
            logger.logger.info("Successfully connected to Google Sheets")
        except Exception as e:
            logger.log_error("sheets_connection", f"Error connecting to Google Sheets: {e}")
            return

        # --- 2. Fetch URLs to Process ---
        all_values = urls_worksheet.get_all_values()
        if len(all_values) < 2:
            logger.logger.info("No URLs to process.")
            return

        # Extract URLs from the second column, for rows 610-619.
        urls_to_process = [row[1] for row in all_values[609:619] if len(row) > 1 and row[1]]
        logger.logger.info(f"Starting processing for {len(urls_to_process)} URLs")

        # --- 3. Process Each URL ---
        try:
            processed_ids = set(processed_worksheet.col_values(1)[1:])
            logger.logger.info(f"Loaded {len(processed_ids)} existing IDs from the sheet.")
        except Exception as e:
            logger.log_error("sheets_operation", f"Could not load existing IDs: {e}")
            processed_ids = set()

        for url in urls_to_process:
            # Check for poison pills at URL level
            should_process, poison_result = poison_manager.check_url(url)

            if not should_process:
                if poison_result.pill_type == PoisonPillType.PAYWALL_DETECTED:
                    logger.logger.info(f"Paywalled domain detected for {url}. Moving to 'access' sheet.")
                    access_worksheet.append_row([url])
                else:
                    logger.logger.warning(f"Skipping poison pill URL: {url} (type: {poison_result.pill_type.value})")
                continue

            # Start processing with timing
            process_start_time = logger.log_processing_start(url, "pending")

            try:
                # Dispatch the URL to the appropriate processor
                processed_data = process_url_with_error_handling(url, schema, logger, poison_manager)
            except Exception as e:
                logger.log_error("processing_pipeline", f"Unhandled error during processing: {e}", url=url)
                logger.log_processing_end("failed", process_start_time, False)
                continue

            # --- 4. Enrich and Save Data ---
            if processed_data:
                # Generate a unique ID for the article before starting processing.
                publication = processed_data.get('original_publication')
                item_id = generate_source_based_id(publication, processed_ids)
                logger.logger.info(f"Assigned ID: {item_id}")

                # Ensure essential metadata is present in the final dataset.
                processed_data['id'] = item_id
                processed_data['url'] = url
                if 'date' in processed_data: # Standardize date field name.
                    processed_data['publication_date'] = processed_data.pop('date')

                # Resolve publication name against known entities.
                publication = entity_resolver.resolve_publication(processed_data.get('original_publication'), url, known_entities)
                processed_data['original_publication'] = publication

                # Add derived fields like word count and platform.
                processed_data = enrich_data(processed_data, url, known_entities)

                # Generate PDF or Transcript with logging
                file_generated = False
                if processed_data.get('format') in ['video', 'audio']:
                    transcript_filepath = transcript_saver.save_transcript(processed_data)
                    if not transcript_filepath:
                        logger.log_error("transcript_generation", "Could not save transcript", record_id=item_id, url=url)
                    else:
                        processed_data['transcript_filepath'] = transcript_filepath
                        logger.logger.info(f"Created local transcript: {transcript_filepath}")
                        file_generated = True
                else:
                    pdf_filepath = pdf_generator.create_article_pdf(processed_data)
                    if not pdf_filepath:
                        logger.log_error("pdf_generation", "Could not generate PDF", record_id=item_id, url=url)
                    else:
                        processed_data['pdf_filepath'] = pdf_filepath
                        # Get file size for logging
                        try:
                            file_size = os.path.getsize(pdf_filepath) if os.path.exists(pdf_filepath) else None
                            logger.log_pdf_generation(item_id, pdf_filepath, True, file_size)
                            file_generated = True
                        except Exception as e:
                            logger.log_pdf_generation(item_id, pdf_filepath, True)
                            file_generated = True

                # Write the final, enriched record to the Google Sheet.
                success = append_record_to_sheet(processed_worksheet, processed_data, headers, logger)
                if success:
                    processed_ids.add(item_id)
                    logger.log_processing_end(item_id, process_start_time, True)
                else:
                    logger.log_processing_end(item_id, process_start_time, False)
            else:
                logger.log_processing_end("failed", process_start_time, False)

    except Exception as e:
        logger.log_error("pipeline_critical", f"Critical error in main pipeline: {e}")

    finally:
        # Generate session summary
        logger.log_session_end()

        # Log poison pill summary
        poison_summary = poison_manager.get_poison_pill_summary()
        if poison_summary['total'] > 0:
            logger.logger.info(f"Poison pill summary: {poison_summary}")

def process_url_with_error_handling(url, schema, logger, poison_manager):
    """
    Process a single URL with comprehensive error handling and poison pill detection.
    """
    max_retries = 3
    attempt = 1

    while attempt <= max_retries:
        try:
            # Dispatch the URL to the appropriate processor
            processed_data = dispatcher.dispatch_url(url, schema)

            # Check content quality if we got data
            if processed_data and processed_data.get('text'):
                should_continue, content_poison = poison_manager.check_content(processed_data['text'], url)

                if not should_continue:
                    if content_poison.retry_strategy and poison_manager.should_retry(content_poison, attempt):
                        delay = poison_manager.get_retry_delay(content_poison, attempt)
                        logger.logger.info(f"Retrying URL {url} with strategy {content_poison.retry_strategy} after {delay}s delay")
                        time.sleep(delay)
                        attempt += 1
                        continue
                    else:
                        logger.logger.warning(f"Content quality too poor for {url}, skipping")
                        return None

            return processed_data

        except Exception as e:
            error_result = poison_manager.handle_processing_error("processing_error", str(e), url)

            if poison_manager.should_retry(error_result, attempt):
                delay = poison_manager.get_retry_delay(error_result, attempt)
                logger.logger.info(f"Retrying URL {url} after error, attempt {attempt + 1}/{max_retries} in {delay}s")
                time.sleep(delay)
                attempt += 1
            else:
                logger.log_error("processing_final_failure", f"Failed to process {url} after {attempt} attempts: {e}", url=url)
                return None

    logger.log_error("processing_max_retries", f"Exhausted all {max_retries} attempts for {url}", url=url)
    return None

if __name__ == "__main__":
    main()