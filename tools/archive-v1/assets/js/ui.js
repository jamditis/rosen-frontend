const selectors = {
  resultsWrapper: document.getElementById('resultsWrapper'),
  resultCount: document.getElementById('resultCount'),
  activeFilters: document.getElementById('activeFilters'),
  paginationStatus: document.getElementById('paginationStatus'),
  paginator: document.getElementById('paginator'),
  cardTemplate: document.getElementById('cardTemplate'),
  detailDialog: document.getElementById('detailDialog'),
  detailContent: document.getElementById('detailContent'),
  detailTitle: document.getElementById('detailTitle'),
  detailSummarySection: document.getElementById('detailSummarySection'),
  detailSummary: document.getElementById('detailSummary'),
  detailExcerpt: document.getElementById('detailExcerpt'),
  detailPullQuote: document.getElementById('detailPullQuote'),
  detailHighlightsSection: document.getElementById('detailHighlightsSection'),
  detailMediaSection: document.getElementById('detailMediaSection'),
  detailMedia: document.getElementById('detailMedia'),
  detailMetaGrid: document.getElementById('detailMetaGrid'),
  detailCategories: document.getElementById('detailCategories'),
  detailConcepts: document.getElementById('detailConcepts'),
  detailTags: document.getElementById('detailTags'),
  detailResponds: document.getElementById('detailResponds'),
  detailRelatedSection: document.getElementById('detailRelatedSection'),
  detailRelated: document.getElementById('detailRelated'),
  detailInfluenceSection: document.getElementById('detailInfluenceSection'),
  detailInfluence: document.getElementById('detailInfluence'),
  detailResourcesSection: document.getElementById('detailResourcesSection'),
  detailResources: document.getElementById('detailResources'),
  detailNotesSection: document.getElementById('detailNotesSection'),
  detailNotes: document.getElementById('detailNotes'),
  detailLink: document.getElementById('detailLink'),
  layoutToggle: document.getElementById('toggleLayout')
};

