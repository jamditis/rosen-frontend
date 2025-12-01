# -*- coding: utf-8 -*-
"""
This module orchestrates the entire backend pipeline for the Rosen Scraper project.
It reads URLs from local CSV files, dispatches them to the appropriate content
processor, enriches the extracted data, and writes the final records to CSV output.

Data Flow:
    1. Read URLs from csv/urls_to_scrape.csv
    2. Process each URL through the appropriate processor
    3. Write results to csv/output/processed_records_YYYYMMDD.csv
    4. Log processing status to csv/output/processing_log_YYYYMMDD.csv

To update the archive:
    1. Export Google Sheets tabs to CSV files in the csv/ directory
    2. Run this workflow
    3. Merge output CSV files back into the main archive
"""

from typing import Optional, Dict, Any, List, Set
from rosen_scraper import dispatcher
from rosen_scraper.processors import article_processor
from rosen_scraper.csv_data_service import get_csv_service, CSVDataService
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
from rosen_scraper.logger import get_logger, init_logger, PoisonPillType, ArchiveLogger
from rosen_scraper.poison_pill_handler import get_poison_pill_manager, PoisonPillManager
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

def get_schema(schema_file: str) -> Optional[Dict[str, Any]]:
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

def generate_source_based_id(publication: str, existing_ids: Set[str]) -> str:
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

def format_date_mmddyyyy(date_str: str) -> str:
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

def enrich_data(data: Dict[str, Any], url: str, known_entities: Optional[Dict[str, Any]]) -> Dict[str, Any]:
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

def generate_collection_id(data: Dict[str, Any], url: str) -> str:
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

def determine_permissions(data: Dict[str, Any], url: str) -> str:
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

def append_record_to_csv(csv_service: CSVDataService, data: Dict[str, Any], headers: List[str], logger: Optional[ArchiveLogger] = None) -> bool:
    """
    Formats and appends a new row to the output CSV file.
    The row is ordered according to the provided headers.
    """
    if not logger:
        logger = get_logger()

    if not headers:
        logger.log_error("csv_operation", "Cannot append row: No headers defined.", record_id=data.get('id'))
        return False

    try:
        success = csv_service.append_record(data, headers)
        if success:
            logger.log_sheets_operation("write", data.get('id'), True, {"url": data.get('url')})
        return success
    except Exception as e:
        logger.log_sheets_operation("write", data.get('id'), False, {"error": str(e), "url": data.get('url')})
        return False

def main() -> None:
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

        # Get the expected order of columns for the output.
        headers = schema.get('output_headers', [])

        # --- 1. Initialize CSV Data Service ---
        csv_service = get_csv_service()
        logger.logger.info(f"Using CSV data from: {csv_service.csv_dir}")
        logger.logger.info(f"Output will be written to: {csv_service.output_dir}")

        # --- 2. Fetch URLs to Process ---
        # Get configurable row range from environment variables
        try:
            start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
            if start_row < 0:
                logger.log_error("configuration", "PROCESS_START_ROW must be >= 0", details={"value": start_row})
                return
        except ValueError as e:
            logger.log_error("configuration", "PROCESS_START_ROW must be a valid integer", details={"error": str(e)})
            return

        try:
            end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
            end_row = int(end_row_str) if end_row_str != "-1" else None
            if end_row is not None and end_row < start_row:
                logger.log_error("configuration", "PROCESS_END_ROW must be >= PROCESS_START_ROW",
                               details={"start": start_row, "end": end_row})
                return
        except ValueError as e:
            logger.log_error("configuration", "PROCESS_END_ROW must be a valid integer or -1", details={"error": str(e)})
            return

        # Check if we should skip already processed URLs
        skip_processed = os.environ.get("SKIP_PROCESSED", "true").lower() == "true"

        # Get URLs from CSV file
        url_records = csv_service.get_urls_to_process(start_row, end_row, skip_processed=skip_processed)

        if not url_records:
            logger.logger.info("No URLs to process.")
            return

        urls_to_process = [r['url'] for r in url_records]
        logger.logger.info(f"Processing rows {start_row} to {end_row if end_row else 'end'}")
        logger.logger.info(f"Starting processing for {len(urls_to_process)} URLs")

        # --- 3. Load existing record IDs ---
        processed_ids = csv_service.get_existing_record_ids()
        logger.logger.info(f"Loaded {len(processed_ids)} existing IDs from CSV files.")

        # Also check for already processed URLs to avoid duplicates
        existing_urls = csv_service.get_existing_urls()
        logger.logger.info(f"Loaded {len(existing_urls)} existing URLs from CSV files.")

        for url in urls_to_process:
            # Skip if URL already exists in archive
            if url in existing_urls:
                logger.logger.info(f"Skipping already archived URL: {url}")
                csv_service.update_url_status(url, "SKIPPED", "Already in archive")
                continue

            # Check for poison pills at URL level
            should_process, poison_result = poison_manager.check_url(url)

            if not should_process:
                if poison_result.pill_type == PoisonPillType.PAYWALL_DETECTED:
                    logger.logger.info(f"Paywalled domain detected for {url}. Logging to access file.")
                    csv_service.update_url_status(url, "PAYWALL", "Requires subscription access")
                else:
                    logger.logger.warning(f"Skipping poison pill URL: {url} (type: {poison_result.pill_type.value})")
                    csv_service.update_url_status(url, "SKIPPED", f"Poison pill: {poison_result.pill_type.value}")
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

                # Write the final, enriched record to CSV.
                success = append_record_to_csv(csv_service, processed_data, headers, logger)
                if success:
                    processed_ids.add(item_id)
                    existing_urls.add(url)
                    csv_service.update_url_status(url, "SUCCESS", f"ID: {item_id}")
                    logger.log_processing_end(item_id, process_start_time, True)
                else:
                    csv_service.update_url_status(url, "FAILED", "Could not write record")
                    logger.log_processing_end(item_id, process_start_time, False)
            else:
                csv_service.update_url_status(url, "FAILED", "Processing returned no data")
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

def process_url_with_error_handling(url: str, schema: Dict[str, Any], logger: ArchiveLogger, poison_manager: PoisonPillManager) -> Optional[Dict[str, Any]]:
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