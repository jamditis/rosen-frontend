# -*- coding: utf-8 -*-
"""
Test script for workflow row range configuration.
Tests the environment variable-based configuration for PROCESS_START_ROW and PROCESS_END_ROW.
"""

import os
import sys
from pathlib import Path

# Add src directory to path
ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))


def test_row_range_extraction():
    """Test the row range extraction logic with various environment variable configurations."""
    print("Testing Workflow Row Range Configuration")
    print("=" * 50)
    
    # Mock data simulating Google Sheets all_values
    mock_all_values = [
        ["Header", "URL", "Other"],  # Row 0
        ["1", "https://example.com/1", "data1"],  # Row 1
        ["2", "https://example.com/2", "data2"],  # Row 2
        ["3", "https://example.com/3", "data3"],  # Row 3
        ["4", "https://example.com/4", "data4"],  # Row 4
        ["5", "https://example.com/5", "data5"],  # Row 5
        ["6", "https://example.com/6", "data6"],  # Row 6
        ["7", "https://example.com/7", "data7"],  # Row 7
        ["8", "https://example.com/8", "data8"],  # Row 8
        ["9", "https://example.com/9", "data9"],  # Row 9
        ["10", "https://example.com/10", "data10"],  # Row 10
    ]
    
    # Test Case 1: Default behavior (process all rows from start)
    print("\nTest 1: Default behavior (START_ROW=0, END_ROW=-1)")
    os.environ.pop("PROCESS_START_ROW", None)
    os.environ.pop("PROCESS_END_ROW", None)
    
    start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
    end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
    end_row = int(end_row_str) if end_row_str != "-1" else None
    
    if end_row is None:
        urls = [row[1] for row in mock_all_values[start_row:] if len(row) > 1 and row[1]]
    else:
        urls = [row[1] for row in mock_all_values[start_row:end_row] if len(row) > 1 and row[1]]
    
    print(f"  Start: {start_row}, End: {end_row}")
    print(f"  URLs extracted: {len(urls)}")
    print(f"  First URL: {urls[0] if urls else 'None'}")
    print(f"  Last URL: {urls[-1] if urls else 'None'}")
    assert len(urls) == 11, f"Expected 11 URLs (including header), got {len(urls)}"
    assert urls[0] == "URL", "First entry should be header"
    assert urls[-1] == "https://example.com/10", "Last URL should be example.com/10"
    
    # Test Case 2: Specific range (rows 2-5)
    print("\nTest 2: Specific range (START_ROW=2, END_ROW=5)")
    os.environ["PROCESS_START_ROW"] = "2"
    os.environ["PROCESS_END_ROW"] = "5"
    
    start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
    end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
    end_row = int(end_row_str) if end_row_str != "-1" else None
    
    if end_row is None:
        urls = [row[1] for row in mock_all_values[start_row:] if len(row) > 1 and row[1]]
    else:
        urls = [row[1] for row in mock_all_values[start_row:end_row] if len(row) > 1 and row[1]]
    
    print(f"  Start: {start_row}, End: {end_row}")
    print(f"  URLs extracted: {len(urls)}")
    print(f"  URLs: {urls}")
    assert len(urls) == 3, f"Expected 3 URLs (rows 2-4), got {len(urls)}"
    assert urls[0] == "https://example.com/2", "First URL should be example.com/2"
    assert urls[-1] == "https://example.com/4", "Last URL should be example.com/4"
    
    # Test Case 3: Start from middle, process to end
    print("\nTest 3: Start from middle (START_ROW=5, END_ROW=-1)")
    os.environ["PROCESS_START_ROW"] = "5"
    os.environ["PROCESS_END_ROW"] = "-1"
    
    start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
    end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
    end_row = int(end_row_str) if end_row_str != "-1" else None
    
    if end_row is None:
        urls = [row[1] for row in mock_all_values[start_row:] if len(row) > 1 and row[1]]
    else:
        urls = [row[1] for row in mock_all_values[start_row:end_row] if len(row) > 1 and row[1]]
    
    print(f"  Start: {start_row}, End: {end_row}")
    print(f"  URLs extracted: {len(urls)}")
    print(f"  First URL: {urls[0] if urls else 'None'}")
    print(f"  Last URL: {urls[-1] if urls else 'None'}")
    assert len(urls) == 6, f"Expected 6 URLs (rows 5-10), got {len(urls)}"
    assert urls[0] == "https://example.com/5", "First URL should be example.com/5"
    assert urls[-1] == "https://example.com/10", "Last URL should be example.com/10"
    
    # Test Case 4: Original hardcoded range (609-619)
    print("\nTest 4: Replicate original hardcoded range (START_ROW=609, END_ROW=619)")
    os.environ["PROCESS_START_ROW"] = "609"
    os.environ["PROCESS_END_ROW"] = "619"
    
    # Create larger mock data to test this range
    large_mock_data = [["ID", "URL"]] * 620
    for i in range(609, 619):
        large_mock_data[i] = [str(i), f"https://example.com/row{i}"]
    
    start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
    end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
    end_row = int(end_row_str) if end_row_str != "-1" else None
    
    if end_row is None:
        urls = [row[1] for row in large_mock_data[start_row:] if len(row) > 1 and row[1]]
    else:
        urls = [row[1] for row in large_mock_data[start_row:end_row] if len(row) > 1 and row[1]]
    
    print(f"  Start: {start_row}, End: {end_row}")
    print(f"  URLs extracted: {len(urls)}")
    print(f"  First URL: {urls[0] if urls else 'None'}")
    print(f"  Last URL: {urls[-1] if urls else 'None'}")
    assert len(urls) == 10, f"Expected 10 URLs (rows 609-618), got {len(urls)}"
    assert urls[0] == "https://example.com/row609", "First URL should be row609"
    assert urls[-1] == "https://example.com/row618", "Last URL should be row618"
    
    # Test Case 5: Single row
    print("\nTest 5: Single row (START_ROW=3, END_ROW=4)")
    os.environ["PROCESS_START_ROW"] = "3"
    os.environ["PROCESS_END_ROW"] = "4"
    
    start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
    end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
    end_row = int(end_row_str) if end_row_str != "-1" else None
    
    if end_row is None:
        urls = [row[1] for row in mock_all_values[start_row:] if len(row) > 1 and row[1]]
    else:
        urls = [row[1] for row in mock_all_values[start_row:end_row] if len(row) > 1 and row[1]]
    
    print(f"  Start: {start_row}, End: {end_row}")
    print(f"  URLs extracted: {len(urls)}")
    print(f"  URLs: {urls}")
    assert len(urls) == 1, f"Expected 1 URL, got {len(urls)}"
    assert urls[0] == "https://example.com/3", "URL should be example.com/3"
    
    # Clean up environment variables
    os.environ.pop("PROCESS_START_ROW", None)
    os.environ.pop("PROCESS_END_ROW", None)
    
    print("\n" + "=" * 50)
    print("All tests passed! ✓")


if __name__ == "__main__":
    test_row_range_extraction()
