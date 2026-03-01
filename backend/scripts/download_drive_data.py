#!/usr/bin/env python3
"""
Download entity extraction data from Google Drive shared folder.

Uses gcloud application default credentials to authenticate.
"""

import os
import io
from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import json

# The shared folder ID from the URL
FOLDER_ID = "1nRJQun3dcMbP8c5z6N7Jd0F4FOuyR9xI"

# Output directory
OUTPUT_DIR = Path(__file__).parent.parent.parent / "data" / "drive_downloads"


def get_credentials():
    """Load credentials from gcloud application default credentials."""
    creds_path = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"

    if not creds_path.exists():
        raise FileNotFoundError(f"Credentials not found at {creds_path}")

    with open(creds_path) as f:
        creds_data = json.load(f)

    creds = Credentials(
        token=None,
        refresh_token=creds_data.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
    )

    # Refresh the token
    creds.refresh(Request())
    return creds


def list_files_in_folder(service, folder_id):
    """List all files in a Google Drive folder."""
    results = []
    page_token = None

    while True:
        response = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            spaces='drive',
            fields='nextPageToken, files(id, name, mimeType, size, modifiedTime)',
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True
        ).execute()

        results.extend(response.get('files', []))
        page_token = response.get('nextPageToken')

        if not page_token:
            break

    return results


def download_file(service, file_id, file_name, output_dir):
    """Download a file from Google Drive."""
    output_path = output_dir / file_name

    request = service.files().get_media(fileId=file_id, supportsAllDrives=True)

    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)

    done = False
    while not done:
        status, done = downloader.next_chunk()
        if status:
            print(f"  Downloading {file_name}: {int(status.progress() * 100)}%")

    # Write to file
    output_path.write_bytes(fh.getvalue())
    print(f"  ✓ Saved to {output_path}")
    return output_path


def main():
    print("=" * 60)
    print("GOOGLE DRIVE DATA DOWNLOAD")
    print("=" * 60)
    print(f"Folder ID: {FOLDER_ID}")
    print()

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")
    print()

    # Get credentials
    print("Authenticating...")
    try:
        creds = get_credentials()
        print("✓ Authenticated successfully")
    except Exception as e:
        print(f"✗ Authentication failed: {e}")
        return 1

    # Build Drive service
    service = build('drive', 'v3', credentials=creds)

    # List files in folder
    print()
    print("Listing files in shared folder...")
    try:
        files = list_files_in_folder(service, FOLDER_ID)
        print(f"✓ Found {len(files)} files")
    except Exception as e:
        print(f"✗ Failed to list files: {e}")
        return 1

    print()
    print("FILES IN FOLDER:")
    print("-" * 60)

    for f in files:
        size = int(f.get('size', 0)) if f.get('size') else 0
        size_str = f"{size/1024:.1f} KB" if size < 1024*1024 else f"{size/1024/1024:.1f} MB"
        print(f"  {f['name']:<40} {size_str:>10}  {f['mimeType']}")

    # Download CSV and JSON files
    print()
    print("DOWNLOADING DATA FILES...")
    print("-" * 60)

    downloaded = []
    for f in files:
        name = f['name']
        if name.endswith('.csv') or name.endswith('.json'):
            print(f"\nDownloading: {name}")
            try:
                path = download_file(service, f['id'], name, OUTPUT_DIR)
                downloaded.append(path)
            except Exception as e:
                print(f"  ✗ Failed: {e}")

    print()
    print("=" * 60)
    print(f"Downloaded {len(downloaded)} files to {OUTPUT_DIR}")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    exit(main())
