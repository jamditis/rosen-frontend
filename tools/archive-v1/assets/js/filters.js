import { FILTER_META } from './config.js';

const formatOption = (value) => value || 'Unknown';

const buildChip = (label, value, active) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip chip--filter';
  button.dataset.value = value;
  button.dataset.active = String(active);
  button.textContent = label;
  return button;
};

export function buildFilterOptions(records) {
  const options = {
    format: new Set(),
    thematic_categories: new Set(),
    key_concepts: new Set(),
    era: new Set(),
    original_publication: new Set()
  };

  records.forEach((record) => {
    options.format.add(record.format || 'Article');
    record.thematic_categories.forEach((cat) => options.thematic_categories.add(cat));
    record.key_concepts.forEach((concept) => options.key_concepts.add(concept));
    if (record.era) options.era.add(record.era);
    if (record.original_publication) options.original_publication.add(record.original_publication);
  });

  return options;
}

export function renderFilterControls(options, selectedFilters) {
  const formatHost = document.getElementById('formatFilter');
  const categoryHost = document.getElementById('categoryFilter');
  const conceptHost = document.getElementById('conceptFilter');
  const eraSelect = document.getElementById('eraSelect');
  const publicationSelect = document.getElementById('publicationSelect');

  const renderChips = (host, set, key) => {
    host.innerHTML = '';
    [...set]
      .sort((a, b) => a.localeCompare(b))
      .forEach((value) => {
        const chip = buildChip(formatOption(value), value, selectedFilters[key]?.has(value));
        chip.dataset.filterKey = key;
        host.appendChild(chip);
      });
  };

  renderChips(formatHost, options.format, 'format');
  renderChips(categoryHost, options.thematic_categories, 'thematic_categories');
  renderChips(conceptHost, options.key_concepts, 'key_concepts');

  const renderSelect = (select, set, key) => {
    const current = selectedFilters[key] ?? '';
    const sorted = [...set].sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="">Any</option>${sorted.map((value) => `<option value="${value}">${value}</option>`).join('')}`;
    select.value = current;
  };

  renderSelect(eraSelect, options.era, 'era');
  renderSelect(publicationSelect, options.original_publication, 'original_publication');
}

export function applyFilters(records, filters, searchValue) {
  const query = searchValue.trim().toLowerCase();

  return records.filter((record) => {
    if (query && !record._searchBlob.includes(query)) return false;

    if (filters.format.size && !filters.format.has(formatOption(record.format))) return false;

    if (filters.thematic_categories.size) {
      const hasCategory = record.thematic_categories.some((cat) => filters.thematic_categories.has(cat));
      if (!hasCategory) return false;
    }

    if (filters.key_concepts.size) {
      const hasConcept = record.key_concepts.some((concept) => filters.key_concepts.has(concept));
      if (!hasConcept) return false;
    }

    if (filters.era && filters.era !== record.era) return false;
    if (filters.original_publication && filters.original_publication !== record.original_publication) return false;

    return true;
  });
}

export function describeActiveFilters(filters) {
  const labels = [];

  Object.entries(filters).forEach(([key, value]) => {
    if (!value || (value instanceof Set && value.size === 0)) return;

    const meta = FILTER_META[key];
    if (!meta) return;

    if (value instanceof Set) {
      labels.push(`${meta.label}: ${[...value].join(', ')}`);
    } else {
      labels.push(`${meta.label}: ${value}`);
    }
  });

  return labels;
}
