import { useEffect, useMemo, useState } from 'react';
import { html } from '../html.js?v=3.8.14';
import { AlertCircle, Search } from 'lucide-react';
import { buildWikiPageIndex, fetchWikiData, filterWikiPages, findWikiPageBySlug, normalizeWikiPages, parseWikiHash, wikiPageHref } from '../services/wikiService.js?v=3.8.14';

const KIND_LABELS = {
  concept: 'Concepts',
  entity: 'Entities',
  topic: 'Topics and tags'
};

const RelatedList = ({ title, slugs, pages }) => {
  if (!slugs?.length) return null;
  return html`
    <section>
      <h3 className="font-display text-stone-900 text-lg mb-3">${title}</h3>
      <div className="flex flex-wrap gap-2">
        ${slugs.map(slug => {
          const page = findWikiPageBySlug(pages, slug);
          return html`
            <a key=${slug} href=${wikiPageHref(slug)} className="px-3 py-1.5 rounded-full border border-stone-200 bg-stone-50 text-xs font-bold text-stone-700 hover:border-stone-400 hover:bg-white transition-colors">
              ${page?.title || slug}
            </a>
          `;
        })}
      </div>
    </section>
  `;
};

const WikiDetail = ({ page, pages, onBack }) => html`
  <article className="max-w-4xl mx-auto w-full">
    <button onClick=${onBack} className="text-xs font-bold text-stone-500 hover:text-stone-900 mb-6">← Back to wiki index</button>

    <div className="bg-white border border-stone-200 rounded-sm shadow-sm overflow-hidden">
      <div className="border-b border-stone-200 p-6 md:p-8 bg-stone-50">
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 bg-stone-900 text-white rounded-sm">${page.kind}</span>
        </div>
        <h1 className="font-display text-3xl md:text-5xl text-stone-900 mb-4">${page.title}</h1>
        <p className="text-lg text-stone-700 leading-relaxed max-w-3xl">${page.summary}</p>
      </div>

      <div className="p-6 md:p-8 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        <div className="space-y-8">
          ${page.body.map(block => html`
            <section key=${block.heading}>
              <h2 className="font-display text-2xl text-stone-900 mb-3">${block.heading}</h2>
              <p className="text-stone-700 leading-relaxed">${block.text}</p>
            </section>
          `)}

          <${RelatedList} title="Related concepts" slugs=${page.relatedConcepts} pages=${pages} />
          <${RelatedList} title="Related entities" slugs=${page.relatedEntities} pages=${pages} />

          <section>
            <h2 className="font-display text-2xl text-stone-900 mb-3">Sources and references</h2>
            ${page.references.length ? html`
              <ul className="space-y-2">
                ${page.references.map(ref => html`
                  <li key=${ref.url} className="text-sm">
                    <a href=${ref.url} target="_blank" rel="noopener noreferrer" className="text-stone-900 font-bold underline decoration-stone-300 underline-offset-4 hover:decoration-stone-700">${ref.label}</a>
                  </li>
                `)}
              </ul>
            ` : html`<p className="text-sm text-stone-500">No public references have been attached yet.</p>`}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="border border-stone-200 bg-stone-50 rounded-sm p-4">
            <h2 className="font-display text-lg text-stone-900 mb-3">Page facts</h2>
            <dl className="space-y-3 text-xs text-stone-600">
              <div><dt className="font-bold text-stone-900">Last updated</dt><dd>${page.lastUpdated}</dd></div>
              <div><dt className="font-bold text-stone-900">Contributors</dt><dd>${page.contributors.join(', ')}</dd></div>
            </dl>
          </div>
          ${page.aliases.length > 0 ? html`
            <div className="border border-stone-200 bg-white rounded-sm p-4">
              <h2 className="font-display text-lg text-stone-900 mb-3">Aliases</h2>
              <div className="flex flex-wrap gap-2">
                ${page.aliases.map(alias => html`<span key=${alias} className="text-xs px-2 py-1 bg-stone-100 text-stone-700 rounded-sm">${alias}</span>`)}
              </div>
            </div>
          ` : null}
        </aside>
      </div>
    </div>
  </article>
`;

