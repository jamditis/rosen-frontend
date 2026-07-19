import {
  CONCEPTS,
  CONNECTIONS,
  CURATOR_FINDINGS,
  ENTITIES,
  MANIFEST,
  PRESETS,
  RECORDS,
  TRAIL_STOPS,
} from './data.js?v=3.7.7';

const VALID_VIEWS = new Set(['trail', 'records', 'concepts', 'connections', 'method']);
const VALID_PRESETS = new Set(PRESETS.map(({ id }) => id));
const RECORD_IDS = new Set(RECORDS.map(({ id }) => id));
const CONCEPT_IDS = new Set(CONCEPTS.map(({ id }) => id));
const PRESET_SQL = Object.freeze({
  all: 'SELECT id FROM records ORDER BY date, id',
  idea: `SELECT DISTINCT r.id FROM records r JOIN record_themes t ON t.record_id = r.id
    WHERE t.theme IN ('direct-publishing', 'source-authority', 'journalism') ORDER BY r.date, r.id`,
  infrastructure: `SELECT DISTINCT r.id FROM records r JOIN record_themes t ON t.record_id = r.id
    WHERE t.theme IN ('open-data', 'provenance', 'syndication', 'preservation') ORDER BY r.date, r.id`,
  participation: `SELECT DISTINCT r.id FROM records r JOIN record_themes t ON t.record_id = r.id
    WHERE t.theme IN ('discovery', 'participation', 'networks') ORDER BY r.date, r.id`,
});

export function parseState(search = '') {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const preset = params.get('preset');
  const record = params.get('record');
  const concept = params.get('concept');
  const safeView = VALID_VIEWS.has(view) ? view : 'trail';
  const safeRecord = safeView === 'records' && RECORD_IDS.has(record) ? record : null;
  return {
    view: safeView,
    preset: safeRecord ? 'all' : VALID_PRESETS.has(preset) ? preset : 'all',
    record: safeRecord,
    concept: safeView === 'concepts' && CONCEPT_IDS.has(concept) ? concept : null,
  };
}

