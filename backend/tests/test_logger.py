"""
Tests for the rosen_scraper.logger module.

These tests target the current ArchiveLogger API (see issue #181 for the
realignment from a pre-refactor logger shape that no longer exists).
"""
from rosen_scraper.logger import (
    ArchiveLogger,
    PoisonPillType,
    get_logger,
    init_logger,
)


class TestPoisonPillTypeEnum:
    """PoisonPillType is the public enum used across the scraping pipeline."""

    def test_has_expected_members(self):
        # Pin the public members so adding/removing one is an intentional change.
        expected = {
            'CONTENT_TOO_SHORT',
            'PAYWALL_DETECTED',
            'JAVASCRIPT_HEAVY',
            'DEAD_LINK',
            'ANTI_BOT',
            'MALFORMED_CONTENT',
            'API_FAILURE',
        }
        actual = {m.name for m in PoisonPillType}
        assert actual == expected, f"PoisonPillType members drifted: {actual ^ expected}"


class TestInitLogger:
    """init_logger() creates an ArchiveLogger and wires it as the global instance."""

    def test_returns_archive_logger(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        logger = init_logger(log_dir=str(tmp_path / "logs"))
        assert isinstance(logger, ArchiveLogger)

    def test_underlying_stdlib_logger_is_named_archive_pipeline(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        logger = init_logger(log_dir=str(tmp_path / "logs"))
        assert logger.logger.name == 'archive_pipeline'

    def test_underlying_stdlib_logger_has_handlers(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        logger = init_logger(log_dir=str(tmp_path / "logs"))
        assert len(logger.logger.handlers) > 0

    def test_can_log_messages_via_underlying_logger(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        logger = init_logger(log_dir=str(tmp_path / "logs"))
        # ArchiveLogger exposes the stdlib Logger at .logger for normal logging
        # calls; structured pipeline events go through log_processing_start etc.
        logger.logger.info("info message")
        logger.logger.warning("warning message")
        logger.logger.error("error message")

    def test_log_processing_start_does_not_raise(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        logger = init_logger(log_dir=str(tmp_path / "logs"))
        logger.log_processing_start("https://example.com", "TEST-001")


class TestGetLogger:
    """get_logger() returns the same global instance across calls."""

    def test_returns_archive_logger(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        init_logger(log_dir=str(tmp_path / "logs"))
        logger = get_logger()
        assert isinstance(logger, ArchiveLogger)

    def test_returns_same_instance_across_calls(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        init_logger(log_dir=str(tmp_path / "logs"))
        assert get_logger() is get_logger()
