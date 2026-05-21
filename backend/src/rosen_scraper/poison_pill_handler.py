# -*- coding: utf-8 -*-
"""
Poison Pill Detection and Management System

Handles various types of problematic URLs and content that can cause
processing failures or produce poor results. Provides intelligent
routing and recovery strategies.
"""

import re
import time
from urllib.parse import urlparse
from typing import Dict, Optional, Tuple, Any
from dataclasses import dataclass

from rosen_scraper.logger import PoisonPillType, get_logger

@dataclass
class PoisonPillResult:
    """Result of poison pill detection."""
    is_poison: bool
    pill_type: Optional[PoisonPillType]
    severity: str  # "low", "medium", "high", "critical"
    details: Dict[str, Any]
    recommended_action: str
    retry_strategy: Optional[str] = None

class PoisonPillDetector:
    """
    Detects and classifies poison pills in the processing pipeline.
    """

    def __init__(self):
        """Initialize the poison pill detector."""
        self.logger = get_logger()

        # Known problematic domains
        self.paywall_domains = {
            "www.washingtonpost.com": "premium",
            "www.nytimes.com": "premium",
            "www.wsj.com": "premium",
            "www.ft.com": "premium",
            "www.theatlantic.com": "metered",
            "www.newyorker.com": "metered",
            "medium.com": "member_only"
        }

        # Anti-bot detection patterns
        self.anti_bot_indicators = [
            "cloudflare",
            "captcha",
            "please verify you are human",
            "access denied",
            "forbidden",
            "bot detection",
            "unusual traffic"
        ]

        # JavaScript-heavy site patterns
        self.js_heavy_patterns = [
            "Loading...",
            "Please enable JavaScript",
            "JavaScript required",
            "Single Page Application",
            "React",
            "Angular",
            "Vue.js"
        ]

        # Content quality thresholds
        self.min_content_length = 500
        self.min_word_count = 100
        self.max_html_js_ratio = 0.8

    def detect_url_poison_pill(self, url: str) -> PoisonPillResult:
        """
        Detect poison pills at the URL level before processing.

        Args:
            url: URL to analyze

        Returns:
            PoisonPillResult indicating if URL is problematic
        """
        domain = urlparse(url).netloc.lower()

        # Check for paywall domains
        if domain in self.paywall_domains:
            paywall_type = self.paywall_domains[domain]
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.PAYWALL_DETECTED,
                severity="medium",
                details={"domain": domain, "paywall_type": paywall_type},
                recommended_action="route_to_manual_access",
                retry_strategy="manual_intervention"
            )

        # Check URL patterns that indicate problems
        if self._check_suspicious_url_patterns(url):
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.DEAD_LINK,
                severity="high",
                details={"url": url, "issue": "suspicious_pattern"},
                recommended_action="skip_processing"
            )

        # URL looks clean
        return PoisonPillResult(
            is_poison=False,
            pill_type=None,
            severity="none",
            details={},
            recommended_action="proceed"
        )

    def detect_content_poison_pill(self, content: str, url: str = None) -> PoisonPillResult:
        """
        Detect poison pills in content after scraping.

        Args:
            content: Scraped content to analyze
            url: Original URL (optional)

        Returns:
            PoisonPillResult indicating content quality issues
        """
        if not content:
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.MALFORMED_CONTENT,
                severity="high",
                details={"issue": "empty_content"},
                recommended_action="skip_processing"
            )

        # Check content length
        if len(content) < self.min_content_length:
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.CONTENT_TOO_SHORT,
                severity="medium",
                details={"content_length": len(content), "threshold": self.min_content_length},
                recommended_action="try_playwright_fallback",
                retry_strategy="browser_rendering"
            )

        # Check for anti-bot detection
        content_lower = content.lower()
        for indicator in self.anti_bot_indicators:
            if indicator in content_lower:
                return PoisonPillResult(
                    is_poison=True,
                    pill_type=PoisonPillType.ANTI_BOT,
                    severity="high",
                    details={"indicator": indicator, "url": url},
                    recommended_action="try_different_user_agent",
                    retry_strategy="stealth_mode"
                )

        # Check for JavaScript-heavy content
        js_score = self._calculate_js_dependency_score(content)
        if js_score > self.max_html_js_ratio:
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.JAVASCRIPT_HEAVY,
                severity="medium",
                details={"js_score": js_score, "url": url},
                recommended_action="require_browser_rendering",
                retry_strategy="playwright_required"
            )

        # Check word count after basic cleaning
        word_count = len(content.split())
        if word_count < self.min_word_count:
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.CONTENT_TOO_SHORT,
                severity="medium",
                details={"word_count": word_count, "threshold": self.min_word_count},
                recommended_action="try_different_extraction_method"
            )

        # Content looks acceptable
        return PoisonPillResult(
            is_poison=False,
            pill_type=None,
            severity="none",
            details={"content_length": len(content), "word_count": word_count},
            recommended_action="proceed"
        )

    def detect_processing_poison_pill(self, error_type: str, error_message: str, url: str = None) -> PoisonPillResult:
        """
        Detect poison pills from processing errors.

        Args:
            error_type: Type of error encountered
            error_message: Error message details
            url: URL being processed (optional)

        Returns:
            PoisonPillResult with error classification
        """
        error_lower = error_message.lower()

        # Network-related errors
        if any(term in error_lower for term in ["timeout", "connection", "network", "dns"]):
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.DEAD_LINK,
                severity="medium",
                details={"error": error_message, "url": url},
                recommended_action="retry_with_backoff",
                retry_strategy="exponential_backoff"
            )

        # API-related errors
        if any(term in error_lower for term in ["api", "quota", "rate limit", "authentication"]):
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.API_FAILURE,
                severity="high",
                details={"error": error_message, "url": url},
                recommended_action="retry_after_delay",
                retry_strategy="api_backoff"
            )

        # Parsing/content errors
        if any(term in error_lower for term in ["json", "parse", "decode", "format"]):
            return PoisonPillResult(
                is_poison=True,
                pill_type=PoisonPillType.MALFORMED_CONTENT,
                severity="medium",
                details={"error": error_message, "url": url},
                recommended_action="try_alternative_processing"
            )

        # General error
        return PoisonPillResult(
            is_poison=True,
            pill_type=PoisonPillType.MALFORMED_CONTENT,
            severity="medium",
            details={"error_type": error_type, "error": error_message, "url": url},
            recommended_action="log_and_skip"
        )

    def _check_suspicious_url_patterns(self, url: str) -> bool:
        """Check for URL patterns that indicate problems."""
        suspicious_patterns = [
            r'localhost',
            r'127\.0\.0\.1',
            r'\.onion$',
            r'[^\w\-\./:]',  # Non-standard characters
            r'^https?://[^/]*\.local/',
        ]

        for pattern in suspicious_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return True

        return False

    def _calculate_js_dependency_score(self, content: str) -> float:
        """
        Calculate how JavaScript-dependent the content appears to be.

        Returns:
            Float between 0.0 and 1.0, where higher values indicate
            more JavaScript dependency
        """
        if not content:
            return 1.0

        # Count JavaScript-related elements
        js_indicators = [
            "<script",
            "javascript:",
            "onclick=",
            "onload=",
            "$(", # jQuery
            "document.getElementById",
            "document.querySelector",
            "addEventListener"
        ]

        js_count = sum(content.lower().count(indicator) for indicator in js_indicators)

        # Count total HTML elements (rough estimate)
        html_element_count = content.count('<')

        if html_element_count == 0:
            return 0.0

        # Calculate ratio
        js_score = min(js_count / html_element_count, 1.0)
        return js_score


