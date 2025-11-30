export const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-XqQXvMJNaBXVWlmXu1EyOpa_Cc6ur-pklWX1mbrWIFybZjmbE6UTIteSoCSvf0a7j5r8A6earp3H/pub?gid=928818664&single=true&output=csv';

export const LOCAL_DATASET = './RosenArchivedataset-TEST-DATA.csv';

export const DISPLAY_FIELDS = [
  'id',
  'title',
  'author',
  'publication_date',
  'original_publication',
  'publisher',
  'platform',
  'content_type',
  'format',
  'collection_id',
  'series',
  'scope',
  'summary',
  'excerpt',
  'pull_quote',
  'url',
  'tags',
  'thematic_categories',
  'key_concepts',
  'responds_to',
  'related_to',
  'influence',
  'era',
  'word_count',
  'length_in_seconds',
  'verified',
  'date_processed',
  'notes',
  'gdrive_pdf_link',
  'gdrive_raw_file_link',
  'gdrive_transcript_link',
  'transcript_filepath'
];

export const ARRAY_FIELDS = ['tags', 'thematic_categories', 'key_concepts', 'responds_to', 'related_to', 'influence'];

export const INTEGER_FIELDS = ['word_count'];

export const FLOAT_FIELDS = ['length_in_seconds'];

export const BOOLEAN_FIELDS = ['verified'];

export const DATE_FIELDS = ['publication_date', 'date_processed'];

export const PAGE_SIZE = 12;

export const FILTER_META = {
  format: {
    label: 'Format',
    field: 'format'
  },
  thematic_categories: {
    label: 'Thematic categories',
    field: 'thematic_categories'
  },
  key_concepts: {
    label: 'Key concepts',
    field: 'key_concepts'
  },
  era: {
    label: 'Era',
    field: 'era'
  },
  original_publication: {
    label: 'Original publication',
    field: 'original_publication'
  }
};
