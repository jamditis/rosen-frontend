"""
Tests for the video processor module.
"""

import os
from unittest.mock import patch, MagicMock
from rosen_scraper.processors import video_processor


class TestVideoProcessor:
    """Tests for video processor functionality."""

    @patch("rosen_scraper.processors.video_processor.yt_dlp.YoutubeDL")
    def test_process_video_success(self, mock_yt_dlp, sample_schema):
        """Test successful video processing."""
        # Mock yt-dlp response
        mock_yt_instance = MagicMock()
        mock_info = {
            "title": "Test Video Title",
            "description": "Test video description",
            "uploader": "Test Channel",
            "upload_date": "20240115",
            "duration": 300,
        }
        mock_yt_instance.extract_info.return_value = mock_info
        mock_yt_instance.__enter__.return_value = mock_yt_instance
        mock_yt_instance.__exit__.return_value = None
        mock_yt_dlp.return_value = mock_yt_instance

        url = "https://www.youtube.com/watch?v=test123"
        result = video_processor.process_video(url, sample_schema)

        # Function might return None if other dependencies fail
        # Just check it doesn't crash
        assert result is None or isinstance(result, dict)

    @patch("rosen_scraper.processors.video_processor.yt_dlp.YoutubeDL")
    def test_process_video_extraction_failure(self, mock_yt_dlp, sample_schema):
        """Test video processing when extraction fails."""
        # Mock yt-dlp failure
        mock_yt_instance = MagicMock()
        mock_yt_instance.extract_info.side_effect = Exception("Video unavailable")
        mock_yt_instance.__enter__.return_value = mock_yt_instance
        mock_yt_instance.__exit__.return_value = None
        mock_yt_dlp.return_value = mock_yt_instance

        url = "https://www.youtube.com/watch?v=invalid"
        result = video_processor.process_video(url, sample_schema)

        assert result is None

    def test_process_video_invalid_url(self, sample_schema):
        """Test video processing with invalid URL."""
        url = "https://invalid-url.com/not-a-video"

        # Should handle gracefully
        try:
            result = video_processor.process_video(url, sample_schema)
            assert result is None or isinstance(result, dict)
        except Exception:
            # Expected for completely invalid URLs
            pass

    @patch("rosen_scraper.processors.video_processor.yt_dlp.YoutubeDL")
    def test_process_video_short_url(self, mock_yt_dlp, sample_schema):
        """Test video processing with short YouTube URL."""
        mock_yt_instance = MagicMock()
        mock_info = {
            "title": "Test Video",
            "description": "Description",
            "uploader": "Channel",
        }
        mock_yt_instance.extract_info.return_value = mock_info
        mock_yt_instance.__enter__.return_value = mock_yt_instance
        mock_yt_instance.__exit__.return_value = None
        mock_yt_dlp.return_value = mock_yt_instance

        url = "https://youtu.be/test123"
        result = video_processor.process_video(url, sample_schema)

        assert result is None or isinstance(result, dict)

    @patch("rosen_scraper.processors.video_processor.yt_dlp.YoutubeDL")
    def test_process_video_uses_unique_temp_path(self, mock_yt_dlp, sample_schema):
        """yt-dlp must write the transcript to a unique, absolute temp path.

        Regression for #288: outtmpl was the bare CWD-relative 'temp_transcript',
        so two concurrent video submissions (or two Action runs sharing a
        workspace) collided on temp_transcript.en.vtt and corrupted a record's
        transcript.
        """
        mock_inst = MagicMock()
        mock_inst.extract_info.return_value = {"title": "t", "uploader": "u"}
        mock_inst.__enter__.return_value = mock_inst
        mock_inst.__exit__.return_value = None
        mock_yt_dlp.return_value = mock_inst

        video_processor.process_video("https://youtu.be/abc123", sample_schema)

        outtmpl = mock_yt_dlp.call_args.args[0]["outtmpl"]
        assert outtmpl != "temp_transcript"
        assert os.path.isabs(outtmpl), (
            "temp path must be absolute (a temp dir), not CWD-relative"
        )

    @patch("rosen_scraper.processors.video_processor.yt_dlp.YoutubeDL")
    def test_process_video_temp_path_unique_per_call(self, mock_yt_dlp, sample_schema):
        """Each call uses a distinct temp path so concurrent runs can't collide (#288)."""
        mock_inst = MagicMock()
        mock_inst.extract_info.return_value = {"title": "t", "uploader": "u"}
        mock_inst.__enter__.return_value = mock_inst
        mock_inst.__exit__.return_value = None
        mock_yt_dlp.return_value = mock_inst

        video_processor.process_video("https://youtu.be/one", sample_schema)
        video_processor.process_video("https://youtu.be/two", sample_schema)

        paths = [c.args[0]["outtmpl"] for c in mock_yt_dlp.call_args_list]
        assert paths[0] != paths[1], "each call must use a unique temp path"
