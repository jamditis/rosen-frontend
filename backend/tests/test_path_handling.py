# -*- coding: utf-8 -*-
"""
Test script for path handling improvements.

This test validates that the pathlib-based path handling correctly
identifies the project root and computes paths to essential files.
"""

import sys
from pathlib import Path

# Add the src directory to the path
backend_dir = Path(__file__).resolve().parent.parent
src_dir = backend_dir / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from rosen_scraper import workflow
from rosen_scraper import backfill_entity_metadata
from rosen_scraper import entity_extraction_batch_processor


def test_workflow_paths():
    """Test that workflow.py correctly computes paths."""
    print("Testing workflow.py path handling...")
    
    # BASE_DIR should be the backend directory
    assert workflow.BASE_DIR.exists(), "BASE_DIR does not exist"
    assert (workflow.BASE_DIR / "pyproject.toml").exists(), "pyproject.toml not found in BASE_DIR"
    
    # SCRIPT_DIR should be the rosen_scraper directory
    assert workflow.SCRIPT_DIR.exists(), "SCRIPT_DIR does not exist"
    assert workflow.SCRIPT_DIR.name == "rosen_scraper", f"SCRIPT_DIR name is {workflow.SCRIPT_DIR.name}, expected 'rosen_scraper'"
    
    # Schema file should exist
    assert workflow.SCHEMA_FILE.exists(), f"Schema file not found at {workflow.SCHEMA_FILE}"
    assert workflow.SCHEMA_FILE.name == "schema.json", "Schema file has wrong name"
    
    # Known entities file path should be correct (file may not exist in test environment)
    assert workflow.KNOWN_ENTITIES_FILE.name == "known_entities.json", "Known entities file has wrong name"
    
    # Verify paths are Path objects, not strings
    assert isinstance(workflow.BASE_DIR, Path), "BASE_DIR should be a Path object"
    assert isinstance(workflow.SCRIPT_DIR, Path), "SCRIPT_DIR should be a Path object"
    assert isinstance(workflow.SCHEMA_FILE, Path), "SCHEMA_FILE should be a Path object"
    assert isinstance(workflow.KNOWN_ENTITIES_FILE, Path), "KNOWN_ENTITIES_FILE should be a Path object"
    
    print("✓ workflow.py path handling tests passed")


def test_backfill_entity_metadata_paths():
    """Test that backfill_entity_metadata.py correctly computes paths."""
    print("\nTesting backfill_entity_metadata.py path handling...")
    
    # BASE_DIR should be the backend directory
    assert backfill_entity_metadata.BASE_DIR.exists(), "BASE_DIR does not exist"
    assert (backfill_entity_metadata.BASE_DIR / "pyproject.toml").exists(), "pyproject.toml not found in BASE_DIR"
    
    # Verify path is a Path object, not a string
    assert isinstance(backfill_entity_metadata.BASE_DIR, Path), "BASE_DIR should be a Path object"
    
    print("✓ backfill_entity_metadata.py path handling tests passed")


def test_entity_extraction_batch_processor_paths():
    """Test that entity_extraction_batch_processor.py correctly computes paths."""
    print("\nTesting entity_extraction_batch_processor.py path handling...")
    
    # BASE_DIR should be the backend directory
    assert entity_extraction_batch_processor.BASE_DIR.exists(), "BASE_DIR does not exist"
    assert (entity_extraction_batch_processor.BASE_DIR / "pyproject.toml").exists(), "pyproject.toml not found in BASE_DIR"
    
    # Verify path is a Path object, not a string
    assert isinstance(entity_extraction_batch_processor.BASE_DIR, Path), "BASE_DIR should be a Path object"
    
    print("✓ entity_extraction_batch_processor.py path handling tests passed")


def test_all_modules_agree():
    """Test that all modules compute the same BASE_DIR."""
    print("\nTesting that all modules agree on BASE_DIR...")
    
    base_dirs = [
        workflow.BASE_DIR,
        backfill_entity_metadata.BASE_DIR,
        entity_extraction_batch_processor.BASE_DIR
    ]
    
    # All should be equal
    assert len(set(base_dirs)) == 1, f"Modules disagree on BASE_DIR: {base_dirs}"
    
    print(f"✓ All modules agree on BASE_DIR: {base_dirs[0]}")


def test_find_project_root_function():
    """Test the find_project_root function behavior."""
    print("\nTesting find_project_root function...")
    
    # Test that it finds the project root
    project_root = workflow.find_project_root()
    assert project_root.exists(), "Project root does not exist"
    assert (project_root / "pyproject.toml").exists(), "pyproject.toml not found in project root"
    
    # Test that it returns a Path object
    assert isinstance(project_root, Path), "find_project_root should return a Path object"
    
    print(f"✓ find_project_root correctly identifies: {project_root}")


if __name__ == "__main__":
    print("=" * 60)
    print("Path Handling Tests")
    print("=" * 60)
    
    try:
        test_workflow_paths()
        test_backfill_entity_metadata_paths()
        test_entity_extraction_batch_processor_paths()
        test_all_modules_agree()
        test_find_project_root_function()
        
        print("\n" + "=" * 60)
        print("All path handling tests passed! ✓")
        print("=" * 60)
    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
