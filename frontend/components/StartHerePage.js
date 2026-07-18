import { useEffect, useMemo, useRef } from 'react';
import { html } from '../html.js?v=3.7.3';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Boxes,
  Compass,
  FolderOpen,
  Library,
  Network,
  Search,
  Sparkles
} from 'lucide-react';

const normalizeTitle = (title = '') => title
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s*\(\d{4}\)\s*$/, '')
  .replace(/^pressthink:\s*/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const CURATED_SEQUENCE = [
  {
    title: 'The Impossible Press (1986)',
    folio: '01',
    form: 'PhD dissertation',
    year: '1986',
    note: 'Begin with the argument underneath the archive: journalism cannot be understood apart from the public life it is meant to serve.'
  },
  {
    title: 'What Are Journalists For?',
    folio: '02',
    form: 'Book',
    year: '1999',
    note: 'That question becomes a practical experiment in public journalism—an attempt to reconnect reporting with communities acting on shared problems.'
  },
  {
    title: 'The View from Nowhere',
    folio: '03',
    form: 'Essay and key concept',
    year: '2010',
    note: 'The trail arrives at a critique of professional detachment, asking what journalists should disclose about where they stand and why they should be trusted.'
  }
];

const findFeaturedRecords = (records) => {
  const selectedIds = new Set();

  return CURATED_SEQUENCE.map((entry) => {
    const target = normalizeTitle(entry.title);
    const candidates = records
      .filter((record) => record.type !== 'social')
      .map((record) => {
        const title = normalizeTitle(record.title);
        const titleScore = title === target ? 3 : title.startsWith(`${target} `) ? 2 : 0;
        const recordYear = String(record.year || record.date || '').slice(0, 4);
        const score = titleScore > 0 ? titleScore + (recordYear === entry.year ? 4 : 0) : 0;
        return { record, score };
      })
      .filter(({ record, score }) => score > 0 && !selectedIds.has(record.id))
      .sort((a, b) => b.score - a.score || String(a.record.title).localeCompare(String(b.record.title)));

    if (candidates.length === 0) return null;
    const record = candidates[0].record;
    selectedIds.add(record.id);
    return { record, entry };
  }).filter(Boolean);
};

const StartHerePage = ({
  onBack,
  records = [],
  onNavigate,
  onOpenBugReport,
  onSelectRecord
}) => {
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const { stats, featuredRecords } = useMemo(() => {
    const years = records
      .map((record) => Number.parseInt(record.year, 10))
      .filter(Number.isFinite);
    const categories = new Set(records.flatMap((record) => record.categories || []).filter(Boolean));

    return {
      stats: {
        total: records.length,
        categories: categories.size,
        minYear: years.length > 0 ? Math.min(...years) : null,
        maxYear: years.length > 0 ? Math.max(...years) : null
      },
      featuredRecords: findFeaturedRecords(records)
    };
  }, [records]);

  const navigate = (route) => {
    if (onNavigate) onNavigate(route);
  };

  const scrollTo = (id) => {
    const target = document.getElementById(id);
    if (!target) return;
    const disclosure = target.querySelector('details');
    if (disclosure) disclosure.open = true;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const focusTarget = target.querySelector('h2, summary');
    focusTarget?.focus({ preventScroll: true });
  };

  const routeButton = (route, label, Icon = ArrowRight) => html`
    <button
      type="button"
      onClick=${() => navigate(route)}
      className="inline-flex items-center justify-center gap-2 bg-stone-900 px-5 py-3 font-display text-sm font-bold text-white transition-colors hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
    >
      <${Icon} className="h-4 w-4" aria-hidden="true" />
      ${label}
    </button>
  `;

  const guideItem = ({ id, icon: Icon, title, children, action }) => html`
    <article id=${id} className="scroll-mt-24 border-t border-stone-200 py-8 sm:flex gap-4">
      <div className="mb-3 flex h-12 w-12 items-center justify-center bg-stone-100 text-stone-700">
        <${Icon} className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <h3 className="mb-2 font-display text-xl font-bold text-stone-900">${title}</h3>
        <div className="space-y-3 font-body text-sm leading-relaxed text-stone-600">${children}</div>
        ${action && html`<div className="mt-4">${action}</div>`}
      </div>
    </article>
  `;

  return html`
    <div className="min-h-screen bg-[#fdfbf7]">
      <header className="sticky top-0 z-50 border-b border-stone-300 bg-paper shadow-sm">
        <div className="container mx-auto flex h-16 items-center px-4">
          <button
            type="button"
            onClick=${onBack}
            className="flex items-center gap-2 px-1 py-3 text-sm font-bold text-stone-600 transition-colors hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            <${ArrowLeft} className="h-4 w-4" aria-hidden="true" />
            Back to archive
          </button>
        </div>
      </header>

      <main id="main-content" className="container mx-auto max-w-5xl px-4 py-8 md:py-16">
        <section aria-labelledby="start-here-title" className="mb-12 border-b-2 border-stone-800 pb-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="bg-stone-900 p-2 text-white">
              <${Compass} className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="font-body text-xs font-bold uppercase tracking-wider text-stone-500">Visitor guide</p>
          </div>
          <h1 ref=${titleRef} tabIndex="-1" id="start-here-title" className="max-w-3xl font-display text-3xl font-bold leading-tight text-stone-900 outline-none md:text-5xl">
            Start here
          </h1>
          <p className="mt-4 max-w-3xl font-body text-lg leading-relaxed text-stone-600">
            Jay Rosen's Internet Archive brings together decades of writing, teaching, interviews, and public commentary about journalism and democratic life. Search directly, follow a curated trail, or learn how the collection is organized.
          </p>

          <div className="mt-8">
            ${routeButton('archive', 'Search and browse records', Search)}
          </div>

          ${stats.total > 0 && html`
            <p className="mt-4 font-body text-xs text-stone-500">
              ${stats.total.toLocaleString()} records
              ${stats.minYear !== null ? ` · ${stats.minYear}–${stats.maxYear}` : ''}
              ${stats.categories > 0 ? ` · ${stats.categories.toLocaleString()} thematic collections` : ''}
            </p>
          `}
        </section>

        <nav aria-labelledby="choose-path-title" className="mb-16">
          <div className="mb-6">
            <h2 id="choose-path-title" className="font-display text-2xl font-bold text-stone-900">Choose a starting point</h2>
            <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-stone-600">Pick the route that best matches what you came to do. You can switch paths at any time.</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <a
              href="#guide"
              onClick=${(event) => { event.preventDefault(); scrollTo('guide'); }}
              aria-controls="guide"
              className="group border border-stone-200 bg-white p-6 text-left shadow-sm transition-all hover:border-stone-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              <${Compass} className="mb-4 h-6 w-6 text-sky-700" aria-hidden="true" />
              <span className="block font-display text-xl font-bold text-stone-900">Learn how the archive works</span>
              <span className="mt-3 block font-body text-sm leading-relaxed text-stone-600">Open the complete field guide to records, folders, entities, research tools, and archive terminology.</span>
              <span className="mt-4 inline-flex items-center gap-2 font-body text-xs font-bold uppercase tracking-wider text-stone-800">Open the field guide <${ArrowRight} className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
            </a>

            <a
              href="#highlights"
              onClick=${(event) => { event.preventDefault(); scrollTo('highlights'); }}
              aria-controls="highlights"
              className="group border border-stone-200 bg-white p-6 text-left shadow-sm transition-all hover:border-stone-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              <${Sparkles} className="mb-4 h-6 w-6 text-amber-700" aria-hidden="true" />
              <span className="block font-display text-xl font-bold text-stone-900">Show me the highlights</span>
              <span className="mt-3 block font-body text-sm leading-relaxed text-stone-600">Begin with a few works that open onto the archive's recurring questions and ideas.</span>
              <span className="mt-4 inline-flex items-center gap-2 font-body text-xs font-bold uppercase tracking-wider text-stone-800">See selected records <${ArrowRight} className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
            </a>

            <button
              type="button"
              onClick=${() => navigate('entities')}
              className="group border border-stone-200 bg-white p-6 text-left shadow-sm transition-all hover:border-stone-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              <${Network} className="mb-4 h-6 w-6 text-stone-700" aria-hidden="true" />
              <span className="block font-display text-xl font-bold text-stone-900">Research a topic or idea</span>
              <span className="mt-3 block font-body text-sm leading-relaxed text-stone-600">Trace people, organizations, concepts, and the records that connect them.</span>
              <span className="mt-4 inline-flex items-center gap-2 font-body text-xs font-bold uppercase tracking-wider text-stone-800">Explore entities <${ArrowRight} className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
            </button>
          </div>
        </nav>

        <section id="highlights" aria-labelledby="highlights-title" className="mb-16 scroll-mt-24">
          <div className="mb-6 flex items-end justify-between gap-4 border-b border-stone-300 pb-2">
            <div>
              <p className="mb-1 font-body text-xs font-bold uppercase tracking-wider text-stone-500">Curated entry points</p>
              <h2 id="highlights-title" tabIndex="-1" className="font-display text-2xl font-bold text-stone-900 outline-none">Three works, one developing argument</h2>
              <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-stone-600">A short path through nearly twenty-five years of questions about journalism, public life, and professional authority.</p>
            </div>
          </div>

          ${featuredRecords.length > 0 ? html`
            <div className="grid gap-6 md:grid-cols-3">
              ${featuredRecords.map(({ record, entry }) => html`
                <button
                  key=${record.id}
                  type="button"
                  onClick=${() => onSelectRecord && onSelectRecord(record.id)}
                  className="group flex flex-col border border-stone-200 bg-white p-5 text-left shadow-sm transition-all hover:border-stone-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                  aria-label=${`Open ${record.title} in the archive`}
                >
                  <span className="mb-4 flex w-full items-center justify-between border-b border-stone-200 pb-2 font-body text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    <span>Folio ${entry.folio}</span>
                    <span>${entry.year} · ${entry.form}</span>
                  </span>
                  <span className="block font-display text-lg font-bold leading-tight text-stone-900">${record.title}</span>
                  <span className="mt-3 flex-grow font-body text-sm leading-relaxed text-stone-600">${entry.note}</span>
                  <span className="mt-4 inline-flex w-full items-center justify-between border-t border-stone-200 pt-4 font-body text-xs font-bold uppercase tracking-wider text-stone-800">
                    Open archive record
                    <${ArrowRight} className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </button>
              `)}
            </div>
          ` : html`
            <div className="border border-stone-200 bg-white p-6">
              <p className="font-body text-sm leading-relaxed text-stone-600">Curated records will appear here once the archive data has loaded. You can still search or browse the full collection now.</p>
              <div className="mt-4">${routeButton('archive', 'Browse the archive', Search)}</div>
            </div>
          `}
        </section>

        <section id="guide" aria-labelledby="guide-title" className="mb-16 scroll-mt-24">
          <details className="border border-stone-300 bg-white px-5 py-2 md:p-8">
            <summary className="cursor-pointer py-6 font-display text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
              <span className="block font-body text-xs font-bold uppercase tracking-wider text-stone-500">Complete visitor field guide · 7 sections</span>
              <span id="guide-title" tabIndex="-1" className="mt-1 block text-2xl font-bold outline-none">How to use the archive</span>
              <span className="mt-2 block font-body text-sm font-normal leading-relaxed text-stone-600">Expand for a practical reference to every way into the collection, plus archive terminology and problem reporting.</span>
            </summary>

            <div className="border-t border-stone-200">

          ${guideItem({
            id: 'guide-records',
            icon: Search,
            title: 'Records and search',
            children: html`<p>A record is the archive's basic unit: an article, post, interview, clipping, thread, or other item connected to Jay Rosen's work. Search looks across titles, summaries, and categories; filters help narrow the results by topic, era, year, publication, and format.</p><p>Open a record to read its summary, follow the original source, copy a citation, share it, or continue through related material.</p>`,
            action: routeButton('archive', 'Search records', Search)
          })}

          ${guideItem({
            id: 'guide-folders',
            icon: FolderOpen,
            title: 'Folders',
            children: html`<p>Folders are a visual way to enter the archive through its major subject categories. Choose one when you want a broad theme rather than a particular title or phrase.</p>`,
            action: routeButton('folders', 'Browse folders', FolderOpen)
          })}

          ${guideItem({
            id: 'guide-entities',
            icon: Network,
            title: 'Entities and connections',
            children: html`<p>The entity explorer indexes people, organizations, concepts, works, events, and locations mentioned across the collection. Use it to move from a name or idea to the records where it appears, then examine what frequently appears alongside it.</p>`,
            action: routeButton('entities', 'Explore entities', Network)
          })}

          ${guideItem({
            id: 'guide-dissertation',
            icon: BookOpen,
            title: 'The dissertation',
            children: html`<p><em>The Impossible Press: American Journalism and the Decline of Public Life</em>, Rosen's 1986 NYU dissertation, has its own reading and exploration tools. Read the full text or use the mind map to understand its structure and enduring questions.</p>`,
            action: routeButton('dissertation', 'Explore the dissertation', BookOpen)
          })}

          ${guideItem({
            id: 'guide-analytics',
            icon: BarChart3,
            title: 'Analytics',
            children: html`<p>The analytics dashboard shows the collection at a larger scale: output over time, recurring categories and concepts, frequently mentioned people, and other patterns. It is useful for forming a question before returning to individual records.</p>`,
            action: routeButton('analytics', 'View archive analytics', BarChart3)
          })}

          ${guideItem({
            id: 'guide-archive-vault',
            icon: Boxes,
            title: 'Internet Archive and Vault',
            children: html`<p>On PressThink, <strong>Internet Archive</strong> means this curated, searchable collection of records and connections. <strong>Vault (2003–present)</strong> refers to the older PressThink blog archive. The Vault preserves the blog's original chronology; this archive brings many kinds of material together and adds summaries, categories, entities, and research tools.</p>`
          })}

          ${guideItem({
            id: 'guide-reporting',
            icon: AlertCircle,
            title: 'Report a problem',
            children: html`<p>The collection is maintained over time. If a link is broken, a record is incomplete, or something looks incorrect, use the in-archive report form. Your report can include the record you were viewing and helps the curator investigate the problem.</p>`,
            action: html`
              <button
                type="button"
                onClick=${onOpenBugReport}
                className="inline-flex items-center justify-center gap-2 bg-stone-900 px-5 py-3 font-display text-sm font-bold text-white transition-colors hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
              >
                <${AlertCircle} className="h-4 w-4" aria-hidden="true" />
                Report an archive problem
              </button>
            `
          })}
            </div>
          </details>
        </section>

        <section aria-labelledby="continue-title" className="border border-stone-300 bg-white p-6 md:flex md:items-center md:justify-between md:gap-8 md:p-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-stone-500">
              <${Library} className="h-5 w-5" aria-hidden="true" />
              <span className="font-body text-xs font-bold uppercase tracking-wider">Continue exploring</span>
            </div>
            <h2 id="continue-title" className="font-display text-2xl font-bold text-stone-900">There is no required path through the archive.</h2>
            <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-stone-600">Search for something specific, browse a broad category, or follow the connections that catch your attention.</p>
          </div>
          <div className="mt-4 shrink-0">${routeButton('archive', 'Enter the archive', ArrowRight)}</div>
        </section>

        <div className="pb-4 pt-8 text-center">
          <button
            type="button"
            onClick=${onBack}
            className="inline-flex items-center gap-2 px-4 py-3 font-display text-sm font-bold text-stone-600 transition-colors hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            <${ArrowLeft} className="h-4 w-4" aria-hidden="true" />
            Back to archive
          </button>
        </div>
      </main>
    </div>
  `;
};

export default StartHerePage;
