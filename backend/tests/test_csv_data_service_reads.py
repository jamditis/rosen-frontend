# -*- coding: utf-8 -*-
"""
Characterization tests for the live CSVDataService readers (#501).

The four readers that run against production CSVs each repeat the same
open-and-parse sequence. #501 folds that into one helper, and #501 was deferred
from #492 precisely because these paths had no coverage to fold against. These
tests pin what the readers return today so the fold can be shown not to change
it.
"""

import csv

from rosen_scraper import csv_data_service
from rosen_scraper.csv_data_service import CSVDataService


def _write(path, rows, encoding='utf-8-sig'):
    """
    Write a CSV fixture.

    Defaults to utf-8-sig because that is what the real inputs are: a Google
    Sheets or Excel export writes a BOM, and that is the case the readers'
    encoding exists to handle.
    """
    with open(path, 'w', newline='', encoding=encoding) as f:
        csv.writer(f).writerows(rows)


def _service(tmp_path):
    return CSVDataService(csv_dir=tmp_path)


URL_HEADER = ['id', 'url', 'processed_on', 'notes']


# --- get_urls_to_process ----------------------------------------------------


def test_bom_does_not_leak_into_the_first_column_name(tmp_path):
    # Read as plain utf-8, the first header arrives as '\ufeffid', so
    # row.get('id') misses and the fallback id 'URL0' is returned instead of
    # 'U1'. The encoding is load-bearing, not incidental.
    service = _service(tmp_path)
    _write(service.urls_file, [URL_HEADER, ['U1', 'https://example.com/a', '', 'note']])

    assert service.get_urls_to_process() == [
        {'id': 'U1', 'url': 'https://example.com/a', 'processed_on': '', 'notes': 'note'}
    ]


def test_a_file_written_without_a_bom_reads_the_same(tmp_path):
    # utf-8-sig decodes BOM-less input too, so the readers accept a hand-made
    # or git-committed CSV as readily as a spreadsheet export. Every other
    # fixture here carries a BOM, so without this one nothing says whether the
    # BOM is required or merely tolerated.
    service = _service(tmp_path)
    _write(service.urls_file,
           [URL_HEADER, ['U1', 'https://example.com/a', '', 'note']],
           encoding='utf-8')

    assert service.get_urls_to_process() == [
        {'id': 'U1', 'url': 'https://example.com/a', 'processed_on': '', 'notes': 'note'}
    ]


def test_missing_urls_file_returns_empty_and_warns(tmp_path, capsys):
    # The warning is part of the observable behaviour: this runs unattended, so
    # a silently empty worklist and an absent file must not look alike in logs.
    service = _service(tmp_path)

    assert service.get_urls_to_process() == []
    assert 'WARNING' in capsys.readouterr().out


def test_processed_rows_are_skipped_by_default_and_kept_when_asked(tmp_path):
    service = _service(tmp_path)
    _write(service.urls_file, [
        URL_HEADER,
        ['U1', 'https://example.com/a', '2026-01-01', ''],
        ['U2', 'https://example.com/b', '', ''],
    ])

    assert [u['id'] for u in service.get_urls_to_process()] == ['U2']
    assert [u['id'] for u in service.get_urls_to_process(skip_processed=False)] == ['U1', 'U2']


def test_row_bounds_index_the_file_not_the_filtered_result(tmp_path):
    # start_row/end_row are applied to the enumerate index over every data row,
    # before the processed-row filter. So a bound of 0..2 spans U1 and U2 and
    # then returns only U2, rather than spanning the first two *unprocessed*
    # rows. Easy to "fix" into the other meaning during a refactor.
    service = _service(tmp_path)
    _write(service.urls_file, [
        URL_HEADER,
        ['U1', 'https://example.com/a', '2026-01-01', ''],
        ['U2', 'https://example.com/b', '', ''],
        ['U3', 'https://example.com/c', '', ''],
    ])

    assert [u['id'] for u in service.get_urls_to_process(end_row=2)] == ['U2']
    assert [u['id'] for u in service.get_urls_to_process(start_row=2)] == ['U3']


def test_rows_without_a_url_are_dropped_and_urls_are_stripped(tmp_path):
    service = _service(tmp_path)
    _write(service.urls_file, [
        URL_HEADER,
        ['U1', '', '', ''],
        ['U2', '  https://example.com/b  ', '', ''],
    ])

    assert service.get_urls_to_process() == [
        {'id': 'U2', 'url': 'https://example.com/b', 'processed_on': '', 'notes': ''}
    ]


def test_capitalized_notes_column_wins_over_lowercase(tmp_path):
    # Different exports spell this column differently, so both are read. This
    # pins which one wins when a file carries both. Same idiom as the id/ID and
    # url/URL fallbacks below, and all three are pinned for the same reason.
    service = _service(tmp_path)
    _write(service.urls_file, [
        ['id', 'url', 'processed_on', 'Notes', 'notes'],
        ['U1', 'https://example.com/a', '', 'from-capital', 'from-lower'],
    ])

    assert service.get_urls_to_process()[0]['notes'] == 'from-capital'


