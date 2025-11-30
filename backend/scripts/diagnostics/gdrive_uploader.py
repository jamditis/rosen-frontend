# -*- coding: utf-8 -*-
"""
This module handles the interaction with the Google Drive API.
It provides functionalities to authenticate with Google Drive and upload files
to a specified folder, making them publicly accessible.
"""

import os
from pathlib import Path
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

ROOT_DIR = Path(__file__).resolve().parents[2]

def get_gdrive_service():
    """
    Builds and returns an authenticated Google Drive service object.

    This function uses service account credentials to authorize access to the
    Google Drive API. The path to the credentials file is retrieved from an
    environment variable, with a fallback to a local file.

    Returns:
        googleapiclient.discovery.Resource: An authenticated Google Drive
                                            service object.
    """
    # Construct the absolute path to the credentials file.
    creds_filename = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "google_credentials.json")
    creds_path = ROOT_DIR / creds_filename
    
    # Load credentials from the service account file with the necessary Drive scope.
    creds = service_account.Credentials.from_service_account_file(
        str(creds_path), scopes=['https://www.googleapis.com/auth/drive']
    )
    
    # Build the Google Drive service object using the authenticated credentials.
    service = build('drive', 'v3', credentials=creds)
    return service

def upload_file_to_gdrive(filepath, folder_id):
    """
    Uploads a file to a specific Google Drive folder and returns its shareable link.

    Args:
        filepath (str): The local path of the file to upload.
        folder_id (str): The ID of the Google Drive folder to upload into.

    Returns:
        str: The shareable web link of the uploaded file, or None on failure.
    """
    # Verify that the file exists at the specified path before attempting to upload.
    if not os.path.exists(filepath):
        print(f"Error: File not found at {filepath}")
        return None

    try:
        # Obtain an authenticated Google Drive service object.
        service = get_gdrive_service()
        # Extract the filename from the full file path.
        filename = os.path.basename(filepath)
        
        # Define the metadata for the file to be uploaded, including its name
        # and the parent folder ID.
        file_metadata = {
            'name': filename,
            'parents': [folder_id]
        }
        
        # Create a media upload object with the file's content and MIME type.
        media = MediaFileUpload(filepath, mimetype='application/pdf')
        
        # Execute the file creation request to upload the file.
        # 'fields' parameter specifies which fields to return in the response.
        file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, webViewLink',
            supportsAllDrives=True
        ).execute()

        # After uploading, make the file publicly readable so anyone with the link can view it.
        file_id = file.get('id')
        service.permissions().create(
            fileId=file_id,
            body={'type': 'anyone', 'role': 'reader'}
        ).execute()

        print(f"Successfully uploaded {filename} to Google Drive.")
        # Return the public, shareable link to the uploaded file.
        return file.get('webViewLink')

    except Exception as e:
        # Catch and report any exceptions that occur during the upload process.
        print(f"An error occurred during Google Drive upload: {e}")
        return None
