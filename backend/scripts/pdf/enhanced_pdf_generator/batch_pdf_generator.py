# -*- coding: utf-8 -*-
"""
Batch PDF generator that reads from the test_runs Google Sheet tab and generates
enhanced PDFs for all records using the new layout format.
"""

import gspread
import os
import sys
from dotenv import load_dotenv
import time

# Set UTF-8 encoding for Windows console
if sys.platform.startswith('win'):
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from enhanced_pdf_generator import create_enhanced_pdf

# Load environment variables from project root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))

def connect_to_google_sheets():
    """
    Establishes connection to Google Sheets using service account credentials.
    
    Returns:
        gspread.Spreadsheet: The connected spreadsheet object
    """
    try:
        # Use service account credentials (path relative to project root)
        credentials_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'google_credentials.json')
        gc = gspread.service_account(filename=credentials_path)
        
        # Open the spreadsheet by name from environment variable
        spreadsheet_name = os.getenv('SPREADSHEET_NAME')
        if not spreadsheet_name:
            raise ValueError("SPREADSHEET_NAME not found in environment variables")
        
        # Handle UTF-8 encoding for spreadsheet names with emojis
        try:
            spreadsheet = gc.open(spreadsheet_name)
            print(f"Successfully connected to spreadsheet: {spreadsheet_name}")
            return spreadsheet
        except UnicodeEncodeError:
            # If there's a Unicode error, try using the spreadsheet key instead
            spreadsheet_key = os.getenv('SPREADSHEET_KEY')
            if spreadsheet_key:
                spreadsheet = gc.open_by_key(spreadsheet_key)
                print(f"Successfully connected to spreadsheet by key: {spreadsheet_key}")
                return spreadsheet
            else:
                raise ValueError("Both SPREADSHEET_NAME and SPREADSHEET_KEY failed or not found")
        
    except Exception as e:
        print(f"Error connecting to Google Sheets: {e}")
        return None


def get_test_runs_data(spreadsheet):
    """
    Retrieves all data from the test_runs worksheet.
    
    Args:
        spreadsheet: Google Sheets spreadsheet object
        
    Returns:
        list: List of dictionaries representing each row
    """
    try:
        # Access the test_runs worksheet
        worksheet = spreadsheet.worksheet('test_runs')
        
        # Get all records as dictionaries (first row as headers)
        records = worksheet.get_all_records()
        
        print(f"Retrieved {len(records)} records from test_runs sheet")
        return records
        
    except Exception as e:
        print(f"Error retrieving data from test_runs sheet: {e}")
        return []


def generate_pdfs_for_all_records(records, output_dir="batch_generated_pdfs", max_records=None):
    """
    Generates PDFs for all records from the test_runs sheet.
    
    Args:
        records (list): List of record dictionaries from Google Sheets
        output_dir (str): Directory to save generated PDFs
        max_records (int): Optional limit on number of PDFs to generate (for testing)
        
    Returns:
        tuple: (success_count, error_count, generated_files)
    """
    success_count = 0
    error_count = 0
    generated_files = []
    
    # Limit records if specified (useful for testing)
    if max_records:
        records = records[:max_records]
        print(f"Limiting to first {max_records} records for testing")
    
    print(f"Starting PDF generation for {len(records)} records...")
    
    for i, record in enumerate(records, 1):
        try:
            print(f"\nProcessing record {i}/{len(records)}: {record.get('title', 'Untitled')[:50]}...")
            
            # Skip records without required data
            if not record.get('title') and not record.get('raw_text'):
                print(f"  Skipping record {i}: Missing title and raw_text")
                error_count += 1
                continue
            
            # Generate PDF
            pdf_path = create_enhanced_pdf(record, output_dir)
            
            if pdf_path:
                success_count += 1
                generated_files.append(pdf_path)
                print(f"  ✓ Success: {os.path.basename(pdf_path)}")
            else:
                error_count += 1
                print(f"  ✗ Failed to generate PDF")
                
            # Add small delay to avoid overwhelming the system
            time.sleep(0.1)
            
        except Exception as e:
            error_count += 1
            print(f"  ✗ Error processing record {i}: {e}")
            continue
    
    print(f"\n--- PDF Generation Complete ---")
    print(f"Total records processed: {len(records)}")
    print(f"Successful PDFs: {success_count}")
    print(f"Errors: {error_count}")
    print(f"Output directory: {output_dir}")
    
    return success_count, error_count, generated_files


def generate_sample_pdfs(num_records=5):
    """
    Generates a small sample of PDFs for testing purposes.
    
    Args:
        num_records (int): Number of records to process for testing
    """
    print("=== Sample PDF Generation ===")
    
    # Connect to spreadsheet
    spreadsheet = connect_to_google_sheets()
    if not spreadsheet:
        print("Failed to connect to Google Sheets")
        return
    
    # Get test_runs data
    records = get_test_runs_data(spreadsheet)
    if not records:
        print("No records found in test_runs sheet")
        return
    
    # Generate sample PDFs
    success, errors, files = generate_pdfs_for_all_records(
        records, 
        output_dir="processed_pdf_library", 
        max_records=num_records
    )
    
    if files:
        print(f"\nSample PDFs generated in 'processed_pdf_library' directory:")
        for file_path in files[:3]:  # Show first 3
            print(f"  - {os.path.basename(file_path)}")
        if len(files) > 3:
            print(f"  ... and {len(files) - 3} more")


def generate_all_pdfs():
    """
    Generates PDFs for all records in the test_runs sheet.
    """
    print("=== Full PDF Generation ===")
    
    # Connect to spreadsheet
    spreadsheet = connect_to_google_sheets()
    if not spreadsheet:
        print("Failed to connect to Google Sheets")
        return
    
    # Get test_runs data
    records = get_test_runs_data(spreadsheet)
    if not records:
        print("No records found in test_runs sheet")
        return
    
    # Generate all PDFs
    success, errors, files = generate_pdfs_for_all_records(records)
    
    return success, errors, files


if __name__ == "__main__":
    import sys
    
    # Check command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "sample":
            # Generate sample PDFs
            num_sample = int(sys.argv[2]) if len(sys.argv) > 2 else 5
            generate_sample_pdfs(num_sample)
        elif sys.argv[1] == "all":
            # Generate all PDFs
            generate_all_pdfs()
        else:
            print("Usage:")
            print("  python batch_pdf_generator.py sample [num_records]  # Generate sample PDFs")
            print("  python batch_pdf_generator.py all                   # Generate all PDFs")
    else:
        # Default: generate sample
        print("No arguments provided. Generating 5 sample PDFs...")
        generate_sample_pdfs(5)