const WikiPage = ({ initialSlug = null }) => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [activeSlug, setActiveSlug] = useState(initialSlug);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const syncSlug = () => {
      const parsed = parseWikiHash(window.location.hash);
      setActiveSlug(parsed.slug);
      setNotFound(parsed.notFound);
    };
    syncSlug();
    window.addEventListener('hashchange', syncSlug);
    return () => window.removeEventListener('hashchange', syncSlug);
  }, []);

  useEffect(() => {
    fetchWikiData()
      .then(data => setPages(normalizeWikiPages(data)))
      .catch(err => {
        console.error(err);
        setError('Failed to load wiki seed data.');
      })
      .finally(() => setLoading(false));
  }, []);

  const visiblePages = useMemo(() => filterWikiPages(pages, { query, kind }), [pages, query, kind]);
  const pageIndex = useMemo(() => buildWikiPageIndex(pages), [pages]);
  const selectedPage = activeSlug ? (pageIndex.get(activeSlug) || null) : null;
  const counts = useMemo(() => pages.reduce((acc, page) => ({ ...acc, [page.kind]: (acc[page.kind] || 0) + 1 }), {}), [pages]);

  if (loading) return html`<div className="py-20 text-center text-stone-500">Loading wiki...</div>`;
  if (error) return html`<div className="py-20 text-center text-red-600">${error}</div>`;
  if (selectedPage) return html`<${WikiDetail} page=${selectedPage} pages=${pages} onBack=${() => { window.location.hash = 'wiki'; }} />`;
  if (activeSlug || notFound) return html`
    <div className="max-w-3xl mx-auto w-full text-center py-20 border border-dashed border-stone-300 rounded-sm bg-white">
      <${AlertCircle} className="w-10 h-10 mx-auto text-amber-500 mb-4" />
      <h1 className="font-display text-3xl text-stone-900 mb-3">Wiki page not found</h1>
      <p className="text-sm text-stone-600 mb-6">${activeSlug ? `No wiki page exists for ${activeSlug}.` : 'That wiki link is not valid.'} Only published wiki pages are available.</p>
      <button onClick=${() => { window.location.hash = 'wiki'; }} className="px-4 py-2 bg-stone-900 text-white rounded-sm text-sm font-bold hover:bg-stone-700">Back to wiki index</button>
    </div>
  `;

  return html`
    <div className="max-w-6xl mx-auto w-full space-y-8">
      <section className="bg-white border border-stone-200 rounded-sm p-6 md:p-8 shadow-sm">
        <h1 className="font-display text-4xl md:text-6xl text-stone-900 mb-4">Archive wiki</h1>
        <p className="text-stone-700 leading-relaxed max-w-3xl">
          The key ideas behind the archive, each one drawn from Jay Rosen's 1986 dissertation, The Impossible Press. Browse the concepts, follow the links between them, and trace every claim back to the text.
        </p>
      </section>

      <section className="bg-stone-50 border border-stone-200 rounded-sm p-4 md:p-5">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <label className="relative flex-grow">
            <span className="sr-only">Search wiki pages</span>
            <${Search} className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input value=${query} onInput=${e => setQuery(e.target.value)} placeholder="Search wiki pages..." className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-sm bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
          </label>
          <div className="flex flex-wrap gap-2">
            ${['all', 'concept', 'entity', 'topic'].map(option => html`
              <button key=${option} onClick=${() => setKind(option)} className=${`px-3 py-2 rounded-sm border text-xs font-bold transition-colors ${kind === option ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'}`}>
                ${option === 'all' ? `All (${pages.length})` : `${KIND_LABELS[option]} (${counts[option] || 0})`}
              </button>
            `)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        ${visiblePages.map(page => html`
          <a key=${page.id} href=${wikiPageHref(page.slug)} className="group bg-white border border-stone-200 rounded-sm p-5 shadow-sm hover:border-stone-400 hover:shadow-md transition-all">
            <span className="text-[10px] uppercase tracking-wider font-bold text-stone-500 block mb-3">${page.kind}</span>
            <h2 className="font-display text-2xl text-stone-900 mb-2 group-hover:underline decoration-stone-300 underline-offset-4">${page.title}</h2>
            <p className="text-sm text-stone-600 leading-relaxed mb-4">${page.summary}</p>
            <span className="text-xs text-stone-400">Updated ${page.lastUpdated}</span>
          </a>
        `)}
      </section>

      ${visiblePages.length === 0 && html`
        <div className="text-center py-16 border border-dashed border-stone-300 rounded-sm bg-white">
          <${Search} className="w-8 h-8 mx-auto text-stone-300 mb-3" />
          <p className="text-stone-500 text-sm">No wiki pages match those filters.</p>
        </div>
      `}
    </div>
  `;
};

export default WikiPage;
