#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Wrapper script to run Smart Data Corrector with proper path setup.
"""

import sys
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(ROOT_DIR / 'tools' / 'diagnostics'))

# Import and run
from tools.diagnostics.smart_data_corrector import main

if __name__ == "__main__":
    main()