class PoisonPillManager:
    """
    Manages poison pill detection and routing throughout the pipeline.
    """

    def __init__(self):
        """Initialize the poison pill manager."""
        self.detector = PoisonPillDetector()
        self.logger = get_logger()

        # Retry configuration
        self.retry_config = {
            "exponential_backoff": {"max_retries": 3, "base_delay": 2},
            "api_backoff": {"max_retries": 2, "base_delay": 10},
            "stealth_mode": {"max_retries": 1, "base_delay": 5},
            "browser_rendering": {"max_retries": 1, "base_delay": 0},
            "manual_intervention": {"max_retries": 0, "base_delay": 0}
        }

        # Track poison pills for analysis
        self.poison_pill_log = []

    def check_url(self, url: str) -> Tuple[bool, Optional[PoisonPillResult]]:
        """
        Check if a URL should be processed or handled specially.

        Args:
            url: URL to check

        Returns:
            Tuple of (should_process, poison_pill_result)
        """
        result = self.detector.detect_url_poison_pill(url)

        if result.is_poison:
            self.logger.log_poison_pill(url, result.pill_type, result.details)
            self.poison_pill_log.append({
                "url": url,
                "type": result.pill_type.value,
                "severity": result.severity,
                "timestamp": time.time(),
                "action": result.recommended_action
            })
            return False, result

        return True, None

    def check_content(self, content: str, url: str = None) -> Tuple[bool, Optional[PoisonPillResult]]:
        """
        Check if content is suitable for processing.

        Args:
            content: Content to check
            url: Original URL (optional)

        Returns:
            Tuple of (should_continue, poison_pill_result)
        """
        result = self.detector.detect_content_poison_pill(content, url)

        if result.is_poison:
            self.logger.log_poison_pill(url or "unknown", result.pill_type, result.details)
            self.poison_pill_log.append({
                "url": url or "unknown",
                "type": result.pill_type.value,
                "severity": result.severity,
                "timestamp": time.time(),
                "action": result.recommended_action
            })

            # Check if we should attempt recovery
            if result.retry_strategy:
                return False, result  # Caller can handle retry
            else:
                return False, result  # Skip processing

        return True, None

    def handle_processing_error(self, error_type: str, error_message: str, url: str = None) -> PoisonPillResult:
        """
        Handle and classify processing errors.

        Args:
            error_type: Type of error
            error_message: Error message
            url: URL being processed (optional)

        Returns:
            PoisonPillResult with recommended actions
        """
        result = self.detector.detect_processing_poison_pill(error_type, error_message, url)

        if result.is_poison:
            self.logger.log_poison_pill(url or "unknown", result.pill_type, result.details)
            self.poison_pill_log.append({
                "url": url or "unknown",
                "type": result.pill_type.value,
                "severity": result.severity,
                "timestamp": time.time(),
                "action": result.recommended_action,
                "error": error_message
            })

        return result

    def should_retry(self, result: PoisonPillResult, attempt: int = 1) -> bool:
        """
        Determine if processing should be retried based on poison pill result.

        Args:
            result: PoisonPillResult from previous attempt
            attempt: Current attempt number (1-based)

        Returns:
            True if retry should be attempted
        """
        if not result.retry_strategy:
            return False

        config = self.retry_config.get(result.retry_strategy)
        if not config:
            return False

        return attempt <= config["max_retries"]

    def get_retry_delay(self, result: PoisonPillResult, attempt: int = 1) -> float:
        """
        Get delay before retry attempt.

        Args:
            result: PoisonPillResult from previous attempt
            attempt: Current attempt number (1-based)

        Returns:
            Delay in seconds
        """
        if not result.retry_strategy:
            return 0

        config = self.retry_config.get(result.retry_strategy)
        if not config:
            return 0

        base_delay = config["base_delay"]

        if result.retry_strategy == "exponential_backoff":
            return base_delay * (2 ** (attempt - 1))
        else:
            return base_delay

    def get_poison_pill_summary(self) -> Dict[str, Any]:
        """Get summary of poison pills encountered."""
        if not self.poison_pill_log:
            return {"total": 0, "by_type": {}, "by_severity": {}}

        # Count by type
        by_type = {}
        by_severity = {}

        for entry in self.poison_pill_log:
            pill_type = entry["type"]
            severity = entry["severity"]

            by_type[pill_type] = by_type.get(pill_type, 0) + 1
            by_severity[severity] = by_severity.get(severity, 0) + 1

        return {
            "total": len(self.poison_pill_log),
            "by_type": by_type,
            "by_severity": by_severity,
            "recent_entries": self.poison_pill_log[-10:]  # Last 10 entries
        }

# Global poison pill manager instance
_global_manager = None

def get_poison_pill_manager() -> PoisonPillManager:
    """Get the global poison pill manager instance."""
    global _global_manager
    if _global_manager is None:
        _global_manager = PoisonPillManager()
    return _global_manager