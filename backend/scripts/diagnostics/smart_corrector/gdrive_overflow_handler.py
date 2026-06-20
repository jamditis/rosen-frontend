# -*- coding: utf-8 -*-
"""
Google Drive Overflow Handler
Handles transcripts/text that exceed Google Sheets 50K char limit
"""

import os
from datetime import datetime
from pathlib import Path
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from io import BytesIO


class GDriveOverflowHandler:
    """Handles storage of large text files that exceed Sheets cell limit."""

    # Google Sheets cell limit is 50,000 chars
    SHEET_LIMIT = 50000
    # We truncate at 48,000 to leave room for metadata
    TRUNCATE_AT = 48000

    def __init__(self, folder_id: str = None):
        """
        Initialize handler.

        Args:
            folder_id: Google Drive folder ID for overflow files
        """
        self.folder_id = folder_id or os.getenv('GDRIVE_FOLDER_ID')

        # Initialize Google Drive API. Anchor credentials to backend/ so the
        # script runs from any cwd; an absolute GOOGLE_APPLICATION_CREDENTIALS
        # overrides (pathlib resets to it).
        credentials_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
        creds_path = Path(__file__).resolve().parents[3] / credentials_filename
        scopes = ['https://www.googleapis.com/auth/drive']
        creds = Credentials.from_service_account_file(str(creds_path), scopes=scopes)
        self.drive_service = build('drive', 'v3', credentials=creds)

    def handle_large_text(self, text: str, record_id: str, content_type: str = 'transcript') -> dict:
        """
        Handle text that may exceed Google Sheets limit.

        Args:
            text: Full text content
            record_id: Unique ID for this record
            content_type: Type of content (transcript, article, etc.)

        Returns:
            dict with 'text_for_sheet' and optionally 'gdrive_link'
        """
        if len(text) <= self.TRUNCATE_AT:
            # Fits in sheet, no overflow needed
            return {
                'text_for_sheet': text,
                'gdrive_link': None,
                'is_truncated': False
            }

        # Text is too long - upload full version to Google Drive
        print(f"  [OVERFLOW] Text too long ({len(text)} chars), uploading to Google Drive...")

        gdrive_link = self._upload_to_drive(text, record_id, content_type)

        truncated_text = text[:self.TRUNCATE_AT] + f"\n\n... [TRUNCATED - Full text: {gdrive_link}]"

        return {
            'text_for_sheet': truncated_text,
            'gdrive_link': gdrive_link,
            'is_truncated': True,
            'full_length': len(text),
            'truncated_length': len(truncated_text)
        }

    def _upload_to_drive(self, text: str, record_id: str, content_type: str) -> str:
        """
        Upload text file to Google Drive.

        Args:
            text: Text content to upload
            record_id: Record ID
            content_type: Content type

        Returns:
            Google Drive shareable link
        """
        # Create filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{content_type}_{record_id}_{timestamp}.txt"

        # Create file metadata
        file_metadata = {
            'name': filename,
            'mimeType': 'text/plain',
            'parents': [self.folder_id] if self.folder_id else []
        }

        # Create file content as BytesIO
        file_content = BytesIO(text.encode('utf-8'))
        media = MediaIoBaseUpload(
            file_content,
            mimetype='text/plain',
            resumable=True
        )

        # Upload file
        file = self.drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink'
        ).execute()

        # Make file readable by anyone with link
        self.drive_service.permissions().create(
            fileId=file['id'],
            body={'type': 'anyone', 'role': 'reader'}
        ).execute()

        print(f"  [OVERFLOW] Uploaded to Google Drive: {file['webViewLink']}")

        return file['webViewLink']

    def fetch_full_text(self, gdrive_link: str) -> str:
        """
        Fetch full text from Google Drive link.

        Args:
            gdrive_link: Google Drive shareable link

        Returns:
            Full text content
        """
        # Extract file ID from link
        file_id = self._extract_file_id(gdrive_link)

        if not file_id:
            raise ValueError(f"Could not extract file ID from link: {gdrive_link}")

        # Download file content
        request = self.drive_service.files().get_media(fileId=file_id)
        file_content = request.execute()

        return file_content.decode('utf-8')

    def _extract_file_id(self, gdrive_link: str) -> str:
        """Extract file ID from Google Drive link."""
        import re

        # Pattern: https://drive.google.com/file/d/FILE_ID/view
        match = re.search(r'/d/([a-zA-Z0-9_-]+)', gdrive_link)
        if match:
            return match.group(1)

        # Pattern: https://drive.google.com/open?id=FILE_ID
        match = re.search(r'id=([a-zA-Z0-9_-]+)', gdrive_link)
        if match:
            return match.group(1)

        return None


# Convenience function
def handle_overflow(text: str, record_id: str, content_type: str = 'transcript') -> dict:
    """
    Handle text overflow for Google Sheets.

    Args:
        text: Full text
        record_id: Record ID
        content_type: Content type

    Returns:
        dict with text_for_sheet and optionally gdrive_link
    """
    handler = GDriveOverflowHandler()
    return handler.handle_large_text(text, record_id, content_type)
