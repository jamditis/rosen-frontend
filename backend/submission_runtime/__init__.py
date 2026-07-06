# -*- coding: utf-8 -*-
"""Runtime helpers for the current GitHub Actions submission flow.

The legacy Flask submission endpoint still lives in ``submission_server``.
Action-facing scripts import this package directly so the current pipeline does
not depend on the Flask app package.
"""
