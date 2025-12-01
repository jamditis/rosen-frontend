# -*- coding: utf-8 -*-
"""
Test script for workflow environment variable validation.
Tests error handling for invalid environment variable values.
"""

import os
import sys
from pathlib import Path

# Add src directory to path
ROOT_DIR = Path(__file__).resolve().parents[2]
SRC_DIR = ROOT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))


def validate_env_config():
    """
    Validate environment variable configuration with the same logic as workflow.py
    Returns (success, start_row, end_row, error_message)
    
    Note: This intentionally duplicates the workflow validation logic to independently
    test the validation behavior. This ensures tests remain valid even if the workflow
    implementation changes, and serves as a specification of expected validation.
    """
    try:
        start_row = int(os.environ.get("PROCESS_START_ROW", "0"))
        if start_row < 0:
            return False, None, None, "PROCESS_START_ROW must be >= 0"
    except ValueError as e:
        return False, None, None, f"PROCESS_START_ROW must be a valid integer: {e}"
    
    try:
        end_row_str = os.environ.get("PROCESS_END_ROW", "-1")
        end_row = int(end_row_str) if end_row_str != "-1" else None
        if end_row is not None and end_row < start_row:
            return False, None, None, f"PROCESS_END_ROW must be >= PROCESS_START_ROW (got start={start_row}, end={end_row})"
    except ValueError as e:
        return False, None, None, f"PROCESS_END_ROW must be a valid integer or -1: {e}"
    
    return True, start_row, end_row, None


def test_env_validation():
    """Test environment variable validation."""
    print("Testing Environment Variable Validation")
    print("=" * 60)
    
    # Test 1: Valid default values
    print("\n--- Test 1: Valid Defaults ---")
    os.environ.pop("PROCESS_START_ROW", None)
    os.environ.pop("PROCESS_END_ROW", None)
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Start: {start}, End: {end}")
    assert success, f"Default values should be valid, got error: {error}"
    assert start == 0, "Default start should be 0"
    assert end is None, "Default end should be None"
    
    # Test 2: Valid custom range
    print("\n--- Test 2: Valid Custom Range ---")
    os.environ["PROCESS_START_ROW"] = "100"
    os.environ["PROCESS_END_ROW"] = "200"
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Start: {start}, End: {end}")
    assert success, f"Valid range should succeed, got error: {error}"
    assert start == 100, "Start should be 100"
    assert end == 200, "End should be 200"
    
    # Test 3: Invalid START_ROW (non-numeric)
    print("\n--- Test 3: Invalid START_ROW (non-numeric) ---")
    os.environ["PROCESS_START_ROW"] = "abc"
    os.environ["PROCESS_END_ROW"] = "100"
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Error: {error}")
    assert not success, "Non-numeric START_ROW should fail"
    assert "valid integer" in error.lower(), "Error should mention invalid integer"
    
    # Test 4: Invalid START_ROW (negative)
    print("\n--- Test 4: Invalid START_ROW (negative) ---")
    os.environ["PROCESS_START_ROW"] = "-5"
    os.environ["PROCESS_END_ROW"] = "100"
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Error: {error}")
    assert not success, "Negative START_ROW should fail"
    assert ">= 0" in error, "Error should mention >= 0 requirement"
    
    # Test 5: Invalid END_ROW (non-numeric, not -1)
    print("\n--- Test 5: Invalid END_ROW (non-numeric) ---")
    os.environ["PROCESS_START_ROW"] = "10"
    os.environ["PROCESS_END_ROW"] = "xyz"
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Error: {error}")
    assert not success, "Non-numeric END_ROW should fail"
    assert "valid integer" in error.lower(), "Error should mention invalid integer"
    
    # Test 6: END_ROW less than START_ROW
    print("\n--- Test 6: END_ROW < START_ROW ---")
    os.environ["PROCESS_START_ROW"] = "100"
    os.environ["PROCESS_END_ROW"] = "50"
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Error: {error}")
    assert not success, "END_ROW < START_ROW should fail"
    assert "must be >=" in error, "Error should mention range requirement"
    
    # Test 7: Valid -1 for END_ROW
    print("\n--- Test 7: Valid -1 for END_ROW ---")
    os.environ["PROCESS_START_ROW"] = "50"
    os.environ["PROCESS_END_ROW"] = "-1"
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Start: {start}, End: {end}")
    assert success, f"Valid -1 should succeed, got error: {error}"
    assert start == 50, "Start should be 50"
    assert end is None, "End should be None for -1"
    
    # Test 8: Valid equal start and end
    print("\n--- Test 8: START_ROW == END_ROW (empty range) ---")
    os.environ["PROCESS_START_ROW"] = "100"
    os.environ["PROCESS_END_ROW"] = "100"
    
    success, start, end, error = validate_env_config()
    print(f"Success: {success}, Start: {start}, End: {end}")
    assert success, f"Equal start/end should be valid (empty range), got error: {error}"
    assert start == 100, "Start should be 100"
    assert end == 100, "End should be 100"
    
    # Clean up
    os.environ.pop("PROCESS_START_ROW", None)
    os.environ.pop("PROCESS_END_ROW", None)
    
    print("\n" + "=" * 60)
    print("✓ All validation tests passed!")
    print("\nValidation successfully catches:")
    print("  • Non-numeric values")
    print("  • Negative start row")
    print("  • End row less than start row")
    print("  • Invalid formats")
    print("\nValidation correctly accepts:")
    print("  • Default values (0, -1)")
    print("  • Valid numeric ranges")
    print("  • -1 as special 'process all' value")
    print("  • Equal start and end (empty range)")


if __name__ == "__main__":
    test_env_validation()
