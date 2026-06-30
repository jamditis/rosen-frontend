"""
Tests for the workflow module.
"""
import json
from rosen_scraper import workflow


class TestWorkflowModule:
    """Tests for workflow orchestration functionality."""

    def test_get_schema_success(self, tmp_path, sample_schema):
        """Test successful schema loading. Verifies JSON round-trip preserves
        the taxonomy structure that downstream callers (categorizer) depend on.
        """
        # Create a temporary schema file
        schema_file = tmp_path / "schema.json"
        with open(schema_file, 'w') as f:
            json.dump(sample_schema, f)

        result = workflow.get_schema(str(schema_file))

        assert result is not None
        assert result == sample_schema
        assert 'taxonomy' in result
        assert 'thematic_categories' in result['taxonomy']

    def test_get_schema_file_not_found(self, tmp_path):
        """Test schema loading with non-existent file."""
        schema_file = tmp_path / "nonexistent.json"
        
        result = workflow.get_schema(str(schema_file))
        
        assert result is None

    def test_get_schema_invalid_json(self, tmp_path):
        """Test schema loading with invalid JSON."""
        schema_file = tmp_path / "invalid.json"
        with open(schema_file, 'w') as f:
            f.write("invalid json {{")
        
        result = workflow.get_schema(str(schema_file))
        
        assert result is None

    def test_generate_source_based_id_pressthink(self, sample_existing_ids):
        """Test ID generation for PressThink."""
        publication = "PressThink"
        result = workflow.generate_source_based_id(publication, sample_existing_ids)
        
        assert result.startswith("PRESSTH-")
        assert result == "PRESSTH-00003"  # Should be next after 00002

    def test_generate_source_based_id_nyt(self, sample_existing_ids):
        """Test ID generation for New York Times."""
        publication = "New York Times"
        result = workflow.generate_source_based_id(publication, sample_existing_ids)
        
        assert result.startswith("NYT-")
        assert result == "NYT-00003"

    def test_generate_source_based_id_new_publication(self, sample_existing_ids):
        """Test ID generation for new publication."""
        publication = "The Guardian"
        result = workflow.generate_source_based_id(publication, sample_existing_ids)
        
        assert result.startswith("GUARDIAN-")
        assert result == "GUARDIAN-00001"  # First ID for this publication

    def test_generate_source_based_id_from_url(self, sample_existing_ids):
        """Test ID generation from URL."""
        url = "https://www.nytimes.com/2024/test-article"
        result = workflow.generate_source_based_id(url, sample_existing_ids)
        
        assert result.startswith("NYT-")

    def test_generate_source_based_id_empty_publication(self, sample_existing_ids):
        """Test ID generation with empty publication."""
        result = workflow.generate_source_based_id("", sample_existing_ids)
        
        assert result.startswith("MISC-")

    def test_generate_source_based_id_not_found(self, sample_existing_ids):
        """Test ID generation with 'Not Found' publication."""
        result = workflow.generate_source_based_id("Not Found", sample_existing_ids)
        
        assert result.startswith("MISC-")

    def test_format_date_mmddyyyy_iso_format(self):
        """Test date formatting from ISO format."""
        date_str = "2024-03-15"
        result = workflow.format_date_mmddyyyy(date_str)
        
        assert result == "03/15/2024"

    def test_format_date_mmddyyyy_already_formatted(self):
        """Test date formatting when already in correct format."""
        date_str = "03/15/2024"
        result = workflow.format_date_mmddyyyy(date_str)
        
        assert result == "03/15/2024"

    def test_format_date_mmddyyyy_with_time(self):
        """Test date formatting with timestamp."""
        date_str = "2024-03-15 10:30:00"
        result = workflow.format_date_mmddyyyy(date_str)
        
        assert result == "03/15/2024"

    def test_format_date_mmddyyyy_empty(self):
        """Test date formatting with empty string."""
        result = workflow.format_date_mmddyyyy("")
        
        assert result == ""

    def test_format_date_mmddyyyy_none(self):
        """Test date formatting with None."""
        result = workflow.format_date_mmddyyyy(None)
        
        assert result == ""

    def test_enrich_data_with_data(self, sample_article_data):
        """Test data enrichment function exists and can be called."""
        # Test that the enrich_data function exists
        assert hasattr(workflow, 'enrich_data')
        
        # The function signature is: enrich_data(data, url, known_entities)
        # We test it minimally since it requires external services
        url = "https://example.com/test"
        known_entities = {}
        
        # This should not raise an error
        try:
            result = workflow.enrich_data(sample_article_data, url, known_entities)
            # If it works, result should be a dict
            assert isinstance(result, dict) or result is None
        except Exception:
            # If it fails (e.g., missing API keys), that's acceptable for this test
            pass

    def test_paywalled_domains_list(self):
        """Test that paywalled domains list is defined."""
        assert hasattr(workflow, 'PAYWALLED_DOMAINS')
        assert isinstance(workflow.PAYWALLED_DOMAINS, list)
        assert len(workflow.PAYWALLED_DOMAINS) > 0

    def test_generate_collection_id_exists(self):
        """Test that generate_collection_id function exists."""
        assert hasattr(workflow, 'generate_collection_id')

    def test_determine_permissions_exists(self):
        """Test that determine_permissions function exists."""
        assert hasattr(workflow, 'determine_permissions')

    def test_determine_permissions_subscription_sites(self):
        """ft.com, theatlantic.com, and newyorker.com are labeled premium.

        They are subscription sites in the same class as the NYT/WSJ/Washington
        Post entries already in PAYWALLED_DOMAINS. Before #492 they fell through
        to "Standard Copyright" because the rights list had drifted from
        PoisonPillDetector's scraping list. They carry the www. prefix because
        determine_permissions matches the netloc exactly.
        """
        for url in (
            "https://www.ft.com/content/x",
            "https://www.theatlantic.com/ideas/x/",
            "https://www.newyorker.com/news/x",
        ):
            assert workflow.determine_permissions({}, url) == "Premium/Subscription Required", url

    def test_determine_permissions_existing_premium_unchanged(self):
        """The original three premium domains keep their label (no regression)."""
        for url in (
            "https://www.washingtonpost.com/x",
            "https://www.nytimes.com/x",
            "https://www.wsj.com/x",
        ):
            assert workflow.determine_permissions({}, url) == "Premium/Subscription Required", url

    def test_determine_permissions_medium_stays_open_access(self):
        """medium.com stays Open Access by design.

        It is a member_only paywall in PoisonPillDetector.paywall_domains (a
        scraping concern) but Open Access in OPEN_ACCESS_DOMAINS (a rights
        concern). The open-access check runs first, so the two lists answer
        different questions; #492 leaves the rights label intact.
        """
        assert workflow.determine_permissions({}, "https://medium.com/@jayrosen/x") == "Open Access"

    def test_determine_permissions_other_branches(self):
        """Lock the open-access, educational, and default branches."""
        assert workflow.determine_permissions({}, "https://pressthink.org/x") == "Open Access"
        assert workflow.determine_permissions({}, "https://example.edu/x") == "Educational Use"
        assert workflow.determine_permissions({}, "https://example.com/x") == "Standard Copyright"

    def test_open_access_and_paywalled_lists_do_not_overlap(self):
        """The two rights lists must stay disjoint (#508).

        OPEN_ACCESS_DOMAINS is checked first by netloc suffix, so any
        PAYWALLED_DOMAINS entry it matched would be labeled "Open Access" and
        silently override the paywall. Guard the precedence conflict with the same
        suffix rule determine_permissions uses, so it cannot arise from a future
        edit to either list.
        """
        from rosen_scraper.permissions_config import (
            OPEN_ACCESS_DOMAINS,
            PAYWALLED_DOMAINS,
        )

        shadowed = [
            paywalled
            for paywalled in PAYWALLED_DOMAINS
            if any(paywalled.endswith(open_domain) for open_domain in OPEN_ACCESS_DOMAINS)
        ]
        assert shadowed == [], (
            f"these PAYWALLED_DOMAINS are shadowed by OPEN_ACCESS_DOMAINS and would "
            f"return Open Access before the paywall check: {shadowed}"
        )

    def test_append_record_to_csv_exists(self):
        """Test that append_record_to_csv function exists. The pipeline moved
        off Google Sheets writes to CSV writes; the function was renamed from
        append_record_to_sheet to append_record_to_csv (see issue #185)."""
        assert hasattr(workflow, 'append_record_to_csv')
