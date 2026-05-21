# -*- coding: utf-8 -*-
"""
PDF Accessibility Checker Tool

This module evaluates PDF files for accessibility compliance based on:
- WCAG 2.1 AA Guidelines
- PDF/UA (Universal Accessibility) Standards
- Section 508 Compliance
- Screen reader compatibility

The tool provides detailed reports and recommendations for improving PDF accessibility.
"""

import os
import json
from datetime import datetime
from pathlib import Path
try:
    import PyPDF2
    import pdfplumber
    ADVANCED_ANALYSIS = True
except ImportError:
    ADVANCED_ANALYSIS = False
    print("Warning: PyPDF2 and/or pdfplumber not installed. Install with: pip install PyPDF2 pdfplumber")

class PDFAccessibilityChecker:
    """
    Comprehensive PDF accessibility evaluation tool.
    """
    
    def __init__(self):
        self.accessibility_standards = {
            'wcag_2_1': {
                'level': 'AA',
                'guidelines': [
                    'Perceivable',
                    'Operable', 
                    'Understandable',
                    'Robust'
                ]
            },
            'pdf_ua': {
                'version': '1.0',
                'requirements': [
                    'Logical structure',
                    'Tagged content',
                    'Navigation aids',
                    'Alternative text'
                ]
            }
        }
    
    def evaluate_pdf_accessibility(self, pdf_path):
        """
        Performs comprehensive accessibility evaluation of a PDF file.
        
        Args:
            pdf_path (str): Path to the PDF file to evaluate
            
        Returns:
            dict: Detailed accessibility evaluation report
        """
        if not os.path.exists(pdf_path):
            return self._create_error_report(pdf_path, "File not found")
        
        # Initialize evaluation report
        report = {
            'file_info': {
                'path': pdf_path,
                'filename': os.path.basename(pdf_path),
                'size_bytes': os.path.getsize(pdf_path),
                'evaluation_date': datetime.now().isoformat(),
                'checker_version': '1.0'
            },
            'accessibility_score': 0,
            'compliance_level': 'Non-compliant',
            'critical_issues': [],
            'warnings': [],
            'recommendations': [],
            'detailed_analysis': {},
            'remediation_steps': []
        }
        
        try:
            # Perform basic file analysis
            basic_analysis = self._analyze_basic_structure(pdf_path)
            report['detailed_analysis']['basic_structure'] = basic_analysis
            
            # Perform advanced analysis if libraries available
            if ADVANCED_ANALYSIS:
                advanced_analysis = self._analyze_advanced_features(pdf_path)
                report['detailed_analysis']['advanced_features'] = advanced_analysis
            else:
                report['warnings'].append("Advanced analysis not available - install PyPDF2 and pdfplumber")
            
            # Evaluate accessibility criteria
            self._evaluate_structure_accessibility(report)
            self._evaluate_content_accessibility(report)
            self._evaluate_navigation_accessibility(report)
            self._evaluate_visual_accessibility(report)
            
            # Calculate overall accessibility score
            report['accessibility_score'] = self._calculate_accessibility_score(report)
            report['compliance_level'] = self._determine_compliance_level(report['accessibility_score'])
            
            # Generate remediation recommendations
            self._generate_remediation_steps(report)
            
        except Exception as e:
            return self._create_error_report(pdf_path, f"Analysis error: {str(e)}")
        
        return report
    
    def _analyze_basic_structure(self, pdf_path):
        """Analyzes basic PDF structure and properties."""
        analysis = {
            'file_readable': True,
            'has_text_content': False,
            'estimated_pages': 0,
            'file_format': 'PDF',
            'creation_method': 'Unknown'
        }
        
        try:
            # Basic file reading test
            with open(pdf_path, 'rb') as file:
                header = file.read(1024).decode('latin-1', errors='ignore')
                analysis['has_pdf_header'] = header.startswith('%PDF')
                
                # Look for creation information
                if 'ReportLab' in header:
                    analysis['creation_method'] = 'ReportLab'
                elif 'Producer' in header:
                    analysis['creation_method'] = 'Generated'
                
        except Exception as e:
            analysis['file_readable'] = False
            analysis['error'] = str(e)
        
        return analysis
    
    def _analyze_advanced_features(self, pdf_path):
        """Performs advanced PDF analysis using specialized libraries."""
        analysis = {
            'has_metadata': False,
            'has_bookmarks': False,
            'has_tagged_structure': False,
            'text_extractable': False,
            'has_embedded_fonts': False,
            'page_count': 0,
            'text_content_sample': '',
            'metadata': {}
        }
        
        try:
            # PyPDF2 analysis
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                analysis['page_count'] = len(pdf_reader.pages)
                
                # Check metadata
                if pdf_reader.metadata:
                    analysis['has_metadata'] = True
                    analysis['metadata'] = {
                        'title': pdf_reader.metadata.get('/Title', ''),
                        'author': pdf_reader.metadata.get('/Author', ''),
                        'subject': pdf_reader.metadata.get('/Subject', ''),
                        'creator': pdf_reader.metadata.get('/Creator', ''),
                        'producer': pdf_reader.metadata.get('/Producer', '')
                    }
                
                # Check for bookmarks/outlines
                analysis['has_bookmarks'] = len(pdf_reader.outline) > 0
                
                # Try to extract text from first page
                if len(pdf_reader.pages) > 0:
                    first_page_text = pdf_reader.pages[0].extract_text()
                    analysis['text_extractable'] = len(first_page_text.strip()) > 0
                    analysis['text_content_sample'] = first_page_text[:200]
            
            # pdfplumber analysis for more detailed text extraction
            with pdfplumber.open(pdf_path) as pdf:
                if len(pdf.pages) > 0:
                    first_page = pdf.pages[0]
                    if first_page.extract_text():
                        analysis['text_extractable'] = True
                        analysis['has_selectable_text'] = True
                    
                    # Check for images (potential accessibility concern if no alt text)
                    analysis['has_images'] = len(first_page.images) > 0
                    analysis['image_count'] = len(first_page.images)
        
        except Exception as e:
            analysis['error'] = str(e)
        
        return analysis
    
    def _evaluate_structure_accessibility(self, report):
        """Evaluates structural accessibility requirements."""
        issues = []
        recommendations = []
        
        # Check for logical reading order
        if not report['detailed_analysis'].get('basic_structure', {}).get('has_pdf_header', False):
            issues.append({
                'severity': 'critical',
                'category': 'structure',
                'issue': 'Invalid PDF format',
                'description': 'File does not appear to be a valid PDF',
                'wcag_reference': '4.1.2 Name, Role, Value'
            })
        
        # Check for tagged structure (PDF/UA requirement)
        if ADVANCED_ANALYSIS:
            advanced = report['detailed_analysis'].get('advanced_features', {})
            if not advanced.get('has_tagged_structure', False):
                issues.append({
                    'severity': 'critical',
                    'category': 'structure',
                    'issue': 'Missing tagged structure',
                    'description': 'PDF lacks proper tagging for screen readers',
                    'wcag_reference': '4.1.2 Name, Role, Value'
                })
                recommendations.append({
                    'category': 'structure',
                    'action': 'Add semantic tags to PDF content',
                    'priority': 'high',
                    'description': 'Use proper heading tags, paragraph tags, and list structures'
                })
        
        # Check for document metadata
        if ADVANCED_ANALYSIS:
            metadata = report['detailed_analysis'].get('advanced_features', {}).get('metadata', {})
            if not metadata.get('title'):
                issues.append({
                    'severity': 'warning',
                    'category': 'structure',
                    'issue': 'Missing document title',
                    'description': 'PDF metadata lacks a title, affecting screen reader navigation',
                    'wcag_reference': '2.4.2 Page Titled'
                })
        
        report['critical_issues'].extend([i for i in issues if i['severity'] == 'critical'])
        report['warnings'].extend([i for i in issues if i['severity'] == 'warning'])
        report['recommendations'].extend(recommendations)
    
    def _evaluate_content_accessibility(self, report):
        """Evaluates content accessibility requirements."""
        issues = []
        recommendations = []
        
        # Check text extractability
        if ADVANCED_ANALYSIS:
            advanced = report['detailed_analysis'].get('advanced_features', {})
            if not advanced.get('text_extractable', False):
                issues.append({
                    'severity': 'critical',
                    'category': 'content',
                    'issue': 'Text not extractable',
                    'description': 'Screen readers cannot access text content',
                    'wcag_reference': '1.3.1 Info and Relationships'
                })
                recommendations.append({
                    'category': 'content',
                    'action': 'Ensure text is selectable and extractable',
                    'priority': 'critical',
                    'description': 'Use actual text rather than text embedded in images'
                })
            
            # Check for images without alternative text
            if advanced.get('has_images', False):
                issues.append({
                    'severity': 'warning',
                    'category': 'content',
                    'issue': 'Images may lack alternative text',
                    'description': 'Images found - verify all have appropriate alt text',
                    'wcag_reference': '1.1.1 Non-text Content'
                })
                recommendations.append({
                    'category': 'content',
                    'action': 'Add alternative text to all images',
                    'priority': 'high',
                    'description': 'Provide meaningful descriptions for images and graphics'
                })
        
        report['critical_issues'].extend([i for i in issues if i['severity'] == 'critical'])
        report['warnings'].extend([i for i in issues if i['severity'] == 'warning'])
        report['recommendations'].extend(recommendations)
    
    def _evaluate_navigation_accessibility(self, report):
        """Evaluates navigation accessibility requirements."""
        recommendations = []
        
        if ADVANCED_ANALYSIS:
            advanced = report['detailed_analysis'].get('advanced_features', {})
            
            # Check for bookmarks/navigation aids
            if not advanced.get('has_bookmarks', False) and advanced.get('page_count', 0) > 3:
                report['warnings'].append({
                    'severity': 'warning',
                    'category': 'navigation',
                    'issue': 'Missing navigation bookmarks',
                    'description': 'Multi-page document lacks bookmarks for easy navigation',
                    'wcag_reference': '2.4.5 Multiple Ways'
                })
                recommendations.append({
                    'category': 'navigation',
                    'action': 'Add document bookmarks',
                    'priority': 'medium',
                    'description': 'Create bookmarks for major sections and headings'
                })
        
        report['recommendations'].extend(recommendations)
    
    def _evaluate_visual_accessibility(self, report):
        """Evaluates visual accessibility requirements."""
        recommendations = [
            {
                'category': 'visual',
                'action': 'Verify color contrast ratios',
                'priority': 'high',
                'description': 'Ensure minimum 4.5:1 contrast ratio for normal text, 3:1 for large text'
            },
            {
                'category': 'visual',
                'action': 'Check font readability',
                'priority': 'medium',
                'description': 'Use clear, readable fonts and appropriate font sizes'
            },
            {
                'category': 'visual',
                'action': 'Ensure scalability',
                'priority': 'medium',
                'description': 'Text should remain readable when zoomed to 200%'
            }
        ]
        
        report['recommendations'].extend(recommendations)
    
    def _calculate_accessibility_score(self, report):
        """Calculates overall accessibility score (0-100)."""
        score = 100
        
        # Deduct points for critical issues
        critical_count = len(report['critical_issues'])
        score -= critical_count * 25  # 25 points per critical issue
        
        # Deduct points for warnings
        warning_count = len(report['warnings'])
        score -= warning_count * 10   # 10 points per warning
        
        # Ensure score doesn't go below 0
        return max(0, score)
    
    def _determine_compliance_level(self, score):
        """Determines compliance level based on accessibility score."""
        if score >= 90:
            return 'Fully Compliant (WCAG 2.1 AA)'
        elif score >= 70:
            return 'Mostly Compliant (Minor Issues)'
        elif score >= 50:
            return 'Partially Compliant (Needs Improvement)'
        else:
            return 'Non-Compliant (Major Issues)'
    
    def _generate_remediation_steps(self, report):
        """Generates specific remediation steps based on found issues."""
        steps = []
        
        # Address critical issues first
        for issue in report['critical_issues']:
            if issue['category'] == 'structure':
                steps.append({
                    'priority': 1,
                    'action': 'Fix structural issues',
                    'details': f"Address: {issue['description']}",
                    'tools': ['Adobe Acrobat Pro', 'PDF accessibility tools'],
                    'estimated_effort': 'High'
                })
            elif issue['category'] == 'content':
                steps.append({
                    'priority': 1,
                    'action': 'Fix content accessibility',
                    'details': f"Address: {issue['description']}",
                    'tools': ['Source document editing', 'PDF remediation tools'],
                    'estimated_effort': 'Medium'
                })
        
        # Add general improvement steps
        if report['accessibility_score'] < 90:
            steps.append({
                'priority': 2,
                'action': 'Comprehensive accessibility review',
                'details': 'Conduct full accessibility audit with screen reader testing',
                'tools': ['NVDA', 'JAWS', 'VoiceOver', 'Adobe Acrobat Pro'],
                'estimated_effort': 'High'
            })
        
        report['remediation_steps'] = steps
    
    def _create_error_report(self, pdf_path, error_message):
        """Creates an error report when evaluation fails."""
        return {
            'file_info': {
                'path': pdf_path,
                'filename': os.path.basename(pdf_path),
                'evaluation_date': datetime.now().isoformat(),
                'error': error_message
            },
            'accessibility_score': 0,
            'compliance_level': 'Cannot Evaluate',
            'critical_issues': [{
                'severity': 'critical',
                'category': 'system',
                'issue': 'Evaluation failed',
                'description': error_message
            }],
            'warnings': [],
            'recommendations': [],
            'detailed_analysis': {},
            'remediation_steps': []
        }
    
    def generate_accessibility_report(self, pdf_path, output_path=None):
        """
        Generates a comprehensive accessibility report for a PDF file.
        
        Args:
            pdf_path (str): Path to PDF file to evaluate
            output_path (str): Optional path for report output
            
        Returns:
            str: Path to generated report file
        """
        evaluation = self.evaluate_pdf_accessibility(pdf_path)
        
        if not output_path:
            pdf_name = Path(pdf_path).stem
            output_path = f"accessibility_report_{pdf_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(evaluation, f, indent=2, ensure_ascii=False)
        
        print(f"Accessibility report generated: {output_path}")
        return output_path
    
    def generate_human_readable_report(self, evaluation, output_path=None):
        """
        Generates a human-readable accessibility report.
        
        Args:
            evaluation (dict): Evaluation results
            output_path (str): Optional path for report output
            
        Returns:
            str: Path to generated report file
        """
        if not output_path:
            filename = evaluation['file_info']['filename']
            pdf_name = Path(filename).stem
            output_path = f"accessibility_report_{pdf_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        
        report_content = self._format_human_readable_report(evaluation)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(report_content)
        
        print(f"Human-readable accessibility report generated: {output_path}")
        return output_path
    
    def _format_human_readable_report(self, evaluation):
        """Formats evaluation results into human-readable report."""
        content = []
        content.append("PDF ACCESSIBILITY EVALUATION REPORT")
        content.append("=" * 50)
        content.append("")
        
        # File information
        file_info = evaluation['file_info']
        content.append(f"File: {file_info['filename']}")
        content.append(f"Path: {file_info['path']}")
        content.append(f"Evaluation Date: {file_info['evaluation_date']}")
        content.append(f"File Size: {file_info.get('size_bytes', 'Unknown')} bytes")
        content.append("")
        
        # Overall assessment
        content.append("OVERALL ASSESSMENT")
        content.append("-" * 20)
        content.append(f"Accessibility Score: {evaluation['accessibility_score']}/100")
        content.append(f"Compliance Level: {evaluation['compliance_level']}")
        content.append("")
        
        # Critical issues
        if evaluation['critical_issues']:
            content.append("CRITICAL ISSUES (Must Fix)")
            content.append("-" * 30)
            for i, issue in enumerate(evaluation['critical_issues'], 1):
                content.append(f"{i}. {issue['issue']}")
                content.append(f"   Description: {issue['description']}")
                content.append(f"   WCAG Reference: {issue.get('wcag_reference', 'N/A')}")
                content.append("")
        
        # Warnings
        if evaluation['warnings']:
            content.append("WARNINGS (Should Fix)")
            content.append("-" * 25)
            for i, warning in enumerate(evaluation['warnings'], 1):
                if isinstance(warning, dict):
                    content.append(f"{i}. {warning.get('issue', 'Unknown issue')}")
                    content.append(f"   Description: {warning.get('description', 'No description')}")
                else:
                    # Handle string warnings
                    content.append(f"{i}. {warning}")
                content.append("")
        
        # Recommendations
        if evaluation['recommendations']:
            content.append("RECOMMENDATIONS")
            content.append("-" * 15)
            for i, rec in enumerate(evaluation['recommendations'], 1):
                content.append(f"{i}. {rec['action']}")
                content.append(f"   Priority: {rec['priority']}")
                content.append(f"   Description: {rec['description']}")
                content.append("")
        
        # Remediation steps
        if evaluation['remediation_steps']:
            content.append("REMEDIATION STEPS")
            content.append("-" * 17)
            for i, step in enumerate(evaluation['remediation_steps'], 1):
                content.append(f"Step {i}: {step['action']}")
                content.append(f"   Priority: {step['priority']}")
                content.append(f"   Details: {step['details']}")
                content.append(f"   Estimated Effort: {step['estimated_effort']}")
                content.append("")
        
        content.append("Report generated by PDF Accessibility Checker v1.0")
        content.append("For questions or support, contact the development team.")
        
        return "\n".join(content)


