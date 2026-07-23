# -*- coding: utf-8 -*-
"""
Shared rights/permissions configuration.

OPEN_ACCESS_DOMAINS and PAYWALLED_DOMAINS are the two sibling rights lists read by
determine_permissions() in workflow.py (the live pipeline). PAYWALLED_DOMAINS is
also read by scripts/diagnostics/populate_new_fields.py (the backfill). Keeping
each list here, rather than inline in the classifier, stops the permission
classifiers from drifting apart, as they did when #492 expanded the pipeline's
paywall list but not the backfill's copy.

These rights lists are intentionally distinct from
PoisonPillDetector.paywall_domains (poison_pill_handler.py), which answers a
scraping concern (did we hit a paywall while fetching?). The two overlap but are
not the same: medium.com is a member_only paywall for scraping yet stays Open
Access for rights (it is in OPEN_ACCESS_DOMAINS below), so it is deliberately
absent from PAYWALLED_DOMAINS. Keep PAYWALLED_DOMAINS in sync with
PoisonPillDetector for the shared subscription sites.

determine_permissions checks OPEN_ACCESS_DOMAINS first (by netloc suffix) and
PAYWALLED_DOMAINS second (by exact netloc, hence the www. prefix). The two must
not overlap: a shared domain would be labeled Open Access by the earlier check and
silently override its paywall label. A test guards that the lists stay disjoint.
"""

PAYWALLED_DOMAINS = [
    "www.washingtonpost.com",
    "www.nytimes.com",
    "www.wsj.com",
    "www.ft.com",
    "www.theatlantic.com",
    "www.newyorker.com",
]

# Open-access sources, checked before PAYWALLED_DOMAINS in determine_permissions
# (a match returns "Open Access"). Matched by netloc suffix, so the bare
# registrable domain also covers its subdomains. Must stay disjoint from
# PAYWALLED_DOMAINS: a shared entry would be labeled Open Access and silently
# override the paywall classification.
OPEN_ACCESS_DOMAINS = [
    "pressthink.org",  # Jay Rosen's own blog
    "twitter.com",
    "medium.com",
]
