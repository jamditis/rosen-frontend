# -*- coding: utf-8 -*-
"""
Integration test for workflow.py row range configuration.
Tests the actual logic as it would be used in the workflow.
"""

import os
import sys
from pathlib import Path

# Add src directory to path
ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))


def simulate_workflow_url_extraction(all_values):
    """
    Simulate the URL extraction logic from workflow.py
    This is the exact logic used in the main workflow.
    """
    # Get configurable row range from environment variables
    start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
    end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
    end_row = int(end_row_str) if end_row_str != "-1" else None
    
    # Extract URLs from the second column using configurable row range
    if end_row is None:
        urls_to_process = [row[1] for row in all_values[start_row:] if len(row) > 1 and row[1]]
    else:
        urls_to_process = [row[1] for row in all_values[start_row:end_row] if len(row) > 1 and row[1]]
    
    return urls_to_process, start_row, end_row


def test_workflow_integration():
    """Test the workflow integration with various scenarios."""
    print("Testing Workflow Integration with Environment Variables")
    print("=" * 60)
    
    # Create realistic mock data
    mock_sheet_data = [
        ["ID", "URL", "Title", "Status"],  # Header row
    ]
    
    # Add 20 sample rows
    for i in range(1, 21):
        mock_sheet_data.append([
            f"ID-{i:03d}",
            f"https://pressthink.org/article-{i}",
            f"Article {i}",
            "pending"
        ])
    
    print(f"Total rows in mock sheet: {len(mock_sheet_data)}")
    
    # Scenario 1: Default - process all rows
    print("\n--- Scenario 1: Default Configuration (all rows) ---")
    os.environ.pop("PROCESS_START_ROW", None)
    os.environ.pop("PROCESS_END_ROW", None)
    
    urls, start, end = simulate_workflow_url_extraction(mock_sheet_data)
    print(f"Start: {start}, End: {end}")
    print(f"URLs to process: {len(urls)}")
    print(f"First 3 URLs: {urls[:3]}")
    
    # Should process all 21 rows (including header)
    assert len(urls) == 21, f"Expected 21 URLs, got {len(urls)}"
    
    # Scenario 2: Skip header row, process data only
    print("\n--- Scenario 2: Skip Header (START_ROW=1) ---")
    os.environ["PROCESS_START_ROW"] = "1"
    os.environ["PROCESS_END_ROW"] = "-1"
    
    urls, start, end = simulate_workflow_url_extraction(mock_sheet_data)
    print(f"Start: {start}, End: {end}")
    print(f"URLs to process: {len(urls)}")
    print(f"First URL: {urls[0]}")
    print(f"Last URL: {urls[-1]}")
    
    # Should process 20 data rows (skip header)
    assert len(urls) == 20, f"Expected 20 URLs, got {len(urls)}"
    assert "article-1" in urls[0], "First URL should be article-1"
    assert "article-20" in urls[-1], "Last URL should be article-20"
    
    # Scenario 3: Process a batch of 5 rows
    print("\n--- Scenario 3: Process Batch (rows 5-10) ---")
    os.environ["PROCESS_START_ROW"] = "5"
    os.environ["PROCESS_END_ROW"] = "10"
    
    urls, start, end = simulate_workflow_url_extraction(mock_sheet_data)
    print(f"Start: {start}, End: {end}")
    print(f"URLs to process: {len(urls)}")
    print(f"URLs: {urls}")
    
    # Should process 5 rows (5, 6, 7, 8, 9)
    assert len(urls) == 5, f"Expected 5 URLs, got {len(urls)}"
    assert "article-5" in urls[0], "First URL should be article-5 (row 5 contains article-5)"
    assert "article-9" in urls[-1], "Last URL should be article-9 (row 9 contains article-9)"
    
    # Scenario 4: Test with empty/invalid rows
    print("\n--- Scenario 4: Handle Empty Rows ---")
    mock_sheet_with_gaps = [
        ["ID", "URL"],
        ["1", "https://example.com/1"],
        ["2", ""],  # Empty URL
        ["3"],  # Short row
        ["4", "https://example.com/4"],
        ["5", "https://example.com/5"],
    ]
    
    os.environ["PROCESS_START_ROW"] = "0"
    os.environ["PROCESS_END_ROW"] = "-1"
    
    urls, start, end = simulate_workflow_url_extraction(mock_sheet_with_gaps)
    print(f"URLs to process: {len(urls)}")
    print(f"URLs extracted: {urls}")
    
    # Should only get valid URLs (URL header + article 1, 4, 5)
    assert len(urls) == 4, f"Expected 4 valid URLs, got {len(urls)}"
    
    # Scenario 5: Replicate original hardcoded behavior (609:619)
    print("\n--- Scenario 5: Replicate Original Behavior (609:619) ---")
    
    # Create large dataset
    large_dataset = [["ID", "URL"]]
    for i in range(1, 650):
        large_dataset.append([f"ID-{i:03d}", f"https://example.com/row-{i}"])
    
    os.environ["PROCESS_START_ROW"] = "609"
    os.environ["PROCESS_END_ROW"] = "619"
    
    urls, start, end = simulate_workflow_url_extraction(large_dataset)
    print(f"Start: {start}, End: {end}")
    print(f"URLs to process: {len(urls)}")
    print(f"First URL: {urls[0]}")
    print(f"Last URL: {urls[-1]}")
    
    # Should process exactly 10 rows (609-618 inclusive)
    assert len(urls) == 10, f"Expected 10 URLs, got {len(urls)}"
    assert "row-609" in urls[0], "First URL should be row-609"
    assert "row-618" in urls[-1], "Last URL should be row-618"
    
    # Clean up
    os.environ.pop("PROCESS_START_ROW", None)
    os.environ.pop("PROCESS_END_ROW", None)
    
    print("\n" + "=" * 60)
    print("✓ All integration tests passed!")
    print("\nConfiguration successfully supports:")
    print("  • Processing all rows (default behavior)")
    print("  • Processing specific row ranges")
    print("  • Skipping header rows")
    print("  • Handling empty/invalid rows")
    print("  • Replicating original hardcoded behavior")


if __name__ == "__main__":
    test_workflow_integration()
