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

# Create staging directory if needed
mkdir -p "$FTP_DIR"

echo "Staging data files for FTP upload..."

for f in archive-data.json archive-core.json archive-details.json archive-entities.json; do
    if [ -f "$DATA_DIR/$f" ]; then
        cp "$DATA_DIR/$f" "$FTP_DIR/$f"
        echo "  copied $f"
    else
        echo "  WARNING: $f not found in $DATA_DIR"
    fi
done

echo "Done. Files staged in $FTP_DIR"
