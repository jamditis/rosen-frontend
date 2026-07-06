#!/bin/bash
# deploy.sh — Copy regenerated JSON files to FTP staging directory
#
# Run this after batch processing to stage updated data for FTP upload.
# The actual FTP upload to pressthink.org is done separately (manual or automated).
#
# Usage: bash backend/submission_server/deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="$PROJECT_ROOT/data"
FTP_DIR="$PROJECT_ROOT/ftp-upload/data"

# The data-only artifact set, defined once. This is the single source of truth for the
# staging copy, the promotion, and the publish-list parity guard
# (backend/tests/test_publish_list_parity.py), which reads this ARTIFACTS assignment and
# requires it to match the Python publish tuples. A new browser-loaded artifact is added
# here and to the tuples together, so the manual FTP path can never drift out of sync.
ARTIFACTS="archive-data.json archive-core.json archive-details.json archive-entities.json archive-analytics.json search-index.json"

# Scratch dirs for atomic promotion: hidden siblings of $FTP_DIR so a recursive FTP
# mirror skips them, on the same filesystem so the renames below are atomic. Defined
# before use so the interrupted-swap recovery can reference them.
STAGE_NEW="$(dirname "$FTP_DIR")/.$(basename "$FTP_DIR").new"
STAGE_OLD="$(dirname "$FTP_DIR")/.$(basename "$FTP_DIR").prev"

# Recover from a swap a previous run left interrupted, before clearing scratch state. The
# promotion below moves $FTP_DIR aside to $STAGE_OLD and only then renames the new set in,
# so $FTP_DIR is absent only in the window between those two renames -- and $STAGE_OLD
# then holds the previous complete set (it is only ever created by moving a complete
# $FTP_DIR aside). Restoring it first means a crash mid-swap, even followed by a failed
# rebuild on this run, never leaves $FTP_DIR empty. A half-built $STAGE_NEW is discarded
# either way; this run rebuilds it from $DATA_DIR (the source of truth).
rm -rf "$STAGE_NEW"
if [ ! -d "$FTP_DIR" ] && [ -d "$STAGE_OLD" ]; then
    mv "$STAGE_OLD" "$FTP_DIR"
fi
rm -rf "$STAGE_OLD"
mkdir -p "$FTP_DIR" "$STAGE_NEW"

echo "Staging data files for FTP upload..."

# Stage all-or-nothing, and promote atomically. Build the complete fresh set in $STAGE_NEW
# and swap it into place with directory renames rather than copying or moving files one at
# a time into $FTP_DIR. A per-file promotion can be interrupted between files and leave
# fresh data beside a stale artifact -- the partial-deploy bad state that ships new archive
# data with an out-of-date search index (issue #276). With the directory swap, $FTP_DIR is
# only ever the previous complete set, the new complete set, or (between the two renames)
# absent -- never a mix. An FTP push of an absent dir uploads nothing, and the recovery
# above restores the previous set on the next run, so even a crash mid-swap stays
# consistent.

missing=0
for f in $ARTIFACTS; do
    if [ -f "$DATA_DIR/$f" ]; then
        cp "$DATA_DIR/$f" "$STAGE_NEW/$f"
        echo "  staged $f"
    else
        echo "  ERROR: required file $f not found in $DATA_DIR" >&2
        missing=1
    fi
done

if [ "$missing" -ne 0 ]; then
    rm -rf "$STAGE_NEW"
    echo "Staging aborted: required data file(s) missing; nothing staged." >&2
    echo "Regenerate the data (node data/export-archive-data.js) and retry." >&2
    exit 1
fi

# Whole set present in the scratch dir: swap it into place. Moving the old dir aside
# first keeps the two renames on one filesystem (atomic), then drop the old set.
if [ -d "$FTP_DIR" ]; then
    mv "$FTP_DIR" "$STAGE_OLD"
fi
mv "$STAGE_NEW" "$FTP_DIR"
rm -rf "$STAGE_OLD"

echo "Done. Files staged in $FTP_DIR"