export const ui = {
  selectors,

  setBusy(isBusy) {
    selectors.resultsWrapper.setAttribute('aria-busy', String(isBusy));
  },

  updateResultCount(count) {
    selectors.resultCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
  },

  updateActiveFilters(labels) {
    selectors.activeFilters.textContent = labels.length ? `Filters: ${labels.join(', ')}` : 'All filters cleared';
  },

  setLayout(mode) {
    selectors.resultsWrapper.dataset.layout = mode;
    selectors.layoutToggle.innerHTML =
      mode === 'grid'
        ? `<i class="ti ti-layout-list"></i><span class="sr-only">Switch to list view</span>`
        : `<i class="ti ti-layout-grid"></i><span class="sr-only">Switch to grid view</span>`;
  },

  renderResults(records, page, pageSize, totalPages) {
    selectors.resultsWrapper.innerHTML = '';

    if (!records.length) {
      selectors.resultsWrapper.innerHTML = `
        <div class="results__empty">
          <i class="ti ti-search"></i>
          <p>No items matched your filters.</p>
        </div>`;
      return;
    }

    const fragment = document.createDocumentFragment();

    records.forEach((record) => {
      const clone = selectors.cardTemplate.content.cloneNode(true);
      const card = clone.querySelector('.card');
      card.dataset.id = record.id;

      clone.querySelector('[data-badge="concept"]').textContent = record.key_concepts[0] ?? record.thematic_categories[0] ?? 'Concept';
      clone.querySelector('[data-field="date"]').textContent = record.publication_date
        ? record.publication_date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : 'Undated';
      clone.querySelector('[data-field="title"]').textContent = record.title;
      clone.querySelector('[data-field="summary"]').textContent = record.summary || 'No summary available.';

      const chipHost = clone.querySelector('[data-field="chips"]');
      [...record.key_concepts.slice(0, 2), ...record.thematic_categories.slice(0, 1)].forEach((chip) => {
        const span = document.createElement('span');
        span.className = 'chip';
        span.textContent = chip;
        chipHost.appendChild(span);
      });

      fragment.appendChild(clone);
    });

    selectors.resultsWrapper.appendChild(fragment);
    selectors.paginationStatus.textContent = `Page ${page} of ${totalPages || 1}`;
    selectors.paginator.querySelector('[data-page="prev"]').disabled = page <= 1;
    selectors.paginator.querySelector('[data-page="next"]').disabled = page >= totalPages;
  },

  toggleVisibility(element, shouldShow) {
    if (!element) return;
    element.classList.toggle('is-hidden', !shouldShow);
  },

  renderChipGroup(container, items) {
    if (!container) return;
    const group = container.closest('div');
    const unique = [...new Set((items || []).filter(Boolean))];
    if (!unique.length) {
      container.innerHTML = '';
      if (group) group.classList.add('is-hidden');
      return;
    }
    if (group) group.classList.remove('is-hidden');
    container.innerHTML = unique.map((item) => `<span class="chip">${item}</span>`).join('');
  },

  openDetail(record) {
    const formatDate = (date) =>
      date ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;

    const getYouTubeId = (url) => {
      if (!url) return null;
      const match = url.match(/^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]{11}).*/);
      return match ? match[1] : null;
    };

    selectors.detailTitle.textContent = record.title || 'Untitled';

    const metaItems = [];
    if (record.original_publication) metaItems.push({ label: 'Publication', value: record.original_publication });
    if (record.author && record.author.toLowerCase() !== 'unknown') metaItems.push({ label: 'Author', value: record.author });
    if (record.publication_date) metaItems.push({ label: 'Published', value: formatDate(record.publication_date) });
    if (record.format || record.content_type) metaItems.push({ label: 'Format', value: record.format || record.content_type });
    if (record.collection_id) metaItems.push({ label: 'Collection', value: record.collection_id });
    if (record.verified && String(record.verified).toLowerCase() !== 'false') {
      const label = String(record.verified).toLowerCase() === 'true' ? 'Verified' : record.verified;
      metaItems.push({ label: 'Verification', value: label });
    }
    selectors.detailMetaGrid.innerHTML = metaItems
      .map(
        (item) => `
          <div class="detail__meta-item">
            <span class="detail__meta-label">${item.label}</span>
            <p>${item.value}</p>
          </div>`
      )
      .join('');
    this.toggleVisibility(selectors.detailMetaGrid, metaItems.length > 0);

    const hasSummary = Boolean(record.summary);
    selectors.detailSummary.textContent = record.summary || '';
    this.toggleVisibility(selectors.detailSummarySection, hasSummary);

    const youtubeId = getYouTubeId(record.url);
    if (youtubeId) {
      selectors.detailMedia.innerHTML = `<iframe src="https://www.youtube.com/embed/${youtubeId}" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      this.toggleVisibility(selectors.detailMediaSection, true);
    } else {
      selectors.detailMedia.innerHTML = '';
      this.toggleVisibility(selectors.detailMediaSection, false);
    }

    const hasPullQuote = Boolean(record.pull_quote);
    const hasExcerpt = Boolean(record.excerpt);
    selectors.detailPullQuote.textContent = record.pull_quote || '';
    selectors.detailExcerpt.textContent = record.excerpt || '';
    this.toggleVisibility(selectors.detailHighlightsSection, hasPullQuote || hasExcerpt);

    this.renderChipGroup(selectors.detailCategories, record.thematic_categories);
    this.renderChipGroup(selectors.detailConcepts, record.key_concepts);
    this.renderChipGroup(selectors.detailTags, record.tags?.slice(0, 20));
    this.renderChipGroup(selectors.detailResponds, record.responds_to);

    selectors.detailLink.href = record.url;

    if (typeof selectors.detailDialog.showModal === 'function') {
      selectors.detailDialog.showModal();
    } else {
      selectors.detailDialog.setAttribute('open', 'true');
    }
  },

  closeDetail() {
    if (selectors.detailDialog.open) {
      selectors.detailDialog.close();
    } else {
      selectors.detailDialog.removeAttribute('open');
    }
  }
};