export function serializeState(state) {
  const safe = parseState(new URLSearchParams(state).toString());
  const params = new URLSearchParams();
  if (safe.view !== 'trail') params.set('view', safe.view);
  if (safe.preset !== 'all') params.set('preset', safe.preset);
  if (safe.record) params.set('record', safe.record);
  if (safe.concept) params.set('concept', safe.concept);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function runPreset(presetId, records = RECORDS) {
  const preset = PRESETS.find(({ id }) => id === presetId) || PRESETS[0];
  if (!preset.themes.length) return [...records];
  return records.filter((record) => record.themes.some((theme) => preset.themes.includes(theme)));
}

export function queryPreset(database, presetId) {
  const safeId = VALID_PRESETS.has(presetId) ? presetId : 'all';
  const result = database.exec(PRESET_SQL[safeId]);
  const ids = result[0]?.values.flat() || [];
  return ids.map((id) => RECORDS.find((record) => record.id === id)).filter(Boolean);
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const entityById = new Map(ENTITIES.map((entity) => [entity.id, entity]));
let state;
let demoDatabase = null;

function focusContentHeading() {
  requestAnimationFrame(() => {
    const heading = document.querySelector('#demo-content h2');
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    const previousScrollBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    heading.scrollIntoView({ block: 'center' });
    document.documentElement.style.scrollBehavior = previousScrollBehavior;
    heading.focus({ preventScroll: true });
  });
}

function revealActiveViewTab() {
  requestAnimationFrame(() => {
    const activeTab = document.querySelector('[data-view][aria-current="page"]');
    const viewNav = activeTab?.closest('.view-nav');
    if (!activeTab || !viewNav) return;
    const activeBounds = activeTab.getBoundingClientRect();
    const navBounds = viewNav.getBoundingClientRect();
    if (activeBounds.left < navBounds.left || activeBounds.right > navBounds.right) {
      activeTab.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  });
}

function focusEntityFragment() {
  if (state?.view !== 'connections' || !window.location.hash.startsWith('#entity-')) return false;
  const target = document.getElementById(window.location.hash.slice(1));
  if (!target) return false;
  requestAnimationFrame(() => {
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    target.focus({ preventScroll: true });
  });
  return true;
}

function updateUrl(nextState, { replace = false } = {}) {
  const query = serializeState({ ...state, ...nextState });
  state = parseState(query);
  const url = `${window.location.pathname}${query}${window.location.hash}`;
  window.history[replace ? 'replaceState' : 'pushState'](state, '', url);
  render();
  if (!state.record) focusContentHeading();
}

function recordMarkup(record, { compact = false } = {}) {
  const themes = record.themes.map((theme) => `<span class="tag">${escapeHtml(theme.replaceAll('-', ' '))}</span>`).join('');
  const recordHref = serializeState({ view: 'records', preset: 'all', record: record.id });
  const selected = state.record === record.id;
  const recordLinkLabel = compact ? 'Open full record'
    : selected ? 'Focused record permalink'
      : 'Focus record and update share URL';
  return `<article class="record-card${selected ? ' selected' : ''}" id="${record.id}" aria-labelledby="record-title-${record.id}">
    <div class="record-meta"><time datetime="${record.date}">${record.year}</time><span>${escapeHtml(record.sourceType)}</span></div>
    <h3 id="record-title-${record.id}">${escapeHtml(record.title)}</h3>
    ${compact ? '' : `<p>${escapeHtml(record.summary)}</p>`}
    <div class="tags" aria-label="Themes">${themes}</div>
    <div class="record-footer">
      <span>${escapeHtml(record.creator)} · ${escapeHtml(record.source)}</span>
      <a data-state-link href="${escapeHtml(recordHref)}"${selected && !compact ? ' aria-current="location"' : ''}>${recordLinkLabel}</a>
      <a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">Open primary source <span aria-hidden="true">↗</span></a>
    </div>
    ${compact ? '' : `<details><summary>Provenance</summary><p><strong>Primary source title:</strong> ${escapeHtml(record.sourceTitle)}</p><p>${escapeHtml(record.evidence)}</p><p class="canonical"><strong>Canonical URL:</strong> <code>${escapeHtml(record.url)}</code></p></details>`}
  </article>`;
}

function evidenceLinks(recordIds) {
  return recordIds.map((id) => {
    const record = RECORDS.find((item) => item.id === id);
    const href = serializeState({ view: 'records', preset: 'all', record: id });
    return `<a data-state-link href="${escapeHtml(href)}">${record.year}: ${escapeHtml(record.title)}</a>`;
  }).join('');
}

function renderTrail() {
  const stops = TRAIL_STOPS.map((stop, index) => {
    const record = RECORDS.find(({ id }) => id === stop.recordId);
    return `<li>
      <span class="step" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <div class="trail-stop">
        <p class="trail-label">${escapeHtml(stop.label)}</p>
        ${recordMarkup(record, { compact: true })}
        <p class="trail-interpretation">${escapeHtml(stop.interpretation)}</p>
        <p class="trail-transition"><strong>What changes next:</strong> ${escapeHtml(stop.transition)}</p>
      </div>
    </li>`;
  }).join('');
  const findings = CURATOR_FINDINGS.map((finding) => `<article>
    <h3>${escapeHtml(finding.title)}</h3>
    <p>${escapeHtml(finding.text)}</p>
    <div class="evidence-links"><span>Evidence</span>${evidenceLinks(finding.evidenceRecordIds)}</div>
  </article>`).join('');
  return `<section class="panel" aria-labelledby="trail-title">
    <p class="eyebrow">Authored trail</p>
    <h2 id="trail-title">Five stops through the evidence</h2>
    <p class="section-intro">This is an intentional reading across five of the 11 records. The connective text is the curator’s interpretation of the cited sources, not a claim that every item uses the same words.</p>
    <ol class="timeline">${stops}</ol>
    <section class="findings" aria-labelledby="findings-title">
      <p class="eyebrow">Curator findings</p>
      <h2 id="findings-title">Four patterns worth testing</h2>
      <p class="section-intro">These are provisional readings, not findings attributed to Winer or Rosen. Follow the evidence links to evaluate each one.</p>
      <div class="findings-grid">${findings}</div>
    </section>
  </section>`;
}

function renderRecords(records) {
  return `<section class="panel" aria-labelledby="records-title">
    <p class="eyebrow">Frozen mini-archive</p>
    <h2 id="records-title">${records.length} source records</h2>
    <p class="section-intro">Each record keeps a canonical URL, a provenance note, and a curator-written summary. Nothing is fetched from the Rosen archive.</p>
    <div class="record-grid">${records.map((record) => recordMarkup(record)).join('')}</div>
  </section>`;
}

function renderConnections() {
  const evidenceCountFor = (entityId) => new Set(CONNECTIONS
    .filter(({ from, to }) => from === entityId || to === entityId)
    .map(({ evidenceRecord }) => evidenceRecord)).size;
  const countLabel = (count, singular) => `${count} ${singular}${count === 1 ? '' : 's'}`;
  const entityCards = ENTITIES.map((entity) => {
    const evidenceCount = evidenceCountFor(entity.id);
    return `<li id="entity-${entity.id}" tabindex="-1"><span class="entity-kind">${escapeHtml(entity.kind)}</span><strong>${escapeHtml(entity.name)}</strong><p>${escapeHtml(entity.description)}</p><small>${countLabel(evidenceCount, 'linked evidence record')}</small></li>`;
  }).join('');
  const connections = CONNECTIONS.map((connection, index) => {
    const source = entityById.get(connection.from);
    const target = entityById.get(connection.to);
    const record = RECORDS.find(({ id }) => id === connection.evidenceRecord);
    return `<li><article class="relation-path" aria-labelledby="relation-${index + 1}">
      <a class="entity-node" href="#entity-${source.id}" aria-label="${escapeHtml(source.name)}, ${escapeHtml(source.kind)}; ${countLabel(evidenceCountFor(source.id), 'linked evidence record')}">
        <span>${escapeHtml(source.kind)}</span><strong>${escapeHtml(source.name)}</strong><small>${countLabel(evidenceCountFor(source.id), 'evidence record')}</small>
      </a>
      <div class="relation-bridge">
        <strong id="relation-${index + 1}">${escapeHtml(connection.type)}</strong>
        <a class="relation-evidence" data-state-link href="${escapeHtml(serializeState({ view: 'records', preset: 'all', record: record.id }))}" aria-label="${countLabel(1, 'supporting record')}, ${record.year}: ${escapeHtml(record.title)}">Evidence 1 · ${escapeHtml(record.source)} · ${record.year}</a>
      </div>
      <a class="entity-node" href="#entity-${target.id}" aria-label="${escapeHtml(target.name)}, ${escapeHtml(target.kind)}; ${countLabel(evidenceCountFor(target.id), 'linked evidence record')}">
        <span>${escapeHtml(target.kind)}</span><strong>${escapeHtml(target.name)}</strong><small>${countLabel(evidenceCountFor(target.id), 'evidence record')}</small>
      </a>
    </article></li>`;
  }).join('');
  return `<section class="panel" aria-labelledby="connections-title">
    <p class="eyebrow">Evidence-backed map</p>
    <h2 id="connections-title">How the evidence relates</h2>
    <p class="section-intro">Each path is an editorial assertion backed by the linked source record—not a relationship inferred from proximity or co-occurrence. Select a node to jump to its note, or follow the center link to inspect the evidence.</p>
    <ol class="relation-map" aria-label="Seven evidence-backed entity relationships">${connections}</ol>
    <div class="entity-heading"><p class="eyebrow">Entity notes</p><h3>Who and what appears in the corpus</h3></div><ul class="entity-grid">${entityCards}</ul>
  </section>`;
}

function renderConcepts() {
  const selected = CONCEPTS.find(({ id }) => id === state.concept);
  if (selected) {
    return `<section class="panel concept-page" aria-labelledby="concept-title">
      <a data-state-link class="back-link" href="${serializeState({ view: 'concepts' })}">← All six concepts</a>
      <p class="eyebrow">Concept guide</p>
      <h2 id="concept-title">${escapeHtml(selected.title)}</h2>
      <p class="concept-short">${escapeHtml(selected.short)}</p>
      <div class="concept-reading">
        <h3>How this mini-archive uses the term</h3>
        <p>${escapeHtml(selected.explanation)}</p>
        <h3>A question to carry into the sources</h3>
        <p>${escapeHtml(selected.question)}</p>
      </div>
      <div class="concept-evidence"><h3>Read the evidence</h3>${evidenceLinks(selected.evidenceRecordIds)}</div>
    </section>`;
  }
  const cards = CONCEPTS.map((concept) => `<li>
    <a data-state-link href="${escapeHtml(serializeState({ view: 'concepts', concept: concept.id }))}">
      <span>0${CONCEPTS.indexOf(concept) + 1}</span>
      <strong>${escapeHtml(concept.title)}</strong>
      <p>${escapeHtml(concept.short)}</p>
      <small>${concept.evidenceRecordIds.length} evidence records →</small>
    </a>
  </li>`).join('');
  return `<section class="panel" aria-labelledby="concepts-title">
    <p class="eyebrow">Concept guide</p>
    <h2 id="concepts-title">Six terms for reading the trail</h2>
    <p class="section-intro">Each concise page defines one term only as it is used in this bounded corpus, then links back to the supporting records. Every concept URL is shareable.</p>
    <ol class="concept-grid">${cards}</ol>
  </section>`;
}

function renderMethod() {
  const sourceRows = RECORDS.map((record) => `<tr><td>${escapeHtml(record.id)}</td><td>${record.date}</td><td>${escapeHtml(record.sourceType)}</td><td><a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.sourceTitle)}</a><small class="source-publication">${escapeHtml(record.source)}</small></td><td>${escapeHtml(record.evidence)}</td></tr>`).join('');
  return `<section class="panel" aria-labelledby="method-title">
    <p class="eyebrow">Transparent method</p>
    <h2 id="method-title">What this demonstration does</h2>
    <div class="method-grid">
      <div><h3>Retrieve offline</h3><p>Fetch public primary pages during curation and record the source locator and date basis.</p></div>
      <div><h3>Normalize</h3><p>Preserve the primary source title separately from the curator title, then map selected fields into restrained frozen records.</p></div>
      <div><h3>Connect</h3><p>Name entities and editorial relationships, each with a supporting record.</p></div>
      <div><h3>Query</h3><p>Apply four editorial lenses over local frozen data and preserve a JavaScript fallback with matching results.</p></div>
    </div>
    <div class="method-security"><p class="eyebrow">Bounded interface</p><h3>Local evidence, limited controls</h3><p>The record interface exposes four allowlisted, read-only query presets. It accepts no free-form SQL, makes no runtime source requests, and falls back to the same frozen local records if SQLite is unavailable.</p></div>
    <div class="limitations"><h3>Scope and limitations</h3><p>${escapeHtml(MANIFEST.scope)}</p><ul>${MANIFEST.exclusions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><p><strong>Frozen:</strong> ${MANIFEST.frozenOn}. <strong>Records:</strong> ${MANIFEST.recordCount}.</p></div>
    <div class="manifest-heading"><h3>Source manifest</h3><div class="manifest-actions"><a class="download-link" href="./source-manifest.json" download>Download source manifest (JSON)</a><a class="download-link" href="./ingestion-log.json" download>Download offline ingestion log (JSON)</a><a class="download-link" href="./retrieval-evidence.json" download>Download retrieval evidence (JSON)</a></div></div>
    <p class="table-hint" id="manifest-scroll-hint">On smaller screens, scroll horizontally to read all five columns.</p>
    <div class="table-wrap" tabindex="0" aria-describedby="manifest-scroll-hint"><table><caption>${escapeHtml(MANIFEST.sourcePolicy)}</caption><thead><tr><th>Record</th><th>Date</th><th>Type</th><th>Primary source title</th><th>Verification note</th></tr></thead><tbody>${sourceRows}</tbody></table></div>
  </section>`;
}

function render() {
  const records = demoDatabase ? queryPreset(demoDatabase, state.preset) : runPreset(state.preset);
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === state.view;
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  revealActiveViewTab();
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.preset === state.preset));
  });
  document.querySelector('[data-lenses]').hidden = state.view !== 'records';
  const selectedPreset = PRESETS.find(({ id }) => id === state.preset);
  document.getElementById('preset-summary').textContent = state.view === 'records'
    ? `${selectedPreset.label}: ${selectedPreset.description} Showing ${records.length} of ${RECORDS.length} records.`
    : `${selectedPreset.label}: ${records.length} records ready in the Source records view.`;
  const content = document.getElementById('demo-content');
  content.innerHTML = state.view === 'records' ? renderRecords(records)
    : state.view === 'concepts' ? renderConcepts()
      : state.view === 'connections' ? renderConnections()
      : state.view === 'method' ? renderMethod()
        : renderTrail();
  if (state.record) {
    requestAnimationFrame(() => {
      const selected = document.getElementById(state.record);
      selected?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      selected?.setAttribute('tabindex', '-1');
      selected?.focus({ preventScroll: true });
    });
  }
}

