# -*- coding: utf-8 -*-
"""
Centralized Logging System for Rosen Archive Pipeline

Provides comprehensive logging capabilities including:
- Console output for immediate feedback
- File logging for persistent records
- Error tracking and analysis
- Performance metrics collection
- Poison pill detection and handling
"""

import logging
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from enum import Enum

from rosen_scraper.path_utils import find_project_root

class LogLevel(Enum):
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"

class PoisonPillType(Enum):
    CONTENT_TOO_SHORT = "content_too_short"
    PAYWALL_DETECTED = "paywall_detected"
    JAVASCRIPT_HEAVY = "javascript_heavy"
    DEAD_LINK = "dead_link"
    ANTI_BOT = "anti_bot"
    MALFORMED_CONTENT = "malformed_content"
    API_FAILURE = "api_failure"

class ArchiveLogger:
    """
    Centralized logging system for the Rosen Archive processing pipeline.
    Provides structured logging with multiple output targets and automatic
    error categorization.
    """

    def __init__(self, log_dir: str = "logs"):
        """
        Initialize the logging system.

        Args:
            log_dir: Directory to store log files
        """
        # Anchor a relative log_dir to the project root so the log tree lands in
        # a stable backend-rooted location regardless of cwd (#357). An absolute
        # path is honored unchanged and never consults the project root, so
        # callers passing an absolute path keep working in any environment.
        log_path = Path(log_dir)
        self.log_dir = (
            log_path if log_path.is_absolute() else find_project_root() / log_path
        )
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.start_time = time.time()

        # Create log directories
        self._setup_directories()

        # Initialize loggers
        self._setup_loggers()

        # Performance tracking
        self.processing_stats = {
            "total_processed": 0,
            "successful": 0,
            "failed": 0,
            "poison_pills": 0,
            "start_time": self.start_time,
            "processing_times": [],
            "error_counts": {},
            "poison_pill_counts": {}
        }

        self.logger.info(f"Archive logging system initialized - Session: {self.session_id}")

    def _setup_directories(self):
        """Create necessary log directories."""
        dirs = [
            self.log_dir,
            self.log_dir / "daily",
            self.log_dir / "weekly",
            self.log_dir / "monthly",
            self.log_dir / "errors",
            self.log_dir / "performance"
        ]

        for directory in dirs:
            directory.mkdir(parents=True, exist_ok=True)

    def _setup_loggers(self):
        """Initialize logging handlers for different output targets."""
        today = datetime.now().strftime("%Y-%m-%d")

        # Main logger
        self.logger = logging.getLogger("archive_pipeline")
        self.logger.setLevel(logging.DEBUG)
        self.logger.handlers.clear()  # Clear any existing handlers

        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_formatter = logging.Formatter(
            '%(asctime)s [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        self.logger.addHandler(console_handler)

        # Main log file handler
        main_log_file = self.log_dir / "daily" / f"{today}_processing.log"
        main_handler = logging.FileHandler(main_log_file, encoding='utf-8')
        main_handler.setLevel(logging.DEBUG)
        main_formatter = logging.Formatter(
            '%(asctime)s [%(levelname)s] [%(name)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        main_handler.setFormatter(main_formatter)
        self.logger.addHandler(main_handler)

        # Error log file handler
        error_log_file = self.log_dir / "daily" / f"{today}_errors.log"
        error_handler = logging.FileHandler(error_log_file, encoding='utf-8')
        error_handler.setLevel(logging.WARNING)
        error_handler.setFormatter(main_formatter)
        self.logger.addHandler(error_handler)

        # Performance log file
        self.performance_log_file = self.log_dir / "performance" / f"{today}_performance.json"

    def log_processing_start(self, url: str, record_id: str):
        """Log the start of processing for a URL."""
        self.logger.info(f"Processing started: URL={url}, ID={record_id}")
        return time.time()  # Return start time for duration calculation

    def log_processing_end(self, record_id: str, start_time: float, success: bool):
        """Log the completion of processing for a record."""
        duration = time.time() - start_time
        self.processing_stats["processing_times"].append(duration)
        self.processing_stats["total_processed"] += 1

        if success:
            self.processing_stats["successful"] += 1
            self.logger.info(f"Processing completed: record_id={record_id}, duration={duration:.2f}s")
        else:
            self.processing_stats["failed"] += 1
            self.logger.error(f"Processing failed: record_id={record_id}, duration={duration:.2f}s")

    def log_scraping_attempt(self, url: str, method: str, success: bool, details: Dict[str, Any] = None):
        """Log a scraping attempt with method and result."""
        details = details or {}

        if success:
            self.logger.info(f"Scraping success: method={method}, url={url}, {self._format_details(details)}")
        else:
            self.logger.warning(f"Scraping failed: method={method}, url={url}, {self._format_details(details)}")

    def log_ai_analysis(self, record_id: str, success: bool, tokens_used: int = None, duration: float = None):
        """Log AI analysis operation."""
        details = []
        if tokens_used:
            details.append(f"tokens={tokens_used}")
        if duration:
            details.append(f"duration={duration:.2f}s")

        detail_str = ", ".join(details)

        if success:
            self.logger.info(f"AI analysis success: record_id={record_id}, {detail_str}")
        else:
            self.logger.error(f"AI analysis failed: record_id={record_id}, {detail_str}")

    def log_pdf_generation(self, record_id: str, filepath: str, success: bool, file_size: int = None):
        """Log PDF generation operation."""
        if success:
            size_info = f", size={file_size} bytes" if file_size else ""
            self.logger.info(f"PDF generated: record_id={record_id}, file={filepath}{size_info}")
        else:
            self.logger.error(f"PDF generation failed: record_id={record_id}, target={filepath}")

    def log_sheets_operation(self, operation: str, record_id: str, success: bool, details: Dict[str, Any] = None):
        """Log Google Sheets operations."""
        details = details or {}

        if success:
            self.logger.info(f"Sheets {operation}: record_id={record_id}, {self._format_details(details)}")
        else:
            self.logger.error(f"Sheets {operation} failed: record_id={record_id}, {self._format_details(details)}")

    def log_poison_pill(self, url: str, pill_type: PoisonPillType, details: Dict[str, Any] = None):
        """Log detection of a poison pill URL."""
        self.processing_stats["poison_pills"] += 1

        # Track poison pill type counts
        pill_type_str = pill_type.value
        if pill_type_str not in self.processing_stats["poison_pill_counts"]:
            self.processing_stats["poison_pill_counts"][pill_type_str] = 0
        self.processing_stats["poison_pill_counts"][pill_type_str] += 1

        details = details or {}
        self.logger.warning(f"Poison pill detected: type={pill_type_str}, url={url}, {self._format_details(details)}")

    def log_error(self, error_type: str, message: str, record_id: str = None, url: str = None, details: Dict[str, Any] = None):
        """Log a general error with categorization."""
        # Track error type counts
        if error_type not in self.processing_stats["error_counts"]:
            self.processing_stats["error_counts"][error_type] = 0
        self.processing_stats["error_counts"][error_type] += 1

        context = []
        if record_id:
            context.append(f"record_id={record_id}")
        if url:
            context.append(f"url={url}")
        if details:
            context.append(self._format_details(details))

        context_str = ", ".join(context)
        self.logger.error(f"Error [{error_type}]: {message} ({context_str})")

    def log_performance_milestone(self, milestone: str, details: Dict[str, Any] = None):
        """Log performance milestones and metrics."""
        details = details or {}
        self.logger.info(f"Performance milestone: {milestone}, {self._format_details(details)}")

    def generate_session_summary(self) -> Dict[str, Any]:
        """Generate a summary of the current processing session."""
        current_time = time.time()
        total_duration = current_time - self.start_time

        # Calculate averages
        avg_processing_time = 0
        if self.processing_stats["processing_times"]:
            avg_processing_time = sum(self.processing_stats["processing_times"]) / len(self.processing_stats["processing_times"])

        # Calculate success rate
        total_attempted = self.processing_stats["total_processed"]
        success_rate = (self.processing_stats["successful"] / total_attempted * 100) if total_attempted > 0 else 0

        summary = {
            "session_id": self.session_id,
            "total_duration": total_duration,
            "total_processed": total_attempted,
            "successful": self.processing_stats["successful"],
            "failed": self.processing_stats["failed"],
            "poison_pills": self.processing_stats["poison_pills"],
            "success_rate_percent": round(success_rate, 2),
            "average_processing_time": round(avg_processing_time, 2),
            "records_per_minute": round((total_attempted / (total_duration / 60)), 2) if total_duration > 0 else 0,
            "error_breakdown": self.processing_stats["error_counts"],
            "poison_pill_breakdown": self.processing_stats["poison_pill_counts"]
        }

        return summary

    def save_performance_metrics(self):
        """Save performance metrics to JSON file."""
        summary = self.generate_session_summary()

        try:
            with open(self.performance_log_file, 'w', encoding='utf-8') as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            self.logger.info(f"Performance metrics saved to {self.performance_log_file}")
        except Exception as e:
            self.logger.error(f"Failed to save performance metrics: {e}")

    def log_session_end(self):
        """Log the end of a processing session with summary."""
        summary = self.generate_session_summary()

        self.logger.info("="*50)
        self.logger.info("PROCESSING SESSION SUMMARY")
        self.logger.info("="*50)
        self.logger.info(f"Session ID: {summary['session_id']}")
        self.logger.info(f"Total Duration: {summary['total_duration']:.2f} seconds")
        self.logger.info(f"Records Processed: {summary['total_processed']}")
        self.logger.info(f"Success Rate: {summary['success_rate_percent']}%")
        self.logger.info(f"Average Processing Time: {summary['average_processing_time']}s per record")
        self.logger.info(f"Processing Rate: {summary['records_per_minute']} records/minute")

        if summary['error_breakdown']:
            self.logger.info("Error Breakdown:")
            for error_type, count in summary['error_breakdown'].items():
                self.logger.info(f"  - {error_type}: {count}")

        if summary['poison_pill_breakdown']:
            self.logger.info("Poison Pill Breakdown:")
            for pill_type, count in summary['poison_pill_breakdown'].items():
                self.logger.info(f"  - {pill_type}: {count}")

        self.logger.info("="*50)

        # Save metrics to file
        self.save_performance_metrics()

    def _format_details(self, details: Dict[str, Any]) -> str:
        """Format details dictionary for logging."""
        if not details:
            return ""

        formatted = []
        for key, value in details.items():
            if isinstance(value, str) and len(value) > 50:
                value = value[:47] + "..."
            formatted.append(f"{key}={value}")

        return ", ".join(formatted)

# Global logger instance
_global_logger = None

def get_logger() -> ArchiveLogger:
    """Get the global logger instance, creating it if necessary."""
    global _global_logger
    if _global_logger is None:
        _global_logger = ArchiveLogger()
    return _global_logger

def init_logger(log_dir: str = "logs") -> ArchiveLogger:
    """Initialize the global logger with specified directory."""
    global _global_logger
    _global_logger = ArchiveLogger(log_dir)
    return _global_logger