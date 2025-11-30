#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Wrapper script to run data_improver with proper path setup.
"""

import sys
import os
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

# Now import and run the data improver
from tools.diagnostics import data_improver

if __name__ == "__main__":
    data_improver.main()
