
import { useMemo } from 'react';
import { html } from '../html.js?v=3.8.18';
import { ArrowLeft, ArrowRight, Archive, BookOpen, Network, Search, Github, Mail } from 'lucide-react';
import ArchiveRouteHeader from './ArchiveRouteHeader.js?v=3.8.18';

const AboutPage = ({ onBack, onStart, onParticipate, records }) => {

  // Calculate live stats from records
  const stats = useMemo(() => {
    if (!records || records.length === 0) return null;
    const years = records.map(r => r.year).filter(Boolean);
    const pubs = new Set(records.map(r => r.pub).filter(Boolean));
    const cats = new Set(records.flatMap(r => r.categories || []).filter(Boolean));
    const articles = records.filter(r => r.type !== 'social');
    const social = records.filter(r => r.type === 'social');
    return {
      total: records.length,
      articles: articles.length,
      social: social.length,
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      publications: pubs.size,
      categories: cats.size
    };
  }, [records]);

  return html`
    <div className="min-h-screen archive-canvas">
      <${ArchiveRouteHeader} onBack=${onBack} sectionTitle="About this archive" />

      <main className="container mx-auto px-4 py-12 max-w-3xl">

        <div className="archive-panel archive-panel--accent archive-density--spacious mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-stone-900 text-white p-2">
              <${Archive} className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1
              data-route-entry-focus
              tabIndex="-1"
              className="text-3xl md:text-5xl font-display font-bold text-stone-900 outline-none"
            >About this archive</h1>
          </div>
          <p className="text-lg text-stone-600 leading-relaxed font-body">
            Jay Rosen's Internet Archive is a curated public collection of the works, critiques, and teachings of Jay Rosen, professor of journalism at New York University. It preserves four decades of writing about journalism, democracy, and public life.
          </p>
          ${onStart && html`
            <button
              type="button"
              onClick=${onStart}
              className="archive-action archive-action--primary group mt-6"
            >
              Start here
              <${ArrowRight} className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </button>
          `}
          ${onParticipate && html`
            <button
              type="button"
              onClick=${onParticipate}
              className="archive-action archive-action--secondary group ml-0 mt-3 sm:ml-3 sm:mt-6"
            >
              Ways to participate
              <${ArrowRight} className="w-4 h-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </button>
          `}
        </div>

        <section
          id="privacy-and-browser-storage"
          aria-labelledby="privacy-and-browser-storage-title"
          tabIndex="-1"
          className="mb-12 scroll-mt-24"
        >
          <h2 id="privacy-and-browser-storage-title" className="text-2xl font-display font-bold text-stone-900 mb-4">Privacy and browser storage</h2>
          <div className="text-stone-700 leading-relaxed font-body space-y-4">
            <p>
              This archive does not use advertising or analytics cookies. It uses local storage, session storage, IndexedDB, and cache storage to cache archive data and remember choices such as the welcome tour, reader settings, and desktop layout.
            </p>
            <p>
              That browser storage stays on your device and can be cleared through your browser's site-data controls. Some fonts, code, and images come from third parties, including Google Fonts, esm.sh, and Unsplash; those services receive ordinary connection data such as your IP address. Embedded YouTube videos use YouTube's privacy-enhanced mode.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">About Jay Rosen</h2>
          <div className="max-w-none text-stone-700 leading-relaxed font-body space-y-4">
            <p>
              Jay Rosen has been a professor of journalism at New York University since 1986, when he completed his PhD dissertation, "The Impossible Press: American Journalism and the Decline of Public Life," under the supervision of Neil Postman. That dissertation argued that the phrase "the press informs the public" obscures more than it reveals, and that journalism's structural problems cannot be solved by professional standards alone.
            </p>
            <p>
              In the 1990s, Rosen became one of the leading advocates of public journalism (also called civic journalism), a movement that argued the press should help communities participate in democratic life rather than simply report on events. His 1999 book <em>What Are Journalists For?</em> remains the definitive account of that movement.
            </p>
            <p>
              Since 2003, Rosen has written the blog <a href="https://pressthink.org" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">PressThink</a>, where he has developed a body of criticism that includes key concepts like "the view from nowhere," "the people formerly known as the audience," "the church of the savvy," and "not the odds, but the stakes." These ideas have shaped how journalists, scholars, and the public think about the role of the press in democracy.
            </p>
            <p>
              His work spans articles, books, blog posts, lectures, interviews, and social media commentary across platforms including Twitter/X and Bluesky.
            </p>
          </div>
        </section>

        ${stats && html`
          <section className="mb-12">
            <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">Archive stats</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="archive-stat text-center">
                <div className="archive-stat__value">${stats.total.toLocaleString()}</div>
                <div className="archive-stat__label mt-1">Total records</div>
              </div>
              <div className="archive-stat text-center">
                <div className="archive-stat__value">${stats.articles.toLocaleString()}</div>
                <div className="archive-stat__label mt-1">Articles</div>
              </div>
              <div className="archive-stat text-center">
                <div className="archive-stat__value">${stats.social.toLocaleString()}</div>
                <div className="archive-stat__label mt-1">Social posts</div>
              </div>
              <div className="archive-stat text-center">
                <div className="archive-stat__value">${stats.minYear}–${stats.maxYear}</div>
                <div className="archive-stat__label mt-1">Date range</div>
              </div>
            </div>
            <p className="text-xs text-stone-500 mt-2">Stats are calculated live from the loaded archive data.</p>
          </section>
        `}

        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">What you can do here</h2>
          <div className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="archive-orientation-icon">
                <${Search} className="w-5 h-5 text-stone-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 mb-1">Browse and search records</h3>
                <p className="text-sm text-stone-600">Filter by category, era, content type, or keyword. Every record includes a summary, source link, and thematic tags.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="archive-orientation-icon">
                <${Network} className="w-5 h-5 text-stone-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 mb-1">Explore connections</h3>
                <p className="text-sm text-stone-600">The entity browser shows how records connect through shared people, organizations, and concepts, and lets you search by specific names and institutions.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="archive-orientation-icon">
                <${BookOpen} className="w-5 h-5 text-stone-600" aria-hidden="true" />
              </div>
              <div>
                <h3 className="font-bold text-stone-900 mb-1">Read the dissertation</h3>
                <p className="text-sm text-stone-600">Jay Rosen's 1986 PhD dissertation, "The Impossible Press," is available in full through the archive's dissertation reader, mind map, and FAQ.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">Methodology and sources</h2>
          <div className="text-stone-700 leading-relaxed font-body space-y-4">
            <p>
              Records were collected from public sources including PressThink, academic databases, the Wayback Machine, Twitter/X, Bluesky, and Tumblr. Each record was processed through a data pipeline that extracts metadata, generates summaries, assigns thematic categories, and identifies entities (people, organizations, and concepts).
            </p>
            <p>
              Entity extraction and relationship mapping were performed using the Gemini API, with results validated through automated quality checks and manual review. Categories and eras follow a controlled taxonomy designed to reflect the major themes and periods of Rosen's career.
            </p>
            <p>
              The archive is a static site with no server-side processing. All data is pre-generated and served as JSON files, making it fast and portable.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">Frequently asked questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-bold text-stone-900 mb-1">Who created this archive?</h3>
              <p className="text-sm text-stone-600">This archive was curated by <a href="https://github.com/jamditis" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">Joe Amditis</a>, associate director of operations at the Center for Cooperative Media at Montclair State University.</p>
            </div>
            <div>
              <h3 className="font-bold text-stone-900 mb-1">Is this an official NYU project?</h3>
              <p className="text-sm text-stone-600">No. This is an independent project created to preserve and make accessible the public works of Jay Rosen.</p>
            </div>
            <div>
              <h3 className="font-bold text-stone-900 mb-1">How can I report an error or suggest a correction?</h3>
              <p className="text-sm text-stone-600">Open an issue on the <a href="https://github.com/jamditis/rosen-frontend/issues" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">GitHub repository</a> or contact the curator directly.</p>
            </div>
            <div>
              <h3 className="font-bold text-stone-900 mb-1">Can I cite records from this archive?</h3>
              <p className="text-sm text-stone-600">Yes. Each record modal includes a citation copy button. The preferred format is: Author (Year). "Title". Publication. Retrieved from [archive URL].</p>
            </div>
            <div>
              <h3 className="font-bold text-stone-900 mb-1">Is the source code available?</h3>
              <p className="text-sm text-stone-600">Yes. The full codebase is open source at <a href="https://github.com/jamditis/rosen-frontend" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">github.com/jamditis/rosen-frontend</a>.</p>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-display font-bold text-stone-900 mb-4">Credits and contact</h2>
          <div className="archive-panel">
            <div className="space-y-3 text-sm text-stone-700">
              <p><strong>Archive curator:</strong> Joe Amditis</p>
              <p><strong>Subject:</strong> Jay Rosen, NYU Professor of Journalism</p>
              <p><strong>Hosted at:</strong> <a href="https://pressthink.org/j/rosen-archive/" target="_blank" rel="noreferrer" className="text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">pressthink.org/j/rosen-archive/</a></p>
              <div className="flex gap-4 pt-2">
                <a href="https://github.com/jamditis/rosen-frontend" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-stone-600 hover:text-stone-900 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
                  <${Github} className="w-4 h-4" aria-hidden="true" />
                  <span>GitHub</span>
                </a>
                <a href="mailto:jamditis@gmail.com" className="inline-flex items-center gap-1.5 text-stone-600 hover:text-stone-900 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">
                  <${Mail} className="w-4 h-4" aria-hidden="true" />
                  <span>Contact</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        <div className="text-center pb-8">
          <button
            type="button"
            onClick=${onBack}
            className="archive-action archive-action--primary"
          >
            <${ArrowLeft} className="w-4 h-4" aria-hidden="true" />
            Back to archive
          </button>
        </div>

      </main>
    </div>
  `;
};

export default AboutPage;