def test_reading_stops_at_end_row_instead_of_parsing_the_whole_file(tmp_path, monkeypatch):
    # The loop breaks at end_row, so bounded reads do not pay for the whole
    # worklist. Folding four readers into one helper is exactly where a
    # streaming read becomes a materialized list by accident, and nothing else
    # in this file would notice that.
    service = _service(tmp_path)
    _write(service.urls_file, [URL_HEADER] + [
        [f'U{i}', f'https://example.com/{i}', '', ''] for i in range(20)
    ])

    consumed = []

    # Counts parsed rows, so it is coupled to DictReader being the parse call.
    # A future reader built on csv.reader would fail this while still
    # streaming: that is a signal to re-point the test, not a behaviour change.
    class _CountingDictReader(csv.DictReader):
        def __next__(self):
            row = super().__next__()
            consumed.append(row)
            return row

    monkeypatch.setattr(csv, 'DictReader', _CountingDictReader)
    service.get_urls_to_process(end_row=3)

    # Three rows kept, plus the one whose index trips the break.
    assert len(consumed) == 4


def test_a_bounded_read_leaves_no_open_handle_behind(tmp_path, monkeypatch):
    # _read_dicts holds the file open across its yields, so a caller that stops
    # early leaves the generator suspended inside its `with`. This pins that no
    # handle survives the call. It does not pin the contextlib.closing wrapper:
    # removing that still passes, since CPython finalizes the generator at
    # function exit anyway. What it catches is a reader that never closes.
    service = _service(tmp_path)
    _write(service.urls_file, [URL_HEADER] + [
        [f'U{i}', f'https://example.com/{i}', '', ''] for i in range(20)
    ])

    opened = []
    real_open = open

    def _tracking_open(*args, **kwargs):
        handle = real_open(*args, **kwargs)
        opened.append(handle)
        return handle

    monkeypatch.setattr(csv_data_service, 'open', _tracking_open, raising=False)
    service.get_urls_to_process(end_row=3)

    assert opened, 'expected the reader to open the urls file'
    assert all(handle.closed for handle in opened)


# --- get_existing_record_ids and get_existing_urls --------------------------


def _write_records_and_social(service, records, social):
    _write(service.records_file, records)
    _write(service.social_file, social)


def test_record_ids_union_both_files_and_accept_either_id_spelling(tmp_path):
    service = _service(tmp_path)
    _write_records_and_social(
        service,
        records=[['id', 'url'], ['R1', 'https://example.com/1']],
        social=[['ID', 'URL'], ['S1', 'https://example.com/2']],
    )

    assert service.get_existing_record_ids() == {'R1', 'S1'}


def test_lowercase_id_and_url_columns_win_over_capitalized(tmp_path):
    # The precedence half of the test above, which only proves either spelling
    # is accepted because each of its fixtures carries one. Both readers use
    # the same row.get(x, row.get(X, '')) idiom as the Notes column, so both
    # are pinned the same way: lowercase first.
    service = _service(tmp_path)
    _write_records_and_social(
        service,
        records=[['id', 'ID', 'url', 'URL'],
                 ['from-lower', 'from-upper', 'https://example.com/lower', 'https://example.com/upper']],
        social=[['id', 'url']],
    )

    assert service.get_existing_record_ids() == {'from-lower'}
    assert service.get_existing_urls() == {'https://example.com/lower'}


def test_blank_record_ids_are_not_collected(tmp_path):
    # An empty id would otherwise enter the set and make every later
    # "have I seen this?" check against '' answer yes.
    service = _service(tmp_path)
    _write_records_and_social(
        service,
        records=[['id', 'url'], ['', 'https://example.com/1'], ['R2', 'https://example.com/2']],
        social=[['id', 'url']],
    )

    assert service.get_existing_record_ids() == {'R2'}


def test_existing_urls_union_both_files_and_strip_whitespace(tmp_path):
    service = _service(tmp_path)
    _write_records_and_social(
        service,
        records=[['id', 'url'], ['R1', '  https://example.com/1  ']],
        social=[['id', 'URL'], ['S1', 'https://example.com/2']],
    )

    assert service.get_existing_urls() == {
        'https://example.com/1',
        'https://example.com/2',
    }


def test_absent_records_and_social_files_yield_empty_sets(tmp_path):
    # Both readers guard each file separately, so a half-populated csv dir is
    # a normal state rather than an error.
    service = _service(tmp_path)

    assert service.get_existing_record_ids() == set()
    assert service.get_existing_urls() == set()


def test_one_present_file_is_read_when_the_other_is_absent(tmp_path):
    service = _service(tmp_path)
    _write(service.records_file, [['id', 'url'], ['R1', 'https://example.com/1']])

    assert service.get_existing_record_ids() == {'R1'}
    assert service.get_existing_urls() == {'https://example.com/1'}


# --- read_social_posts ------------------------------------------------------


def test_social_posts_are_returned_in_file_order_as_dicts(tmp_path):
    service = _service(tmp_path)
    _write(service.social_file, [
        ['id', 'url', 'text'],
        ['S1', 'https://example.com/1', 'first'],
        ['S2', 'https://example.com/2', 'second'],
    ])

    assert service.read_social_posts() == [
        {'id': 'S1', 'url': 'https://example.com/1', 'text': 'first'},
        {'id': 'S2', 'url': 'https://example.com/2', 'text': 'second'},
    ]


def test_missing_social_file_returns_empty_list(tmp_path):
    assert _service(tmp_path).read_social_posts() == []


# --- get_headers ------------------------------------------------------------


def test_headers_come_back_without_the_bom(tmp_path):
    # get_headers uses csv.reader rather than DictReader, so it is not part of
    # the #501 fold, but it shares the BOM-stripping encoding and would break
    # the same way if that were dropped.
    service = _service(tmp_path)
    _write(service.records_file, [['id', 'url', 'title'], ['R1', 'https://example.com/1', 't']])

    assert service.get_headers() == ['id', 'url', 'title']


def test_missing_records_file_yields_no_headers(tmp_path):
    assert _service(tmp_path).get_headers() == []
