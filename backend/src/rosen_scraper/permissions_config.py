# -*- coding: utf-8 -*-
"""
Shared rights/permissions configuration.

PAYWALLED_DOMAINS is the single source of truth for subscription/paywalled
sources. It is read by determine_permissions() in workflow.py (the live pipeline)
and in scripts/diagnostics/populate_new_fields.py (the backfill). Keeping one
list here stops the two permission classifiers from drifting apart, as they did
when #492 expanded the pipeline's list but not the backfill's copy.

This is a rights concern and is intentionally distinct from
PoisonPillDetector.paywall_domains (poison_pill_handler.py), which answers a
scraping concern (did we hit a paywall while fetching?). The two lists overlap
but are not the same: medium.com is a member_only paywall for scraping yet stays
Open Access for rights (it is in the permissive list in determine_permissions),
so it is deliberately absent here. Matched against the exact netloc, hence the
www. prefix. Keep in sync with PoisonPillDetector for the shared subscription
sites.
"""

PAYWALLED_DOMAINS = [
    "www.washingtonpost.com",
    "www.nytimes.com",
    "www.wsj.com",
    "www.ft.com",
    "www.theatlantic.com",
    "www.newyorker.com",
]