async function loadDatabase() {
  if (typeof window.initSqlJs !== 'function') throw new Error('The local database engine did not load.');
  const SQL = await window.initSqlJs({ locateFile: () => '../../frontend/vendor/sql-wasm-1.10.3.wasm' });
  const response = await fetch('./demo.sqlite');
  if (!response.ok) throw new Error(`The demonstration database returned ${response.status}.`);
  demoDatabase = new SQL.Database(new Uint8Array(await response.arrayBuffer()));
}

async function initialize() {
  state = parseState(window.location.search);
  const safeQuery = serializeState(state);
  if (safeQuery !== window.location.search) {
    window.history.replaceState(state, '', `${window.location.pathname}${safeQuery}${window.location.hash}`);
  }
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => updateUrl({ view: button.dataset.view, record: null, concept: null }));
    button.addEventListener('focus', () => button.scrollIntoView({ block: 'nearest', inline: 'center' }));
  });
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => updateUrl({ view: 'records', preset: button.dataset.preset, record: null, concept: null })));
  document.addEventListener('click', (event) => {
    const stateLink = event.target.closest('[data-state-link]');
    if (stateLink) {
      event.preventDefault();
      updateUrl(parseState(stateLink.search));
      return;
    }
  });
  window.addEventListener('popstate', () => {
    const nextState = parseState(window.location.search);
    if (serializeState(nextState) === serializeState(state)) return;
    state = nextState;
    render();
    if (!state.record) focusContentHeading();
  });
  render();
  try {
    await loadDatabase();
    document.getElementById('preset-summary').dataset.engine = 'sqlite';
  } catch (error) {
    console.warn('Using the frozen JavaScript fallback because the local SQLite database was unavailable.', error);
  }
  if (!focusEntityFragment() && state.view !== 'trail' && !state.record) focusContentHeading();
}

if (typeof document !== 'undefined') initialize();
