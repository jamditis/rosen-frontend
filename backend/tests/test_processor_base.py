# -*- coding: utf-8 -*-
"""
Tests for the shared processor base (#490).

These pin the extracted helpers to the exact behaviour of the inline code they
replaced across the processors, so the consolidation cannot silently change a
date format, a truncation boundary, or a merge policy.
"""

from rosen_scraper.processors import base


class TestUsDateFromIso:
    """us_date_from_iso: yyyy-mm-dd -> mm/dd/yyyy, anchored or searching."""

    def test_anchored_parses_iso_timestamp_prefix(self):
        # tumblr <time datetime="2014-08-20T21:24:05Z"> (re.match)
        assert base.us_date_from_iso('2014-08-20T21:24:05Z') == '08/20/2014'

    def test_anchored_parses_bare_iso_date(self):
        assert base.us_date_from_iso('1998-03-15') == '03/15/1998'

    def test_anchored_rejects_date_not_at_start(self):
        # re.match is anchored, so a leading prefix means no match
        assert base.us_date_from_iso('post-2014-08-20') is None

    def test_unanchored_finds_date_in_filename(self):
        # tumblr/clipping filename fallback (re.search)
        assert base.us_date_from_iso('jrosen-2014-08-20-post.html', anchored=False) == '08/20/2014'

    def test_unanchored_finds_date_in_free_text(self):
        assert base.us_date_from_iso('Published 1998-03-15 in print', anchored=False) == '03/15/1998'

    def test_returns_none_when_no_date(self):
        assert base.us_date_from_iso('no date here') is None
        assert base.us_date_from_iso('no date here', anchored=False) is None

    def test_coerces_non_string(self):
        # tumblr _parse_date passes str(date_str); the helper does the coercion
        assert base.us_date_from_iso(12345) is None


class TestIsoToYmd:
    """iso_to_ymd: ISO timestamp -> yyyy-mm-dd, with bluesky's fallback."""

    def test_parses_z_suffixed_timestamp(self):
        assert base.iso_to_ymd('2023-05-01T12:00:00Z') == '2023-05-01'

    def test_parses_offset_timestamp(self):
        assert base.iso_to_ymd('2023-05-01T12:00:00+00:00') == '2023-05-01'

    def test_unparseable_but_long_enough_falls_back_to_slice(self):
        assert base.iso_to_ymd('2023/05/01 noon') == '2023/05/01'

    def test_too_short_to_hold_a_date_returns_none(self):
        assert base.iso_to_ymd('2023') is None


class TestTruncateOnWordBoundary:
    def test_short_text_unchanged(self):
        assert base.truncate_on_word_boundary('hello world', 50) == 'hello world'

    def test_long_text_trimmed_on_word_boundary(self):
        assert base.truncate_on_word_boundary('the quick brown fox', 10) == 'the quick...'

    def test_exact_length_unchanged(self):
        assert base.truncate_on_word_boundary('0123456789', 10) == '0123456789'


class TestCleanHtml:
    def test_strips_tags_drops_script_and_unescapes(self):
        out = base.clean_html('<p>Hello &amp; goodbye</p><script>alert(1)</script>')
        assert out == 'Hello & goodbye'

    def test_collapses_blank_lines(self):
        out = base.clean_html('<p>first</p><p></p><p>second</p>')
        assert out == 'first\nsecond'

    def test_empty_input_returns_empty(self):
        assert base.clean_html('') == ''


class TestMergeAiFields:
    def test_clobber_overwrites_existing(self):
        record = {'a': 1}
        out = base.merge_ai_fields(record, {'a': 2, 'b': 3}, clobber=True)
        assert out == {'a': 2, 'b': 3}
        assert out is record  # mutates in place

    def test_non_clobber_fills_only_blanks(self):
        record = {'a': 1, 'c': ''}
        out = base.merge_ai_fields(record, {'a': 2, 'b': 3, 'c': 9}, clobber=False)
        # a kept (truthy), b added, c filled (was blank)
        assert out == {'a': 1, 'b': 3, 'c': 9}

    def test_falsy_ai_data_is_a_noop(self):
        record = {'a': 1}
        assert base.merge_ai_fields(record, None, clobber=True) == {'a': 1}
        assert base.merge_ai_fields(record, {}, clobber=False) == {'a': 1}


class TestProcessorProtocol:
    def test_class_with_process_satisfies_protocol(self):
        class Good:
            def process(self, url):
                return {'status': 'success'}

        assert isinstance(Good(), base.Processor)

    def test_class_without_process_does_not(self):
        class Bad:
            pass

        assert not isinstance(Bad(), base.Processor)
