# -*- coding: utf-8 -*-
"""
Cost Tracking Module
Tracks and limits API costs during processing.
"""

from typing import Dict, Optional
from datetime import datetime


class BudgetExceededError(Exception):
    """Raised when processing budget is exceeded."""
    pass


class CostTracker:
    """Tracks API costs and enforces budget limits."""

    # Cost rates (USD)
    COSTS = {
        'gemini_flash': 0.00050,           # per 1K tokens
        'gemini_flash_lite': 0.00025,      # per 1K tokens (cheaper model)
        'speech_to_text': 0.024,           # per minute (original speed)
        'speech_to_text_optimized': 0.012, # per minute (2x speed = half cost)
        'url_context': 0.00050,            # per request
        'sheets_api': 0.00,                # free under quota
    }

    def __init__(self, max_budget: float = 50.00, speed_optimization: bool = True):
        """
        Initialize cost tracker.

        Args:
            max_budget: Maximum allowed spending (USD)
            speed_optimization: Whether audio speed optimization is enabled
        """
        self.max_budget = max_budget
        self.speed_optimization = speed_optimization
        self.costs = {
            'gemini_flash': 0.0,
            'gemini_flash_lite': 0.0,
            'speech_to_text': 0.0,
            'url_context': 0.0,
            'sheets_api': 0.0,
            'total': 0.0
        }
        self.operations = []  # Log of all operations
        self.start_time = datetime.now()

    def estimate_cost(
        self,
        content_type: str,
        duration: Optional[float] = None,
        text_length: Optional[int] = None
    ) -> float:
        """
        Estimate cost for processing content.

        Args:
            content_type: 'article', 'audio', 'video', 'social'
            duration: Duration in minutes (for audio/video)
            text_length: Text length in characters (for AI analysis)

        Returns:
            Estimated cost in USD
        """
        cost = 0.0

        if content_type == 'audio':
            # Audio transcription cost
            avg_duration = duration or 30  # Default 30 minutes

            if self.speed_optimization:
                # 2x speed = half the duration = half the cost
                effective_duration = avg_duration / 2.0
                cost += effective_duration * self.COSTS['speech_to_text']
            else:
                cost += avg_duration * self.COSTS['speech_to_text']

            # AI analysis cost
            cost += self._estimate_ai_cost(text_length or 5000)

        elif content_type == 'video':
            # Video transcript extraction (if embedded) or transcription
            if duration:
                # Assume we need to transcribe
                if self.speed_optimization:
                    effective_duration = (duration or 30) / 2.0
                    cost += effective_duration * self.COSTS['speech_to_text']
                else:
                    cost += duration * self.COSTS['speech_to_text']
            else:
                # Assume transcript is embedded (cheap)
                cost += 0.05

            # AI analysis
            cost += self._estimate_ai_cost(text_length or 5000)

        elif content_type == 'social':
            # Social media extraction (scraping)
            cost += 0.01

            # AI analysis
            cost += self._estimate_ai_cost(text_length or 2000)

        else:  # article
            # Scraping cost (URL Context or Playwright)
            cost += 0.005

            # AI analysis
            cost += self._estimate_ai_cost(text_length or 3000)

        return round(cost, 4)

    def _estimate_ai_cost(self, text_length: int) -> float:
        """Estimate AI analysis cost based on text length."""
        # Rough estimate: 1 char ≈ 0.25 tokens
        estimated_tokens = text_length * 0.25

        # Prompt + response typically doubles token count
        total_tokens = estimated_tokens * 2

        # Cost in thousands of tokens
        cost = (total_tokens / 1000) * self.COSTS['gemini_flash']
        return cost

    def can_afford(self, estimated_cost: float) -> bool:
        """Check if we can afford an operation."""
        return (self.costs['total'] + estimated_cost) <= self.max_budget

    def record_cost(
        self,
        cost_type: str,
        amount: float,
        operation: str = '',
        details: Optional[Dict] = None
    ):
        """
        Record an actual cost.

        Args:
            cost_type: Type of cost (e.g., 'gemini_flash', 'speech_to_text')
            amount: Cost amount in USD
            operation: Description of operation
            details: Additional details dict
        """
        if cost_type not in self.costs:
            raise ValueError(f"Unknown cost type: {cost_type}")

        self.costs[cost_type] += amount
        self.costs['total'] += amount

        # Log operation
        self.operations.append({
            'timestamp': datetime.now(),
            'cost_type': cost_type,
            'amount': amount,
            'operation': operation,
            'details': details or {},
            'running_total': self.costs['total']
        })

        # Check budget
        if self.costs['total'] >= self.max_budget * 0.9:
            print(f"  ⚠️  WARNING: 90% of budget used (${self.costs['total']:.2f}/${self.max_budget:.2f})")

        if self.costs['total'] > self.max_budget:
            raise BudgetExceededError(
                f"Budget exceeded: ${self.costs['total']:.2f} > ${self.max_budget:.2f}"
            )

    def get_summary(self) -> Dict:
        """Get cost summary and statistics."""
        elapsed_time = (datetime.now() - self.start_time).total_seconds() / 60  # minutes

        return {
            'total_cost': round(self.costs['total'], 2),
            'budget_remaining': round(self.max_budget - self.costs['total'], 2),
            'budget_used_percent': round((self.costs['total'] / self.max_budget) * 100, 1),
            'breakdown': {
                'gemini_ai': round(self.costs['gemini_flash'] + self.costs['gemini_flash_lite'], 2),
                'transcription': round(self.costs['speech_to_text'], 2),
                'url_context': round(self.costs['url_context'], 2),
            },
            'operations_count': len(self.operations),
            'elapsed_time_minutes': round(elapsed_time, 1),
            'average_cost_per_operation': round(self.costs['total'] / max(len(self.operations), 1), 4)
        }

    def print_summary(self):
        """Print formatted cost summary."""
        summary = self.get_summary()

        print("\n" + "="*60)
        print("COST SUMMARY")
        print("="*60)
        print(f"Total Cost:        ${summary['total_cost']:.2f}")
        print(f"Budget Remaining:  ${summary['budget_remaining']:.2f}")
        print(f"Budget Used:       {summary['budget_used_percent']:.1f}%")
        print("\nBreakdown:")
        print(f"  Gemini AI:       ${summary['breakdown']['gemini_ai']:.2f}")
        print(f"  Transcription:   ${summary['breakdown']['transcription']:.2f}")
        print(f"  URL Context:     ${summary['breakdown']['url_context']:.2f}")
        print(f"\nOperations:        {summary['operations_count']}")
        print(f"Time Elapsed:      {summary['elapsed_time_minutes']:.1f} minutes")
        print(f"Avg Cost/Op:       ${summary['average_cost_per_operation']:.4f}")
        print("="*60 + "\n")

    def get_savings_report(self, original_cost_estimate: float) -> Dict:
        """
        Generate savings report compared to original estimate.

        Args:
            original_cost_estimate: What it would have cost without optimization

        Returns:
            Dict with savings information
        """
        actual_cost = self.costs['total']
        savings = original_cost_estimate - actual_cost
        savings_percent = (savings / original_cost_estimate * 100) if original_cost_estimate > 0 else 0

        return {
            'original_estimate': round(original_cost_estimate, 2),
            'actual_cost': round(actual_cost, 2),
            'savings': round(savings, 2),
            'savings_percent': round(savings_percent, 1),
            'optimization_enabled': self.speed_optimization
        }

    def export_log(self, filename: str = 'cost_log.json'):
        """Export cost log to JSON file."""
        import json

        log_data = {
            'summary': self.get_summary(),
            'costs': self.costs,
            'operations': [
                {
                    'timestamp': op['timestamp'].isoformat(),
                    'cost_type': op['cost_type'],
                    'amount': op['amount'],
                    'operation': op['operation'],
                    'details': op['details'],
                    'running_total': op['running_total']
                }
                for op in self.operations
            ],
            'settings': {
                'max_budget': self.max_budget,
                'speed_optimization': self.speed_optimization
            }
        }

        with open(filename, 'w') as f:
            json.dump(log_data, f, indent=2)

        print(f"Cost log exported to: {filename}")
