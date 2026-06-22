# -*- coding: utf-8 -*-
"""
Integration characterization tests for the processor methods rewired onto the
shared base (#490). The base helpers are unit-tested in test_processor_base.py;
these confirm each call site delegates with the right arguments, so a wrong
flag (anchored, clobber) or a dropped step (clipping's headline skip and strip)
would fail here.
"""

from rosen_scraper.processors.tumblr_processor import TumblrProcessor
from rosen_scraper.processors.clipping_processor import ClippingProcessor


def _tumblr():
    # export_dir is unused by the text-helper methods exercised here
    return TumblrProcessor(export_dir='.')


class TestTumblrTextHelpers:
    def test_clean_html_drops_script_and_unescapes(self):
        assert _tumblr()._clean_html('<p>A &amp; B</p><script>x()</script>') == 'A & B'

    def test_generate_excerpt_takes_first_paragraph_without_stripping_headline(self):
        # tumblr does NOT skip a headline line (clipping does)
        assert _tumblr()._generate_excerpt('HEADLINE\n\nbody text here', 300) == 'HEADLINE'

    def test_truncate_cleans_html_then_trims_on_word_boundary(self):
        assert _tumblr()._truncate('<p>hello world foo bar</p>', 10) == 'hello...'

    def test_parse_date_reformats_iso_timestamp(self):
        assert _tumblr()._parse_date('2014-08-20T21:24:05Z') == '08/20/2014'

    def test_parse_date_empty_is_empty(self):
        assert _tumblr()._parse_date('') == ''


class TestClippingTextHelpers:
    def test_generate_excerpt_skips_headline_and_strips(self):
        # Same input as the tumblr case above, but clipping skips the first line
        # and strips the result -> a different, intentional output.
        assert ClippingProcessor()._generate_excerpt('HEADLINE\n\nbody text here', 300) == 'body text here'

    def test_extract_date_iso_pattern(self):
        assert ClippingProcessor()._extract_date('1998-03-15') == '03/15/1998'