def batch_evaluate_accessibility(pdf_directory, output_directory="accessibility_reports"):
    """
    Evaluates accessibility for all PDFs in a directory.
    
    Args:
        pdf_directory (str): Directory containing PDF files
        output_directory (str): Directory for accessibility reports
        
    Returns:
        dict: Summary of evaluations performed
    """
    checker = PDFAccessibilityChecker()
    
    # Create output directory
    os.makedirs(output_directory, exist_ok=True)
    
    summary = {
        'total_files': 0,
        'evaluated_files': 0,
        'failed_evaluations': 0,
        'compliance_summary': {
            'fully_compliant': 0,
            'mostly_compliant': 0,
            'partially_compliant': 0,
            'non_compliant': 0
        },
        'average_score': 0,
        'reports_generated': []
    }
    
    # Find all PDF files
    pdf_files = []
    for root, dirs, files in os.walk(pdf_directory):
        for file in files:
            if file.lower().endswith('.pdf'):
                pdf_files.append(os.path.join(root, file))
    
    summary['total_files'] = len(pdf_files)
    
    scores = []
    
    for pdf_path in pdf_files:
        try:
            print(f"Evaluating: {os.path.basename(pdf_path)}")
            
            # Perform evaluation
            evaluation = checker.evaluate_pdf_accessibility(pdf_path)
            
            # Generate reports
            pdf_name = Path(pdf_path).stem
            json_report = os.path.join(output_directory, f"{pdf_name}_accessibility.json")
            txt_report = os.path.join(output_directory, f"{pdf_name}_accessibility.txt")
            
            # Save JSON report
            with open(json_report, 'w', encoding='utf-8') as f:
                json.dump(evaluation, f, indent=2, ensure_ascii=False)
            
            # Save human-readable report
            checker.generate_human_readable_report(evaluation, txt_report)
            
            summary['reports_generated'].extend([json_report, txt_report])
            summary['evaluated_files'] += 1
            
            # Update compliance summary
            compliance = evaluation['compliance_level']
            if 'Fully Compliant' in compliance:
                summary['compliance_summary']['fully_compliant'] += 1
            elif 'Mostly Compliant' in compliance:
                summary['compliance_summary']['mostly_compliant'] += 1
            elif 'Partially Compliant' in compliance:
                summary['compliance_summary']['partially_compliant'] += 1
            else:
                summary['compliance_summary']['non_compliant'] += 1
            
            scores.append(evaluation['accessibility_score'])
            
        except Exception as e:
            print(f"Failed to evaluate {pdf_path}: {e}")
            summary['failed_evaluations'] += 1
    
    # Calculate average score
    if scores:
        summary['average_score'] = sum(scores) / len(scores)
    
    # Generate summary report
    summary_path = os.path.join(output_directory, "accessibility_summary.json")
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    
    print("\nAccessibility evaluation complete!")
    print(f"Evaluated {summary['evaluated_files']}/{summary['total_files']} files")
    print(f"Average accessibility score: {summary['average_score']:.1f}/100")
    print(f"Reports saved to: {output_directory}")
    
    return summary


# Example usage and testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "batch":
            # Batch evaluation
            pdf_dir = sys.argv[2] if len(sys.argv) > 2 else "processed_pdf_library"
            summary = batch_evaluate_accessibility(pdf_dir)
        else:
            # Single file evaluation
            pdf_path = sys.argv[1]
            checker = PDFAccessibilityChecker()
            evaluation = checker.evaluate_pdf_accessibility(pdf_path)
            
            # Generate reports
            checker.generate_accessibility_report(pdf_path)
            checker.generate_human_readable_report(evaluation)
            
            print(f"\nAccessibility Score: {evaluation['accessibility_score']}/100")
            print(f"Compliance Level: {evaluation['compliance_level']}")
    else:
        print("Usage:")
        print("  python pdf_accessibility_checker.py <pdf_file>     # Evaluate single PDF")
        print("  python pdf_accessibility_checker.py batch [dir]    # Evaluate all PDFs in directory")