#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Wrapper script to run enhanced date backfill with proper path setup.
"""

import sys
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

# Now import and run the date backfill
from backfill import enhanced_date_backfill

if __name__ == "__main__":
    backfiller = enhanced_date_backfill.EnhancedDateBackfiller()
    # Change to test_runs worksheet instead of final
    backfiller.final_ws = backfiller.sh.worksheet('test_runs')
    # Process all records
    backfiller.backfill_missing_dates(start_row=2)
