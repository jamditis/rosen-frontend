import { fetchArchiveData } from './data.js';
import { buildFilterOptions, renderFilterControls, applyFilters, describeActiveFilters } from './filters.js';
import { ui } from './ui.js';
import { PAGE_SIZE } from './config.js';

const state = {
  allRecords: [],
  filteredRecords: [],
  filterOptions: null,
  searchTerm: '',
  page: 1,
  layout: 'grid',
  filters: {
    format: new Set(),
    thematic_categories: new Set(),
    key_concepts: new Set(),
    era: '',
    original_publication: ''
  }
};

const pagination = {
  next: document.querySelector('[data-page="next"]'),
  prev: document.querySelector('[data-page="prev"]')
};

const overlay = document.getElementById('overlay');
const filterPanel = document.getElementById('filterPanel');
const applyFiltersBtn = document.getElementById('applyFilters');
const resetFiltersBtn = document.getElementById('resetFilters');
const openFiltersBtn = document.getElementById('openFilters');
const closeFiltersBtn = document.getElementById('closeFilters');
const sortSelect = document.getElementById('sortSelect');
const searchInput = document.getElementById('searchInput');

function toggleFilterPanel(open) {
  filterPanel.dataset.open = String(open);
  overlay.dataset.active = String(open);
  overlay.toggleAttribute('hidden', !open);
  filterPanel.setAttribute('aria-hidden', String(!open));
}

function clearFilterSelections() {
  state.filters.format.clear();
  state.filters.thematic_categories.clear();
  state.filters.key_concepts.clear();
  state.filters.era = '';
  state.filters.original_publication = '';
}

function syncFilterInputs() {
  renderFilterControls(state.filterOptions, state.filters);
}

function sortRecords(records) {
  const [key, direction] = sortSelect.value.split('-');
  const sorted = [...records];

  sorted.sort((a, b) => {
    let comparison = 0;
    if (key === 'date') {
      const dateA = a.publication_date ? a.publication_date.getTime() : 0;
      const dateB = b.publication_date ? b.publication_date.getTime() : 0;
      comparison = dateA - dateB;
    } else if (key === 'title') {
      comparison = a.title.localeCompare(b.title);
    }
    return direction === 'asc' ? comparison : -comparison;
  });

  return sorted;
}

function paginate(records) {
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, state.page), totalPages);
  state.page = clampedPage;
  const start = (clampedPage - 1) * PAGE_SIZE;
  const slice = records.slice(start, start + PAGE_SIZE);
  return { slice, totalPages };
}

function refreshResults() {
  const description = describeActiveFilters(state.filters);
  ui.updateActiveFilters(description);
  const matching = applyFilters(state.allRecords, state.filters, state.searchTerm);
  state.filteredRecords = sortRecords(matching);
  ui.updateResultCount(state.filteredRecords.length);
  const { slice, totalPages } = paginate(state.filteredRecords);
  ui.renderResults(slice, state.page, PAGE_SIZE, totalPages);
}

function handleFilterChipClick(event) {
  const chip = event.target.closest('.chip--filter');
  if (!chip) return;

  const { filterKey, value } = chip.dataset;
  const active = chip.dataset.active === 'true';
  const set = state.filters[filterKey];

  if (!(set instanceof Set)) return;

  if (active) {
    set.delete(value);
  } else {
    set.add(value);
  }

  chip.dataset.active = String(!active);
}

function attachFilterListeners() {
  document.getElementById('formatFilter').addEventListener('click', handleFilterChipClick);
  document.getElementById('categoryFilter').addEventListener('click', handleFilterChipClick);
  document.getElementById('conceptFilter').addEventListener('click', handleFilterChipClick);

  document.getElementById('eraSelect').addEventListener('change', (event) => {
    state.filters.era = event.target.value;
  });

  document.getElementById('publicationSelect').addEventListener('change', (event) => {
    state.filters.original_publication = event.target.value;
  });
}

function bindGlobalEvents() {
  openFiltersBtn.addEventListener('click', () => toggleFilterPanel(true));
  closeFiltersBtn.addEventListener('click', () => toggleFilterPanel(false));
  overlay.addEventListener('click', () => toggleFilterPanel(false));

  applyFiltersBtn.addEventListener('click', () => {
    toggleFilterPanel(false);
    state.page = 1;
    refreshResults();
  });

  resetFiltersBtn.addEventListener('click', () => {
    clearFilterSelections();
    syncFilterInputs();
    state.page = 1;
    refreshResults();
    toggleFilterPanel(false);
  });

  sortSelect.addEventListener('change', () => {
    state.page = 1;
    refreshResults();
  });

  searchInput.addEventListener(
    'input',
    debounce((event) => {
      state.searchTerm = event.target.value;
      state.page = 1;
      refreshResults();
    }, 180)
  );

  ui.selectors.layoutToggle.addEventListener('click', () => {
    state.layout = state.layout === 'grid' ? 'list' : 'grid';
    ui.setLayout(state.layout);
  });

  pagination.next.addEventListener('click', () => {
    state.page += 1;
    refreshResults();
  });

  pagination.prev.addEventListener('click', () => {
    state.page -= 1;
    refreshResults();
  });

  document.getElementById('resultsWrapper').addEventListener('click', (event) => {
    const card = event.target.closest('.card');
    if (!card) return;
    const record = state.filteredRecords.find((item) => item.id === card.dataset.id);
    if (record) {
      ui.openDetail(record);
    }
  });

  document.getElementById('resultsWrapper').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      const card = event.target.closest('.card');
      if (card) {
        event.preventDefault();
        const record = state.filteredRecords.find((item) => item.id === card.dataset.id);
        if (record) ui.openDetail(record);
      }
    }
  });

  document.getElementById('closeDetail').addEventListener('click', () => ui.closeDetail());
  ui.selectors.detailDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    ui.closeDetail();
  });
}

function debounce(fn, delay = 200) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(null, args), delay);
  };
}

async function init() {
  ui.setBusy(true);
  ui.setLayout(state.layout);

  try {
    const records = await fetchArchiveData();
    state.allRecords = records;
    state.filterOptions = buildFilterOptions(records);
    syncFilterInputs();
    attachFilterListeners();
    refreshResults();
  } catch (error) {
    ui.selectors.resultsWrapper.innerHTML = `
      <div class="results__empty">
        <i class="ti ti-alert-triangle"></i>
        <p>We couldn’t load the archive. Please try again later.</p>
      </div>`;
    console.error('Failed to load archive data', error);
  } finally {
    ui.setBusy(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindGlobalEvents();
  init();
});
