# -*- coding: utf-8 -*-
"""
PDF Accessibility Integration Tool

This module integrates accessibility checking with PDF generation to ensure
all generated PDFs meet accessibility standards. It provides workflows for:
- Generating accessible PDFs from spreadsheet data
- Evaluating existing PDFs for accessibility compliance
- Generating comprehensive accessibility reports
- Providing remediation guidance
"""

import os
import sys
import json
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from enhanced_pdf_generator import create_enhanced_pdf
from accessible_pdf_generator import create_accessible_pdf_from_record
from pdf_accessibility_checker import PDFAccessibilityChecker, batch_evaluate_accessibility
from batch_pdf_generator import connect_to_google_sheets, get_test_runs_data

class AccessibilityIntegration:
    """
    Main integration class for accessibility-aware PDF generation and evaluation.
    """
    
    def __init__(self):
        self.checker = PDFAccessibilityChecker()
        self.results_dir = "accessibility_results"
        os.makedirs(self.results_dir, exist_ok=True)
    
    def generate_and_evaluate_pdfs(self, records, use_accessible_generator=True, max_records=None):
        """
        Generates PDFs from records and immediately evaluates them for accessibility.
        
        Args:
            records (list): List of record dictionaries from Google Sheets
            use_accessible_generator (bool): Whether to use the accessible PDF generator
            max_records (int): Optional limit on number of PDFs to generate
            
        Returns:
            dict: Comprehensive results including generation and accessibility data
        """
        if max_records:
            records = records[:max_records]
        
        results = {
            'generation_results': {
                'total_attempted': len(records),
                'successful_generations': 0,
                'failed_generations': 0,
                'generated_files': []
            },
            'accessibility_results': {
                'total_evaluated': 0,
                'compliance_summary': {
                    'fully_compliant': 0,
                    'mostly_compliant': 0,
                    'partially_compliant': 0,
                    'non_compliant': 0
                },
                'average_score': 0,
                'detailed_evaluations': []
            },
            'recommendations': [],
            'timestamp': datetime.now().isoformat()
        }
        
        print(f"Starting generation and evaluation of {len(records)} PDFs...")
        print(f"Using {'accessible' if use_accessible_generator else 'standard'} PDF generator")
        
        output_dir = "accessible_pdfs" if use_accessible_generator else "standard_pdfs"
        scores = []
        
        for i, record in enumerate(records, 1):
            try:
                title = record.get('title', 'Untitled')[:50]
                print(f"\nProcessing record {i}/{len(records)}: {title}...")
                
                # Generate PDF
                if use_accessible_generator:
                    pdf_path = create_accessible_pdf_from_record(record, output_dir)
                else:
                    pdf_path = create_enhanced_pdf(record, output_dir)
                
                if pdf_path and os.path.exists(pdf_path):
                    results['generation_results']['successful_generations'] += 1
                    results['generation_results']['generated_files'].append(pdf_path)
                    
                    # Evaluate accessibility
                    print("  Evaluating accessibility...")
                    evaluation = self.checker.evaluate_pdf_accessibility(pdf_path)
                    
                    if evaluation:
                        results['accessibility_results']['total_evaluated'] += 1
                        results['accessibility_results']['detailed_evaluations'].append(evaluation)
                        
                        # Update compliance summary
                        compliance = evaluation['compliance_level']
                        if 'Fully Compliant' in compliance:
                            results['accessibility_results']['compliance_summary']['fully_compliant'] += 1
                        elif 'Mostly Compliant' in compliance:
                            results['accessibility_results']['compliance_summary']['mostly_compliant'] += 1
                        elif 'Partially Compliant' in compliance:
                            results['accessibility_results']['compliance_summary']['partially_compliant'] += 1
                        else:
                            results['accessibility_results']['compliance_summary']['non_compliant'] += 1
                        
                        scores.append(evaluation['accessibility_score'])
                        
                        print(f"  ✓ Generated and evaluated: {os.path.basename(pdf_path)}")
                        print(f"    Accessibility score: {evaluation['accessibility_score']}/100")
                        print(f"    Compliance: {evaluation['compliance_level']}")
                    else:
                        print("  ⚠ Generated but failed accessibility evaluation")
                else:
                    results['generation_results']['failed_generations'] += 1
                    print("  ✗ Failed to generate PDF")
                    
            except Exception as e:
                results['generation_results']['failed_generations'] += 1
                print(f"  ✗ Error processing record {i}: {e}")
        
        # Calculate averages and generate recommendations
        if scores:
            results['accessibility_results']['average_score'] = sum(scores) / len(scores)
        
        results['recommendations'] = self._generate_integration_recommendations(results)
        
        # Save comprehensive results
        self._save_integration_results(results, use_accessible_generator)
        
        return results
    
    def evaluate_existing_pdfs(self, pdf_directory):
        """
        Evaluates all existing PDFs in a directory for accessibility compliance.
        
        Args:
            pdf_directory (str): Directory containing PDF files to evaluate
            
        Returns:
            dict: Evaluation summary
        """
        print(f"Evaluating existing PDFs in: {pdf_directory}")
        
        summary = batch_evaluate_accessibility(pdf_directory, self.results_dir)
        
        # Generate recommendations based on results
        recommendations = self._generate_remediation_recommendations(summary)
        summary['remediation_recommendations'] = recommendations
        
        return summary
    
    def compare_generators(self, records, num_records=5):
        """
        Compares standard vs accessible PDF generators using the same records.
        
        Args:
            records (list): List of record dictionaries
            num_records (int): Number of records to use for comparison
            
        Returns:
            dict: Comparison results
        """
        comparison_records = records[:num_records]
        
        print("=" * 60)
        print("PDF GENERATOR ACCESSIBILITY COMPARISON")
        print("=" * 60)
        
        # Test standard generator
        print("\n--- Testing Standard PDF Generator ---")
        standard_results = self.generate_and_evaluate_pdfs(
            comparison_records, 
            use_accessible_generator=False, 
            max_records=num_records
        )
        
        # Test accessible generator
        print("\n--- Testing Accessible PDF Generator ---")
        accessible_results = self.generate_and_evaluate_pdfs(
            comparison_records, 
            use_accessible_generator=True, 
            max_records=num_records
        )
        
        # Generate comparison report
        comparison = {
            'comparison_date': datetime.now().isoformat(),
            'records_tested': num_records,
            'standard_generator': {
                'average_score': standard_results['accessibility_results']['average_score'],
                'compliance_summary': standard_results['accessibility_results']['compliance_summary'],
                'generated_files': len(standard_results['generation_results']['generated_files'])
            },
            'accessible_generator': {
                'average_score': accessible_results['accessibility_results']['average_score'],
                'compliance_summary': accessible_results['accessibility_results']['compliance_summary'],
                'generated_files': len(accessible_results['generation_results']['generated_files'])
            },
            'improvement_metrics': {},
            'recommendation': ''
        }
        
        # Calculate improvements
        score_improvement = (accessible_results['accessibility_results']['average_score'] - 
                           standard_results['accessibility_results']['average_score'])
        
        comparison['improvement_metrics'] = {
            'score_improvement': score_improvement,
            'compliance_improvement': {
                'fully_compliant_increase': (
                    accessible_results['accessibility_results']['compliance_summary']['fully_compliant'] -
                    standard_results['accessibility_results']['compliance_summary']['fully_compliant']
                ),
                'non_compliant_decrease': (
                    standard_results['accessibility_results']['compliance_summary']['non_compliant'] -
                    accessible_results['accessibility_results']['compliance_summary']['non_compliant']
                )
            }
        }
        
        # Generate recommendation
        if score_improvement > 10:
            comparison['recommendation'] = "Accessible generator shows significant improvement - recommended for production use"
        elif score_improvement > 0:
            comparison['recommendation'] = "Accessible generator shows improvement - consider adoption"
        else:
            comparison['recommendation'] = "Both generators show similar results - review specific accessibility requirements"
        
        # Save comparison results
        comparison_path = os.path.join(self.results_dir, f"generator_comparison_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        with open(comparison_path, 'w', encoding='utf-8') as f:
            json.dump(comparison, f, indent=2, ensure_ascii=False)
        
        # Print summary
        print("\n" + "=" * 60)
        print("COMPARISON SUMMARY")
        print("=" * 60)
        print(f"Standard Generator Average Score: {standard_results['accessibility_results']['average_score']:.1f}/100")
        print(f"Accessible Generator Average Score: {accessible_results['accessibility_results']['average_score']:.1f}/100")
        print(f"Improvement: {score_improvement:+.1f} points")
        print(f"\nRecommendation: {comparison['recommendation']}")
        print(f"\nDetailed comparison saved to: {comparison_path}")
        
        return comparison
    
    def _generate_integration_recommendations(self, results):
        """Generates recommendations based on generation and accessibility results."""
        recommendations = []
        
        avg_score = results['accessibility_results']['average_score']
        compliance_summary = results['accessibility_results']['compliance_summary']
        
        if avg_score < 70:
            recommendations.append({
                'priority': 'high',
                'category': 'overall',
                'action': 'Implement comprehensive accessibility improvements',
                'details': f"Average accessibility score of {avg_score:.1f} is below acceptable threshold"
            })
        
        if compliance_summary['non_compliant'] > compliance_summary['fully_compliant']:
            recommendations.append({
                'priority': 'high',
                'category': 'compliance',
                'action': 'Address non-compliance issues',
                'details': f"{compliance_summary['non_compliant']} PDFs are non-compliant vs {compliance_summary['fully_compliant']} fully compliant"
            })
        
        if results['generation_results']['failed_generations'] > 0:
            recommendations.append({
                'priority': 'medium',
                'category': 'generation',
                'action': 'Investigate PDF generation failures',
                'details': f"{results['generation_results']['failed_generations']} PDFs failed to generate"
            })
        
        return recommendations
    
    def _generate_remediation_recommendations(self, summary):
        """Generates remediation recommendations based on evaluation summary."""
        recommendations = []
        
        if summary['average_score'] < 80:
            recommendations.append({
                'priority': 'high',
                'action': 'Switch to accessible PDF generator',
                'rationale': f"Current average score of {summary['average_score']:.1f} indicates need for improvement"
            })
        
        if summary['compliance_summary']['non_compliant'] > 0:
            recommendations.append({
                'priority': 'high',
                'action': 'Remediate non-compliant PDFs',
                'rationale': f"{summary['compliance_summary']['non_compliant']} PDFs require accessibility fixes"
            })
        
        return recommendations
    
    def _save_integration_results(self, results, accessible_mode):
        """Saves integration results to file."""
        mode_suffix = "accessible" if accessible_mode else "standard"
        filename = f"integration_results_{mode_suffix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = os.path.join(self.results_dir, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        print(f"\nIntegration results saved to: {filepath}")


def main():
    """Main function for command-line usage."""
    integration = AccessibilityIntegration()
    
    if len(sys.argv) < 2:
        print("PDF Accessibility Integration Tool")
        print("=" * 40)
        print("Usage:")
        print("  python accessibility_integration.py generate [num_records] [accessible]")
        print("  python accessibility_integration.py evaluate [directory]")
        print("  python accessibility_integration.py compare [num_records]")
        print("")
        print("Commands:")
        print("  generate    - Generate PDFs from spreadsheet and evaluate accessibility")
        print("  evaluate    - Evaluate existing PDFs for accessibility")
        print("  compare     - Compare standard vs accessible generators")
        print("")
        print("Options:")
        print("  num_records - Number of records to process (default: 5)")
        print("  accessible  - Use accessible generator (add 'accessible' as argument)")
        print("  directory   - Directory containing PDFs to evaluate")
        return
    
    command = sys.argv[1].lower()
    
    if command == "generate":
        # Get records from spreadsheet
        spreadsheet = connect_to_google_sheets()
        if not spreadsheet:
            print("Failed to connect to Google Sheets")
            return
        
        records = get_test_runs_data(spreadsheet)
        if not records:
            print("No records found in test_runs sheet")
            return
        
        num_records = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        use_accessible = len(sys.argv) > 3 and 'accessible' in sys.argv[3].lower()
        
        results = integration.generate_and_evaluate_pdfs(
            records, 
            use_accessible_generator=use_accessible, 
            max_records=num_records
        )
        
        print("\n=== GENERATION AND EVALUATION COMPLETE ===")
        print(f"Generated: {results['generation_results']['successful_generations']}/{results['generation_results']['total_attempted']} PDFs")
        print(f"Average accessibility score: {results['accessibility_results']['average_score']:.1f}/100")
        
    elif command == "evaluate":
        directory = sys.argv[2] if len(sys.argv) > 2 else "processed_pdf_library"
        summary = integration.evaluate_existing_pdfs(directory)
        
        print("\n=== EVALUATION COMPLETE ===")
        print(f"Evaluated: {summary['evaluated_files']}/{summary['total_files']} PDFs")
        print(f"Average accessibility score: {summary['average_score']:.1f}/100")
        
    elif command == "compare":
        # Get records from spreadsheet
        spreadsheet = connect_to_google_sheets()
        if not spreadsheet:
            print("Failed to connect to Google Sheets")
            return
        
        records = get_test_runs_data(spreadsheet)
        if not records:
            print("No records found in test_runs sheet")
            return
        
        num_records = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        integration.compare_generators(records, num_records)
        
    else:
        print(f"Unknown command: {command}")
        print("Use 'python accessibility_integration.py' for help")


if __name__ == "__main__":
    main()