#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Legacy first-200-rows entry point for the canonical smart corrector."""

from __future__ import annotations

import sys
from pathlib import Path

if __package__:
    from .corrector import main
else:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from scripts.corrector import main


if __name__ == "__main__":
    raise SystemExit(main(default_limit=200))
