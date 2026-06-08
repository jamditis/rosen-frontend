/**
 * OPML 2.0 Generator
 *
 * Generates OPML files from archive records, following Dave Winer's OPML spec.
 * http://opml.org/spec2.opml
 *
 * OPML (Outline Processor Markup Language) was created by Dave Winer at UserLand.
 * It's used for exchanging outlines, RSS subscription lists, and hierarchical data.
 */

/**
 * Convert ISO date to RFC 822 format
 */
function toRFC822(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  return d.toUTCString();
}

/**
 * Escape XML special characters
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate OPML 2.0 XML for archive structure
 *
 * @param {Object} options
 * @param {string} options.title - Document title
 * @param {string} options.ownerName - Document owner
 * @param {Array} options.records - Archive records
 * @param {Object} options.facets - Facets (categories, eras, etc.)
 * @param {string} options.baseUrl - Base URL for the archive
 * @returns {string} OPML 2.0 XML
 */
export function generateOPML({ title, ownerName, records, facets, baseUrl }) {
  const dateCreated = toRFC822(new Date().toISOString());

  // Group records by era
  const byEra = {};
  for (const era of (facets.eras || [])) {
    byEra[era] = records.filter(r => r.era === era);
  }

  // Group records by category
  const byCategory = {};
  for (const cat of (facets.categories || [])) {
    byCategory[cat] = records.filter(r => (r.categories || []).includes(cat));
  }

  // Build era outlines
  const eraOutlines = Object.entries(byEra)
    .filter(([era, recs]) => recs.length > 0)
    .map(([era, recs]) => {
      const items = recs.slice(0, 50).map(r => {
        const itemUrl = r.url && r.url.startsWith('http') ? r.url : `${baseUrl}${r.url || ''}`;
        return `        <outline text="${escapeXml(r.title)}" type="link" url="${escapeXml(itemUrl)}" created="${escapeXml(r.date)}"/>`;
      }).join('\n');
      return `      <outline text="${escapeXml(era)}" type="category">\n${items}\n      </outline>`;
    }).join('\n');

  // Build category outlines
  const categoryOutlines = Object.entries(byCategory)
    .filter(([cat, recs]) => recs.length >= 5)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20) // Top 20 categories
    .map(([cat, recs]) => {
      const items = recs.slice(0, 25).map(r => {
        const itemUrl = r.url && r.url.startsWith('http') ? r.url : `${baseUrl}${r.url || ''}`;
        return `        <outline text="${escapeXml(r.title)}" type="link" url="${escapeXml(itemUrl)}"/>`;
      }).join('\n');
      return `      <outline text="${escapeXml(cat)} (${recs.length})" type="category">\n${items}\n      </outline>`;
    }).join('\n');

  // Build RSS feeds outline
  const rssOutlines = `      <outline text="Main Feed" type="rss" xmlUrl="${baseUrl}/data/feeds/rss.xml"/>
      <outline text="Articles Only" type="rss" xmlUrl="${baseUrl}/data/feeds/articles.xml"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${escapeXml(title)}</title>
    <dateCreated>${dateCreated}</dateCreated>
    <dateModified>${dateCreated}</dateModified>
    <ownerName>${escapeXml(ownerName)}</ownerName>
    <docs>http://opml.org/spec2.opml</docs>
  </head>
  <body>
    <outline text="By Era">
${eraOutlines}
    </outline>
    <outline text="By Category">
${categoryOutlines}
    </outline>
    <outline text="RSS Feeds" type="include">
${rssOutlines}
    </outline>
  </body>
</opml>`;
}

/**
 * Generate OPML subscription list for RSS feeds
 *
 * @param {string} baseUrl - Base URL for the archive
 * @param {Object} feeds - Map of feed filenames
 * @returns {string} OPML 2.0 XML
 */
export function generateSubscriptionOPML(baseUrl, feeds) {
  const dateCreated = toRFC822(new Date().toISOString());

  const feedOutlines = Object.keys(feeds)
    .filter(name => name.endsWith('.xml'))
    .map(name => {
      let title = name.replace('.xml', '').replace(/[-_]/g, ' ');
      title = title.charAt(0).toUpperCase() + title.slice(1);

      if (name.includes('/')) {
        const parts = name.split('/');
        const folder = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        const feedName = parts[1].replace('.xml', '').replace(/[-_]/g, ' ');
        title = `${folder}: ${feedName.charAt(0).toUpperCase() + feedName.slice(1)}`;
      }

      return `    <outline text="${escapeXml(title)}" type="rss" xmlUrl="${baseUrl}/data/feeds/${name}"/>`;
    }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Jay Rosen Internet Archive - RSS Subscriptions</title>
    <dateCreated>${dateCreated}</dateCreated>
    <docs>http://opml.org/spec2.opml</docs>
  </head>
  <body>
${feedOutlines}
  </body>
</opml>`;
}

export default { generateOPML, generateSubscriptionOPML };
