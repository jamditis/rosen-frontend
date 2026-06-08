/**
 * RSS 2.0 Feed Generator
 *
 * Generates RSS feeds from archive records, following Dave Winer's RSS 2.0 spec.
 * https://www.rssboard.org/rss-specification
 */

/**
 * Convert ISO date to RFC 822 format (required by RSS)
 * Example: "2025-12-15" -> "Mon, 15 Dec 2025 00:00:00 GMT"
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
 * Generate RSS 2.0 XML for a set of records
 *
 * @param {Object} options
 * @param {string} options.title - Feed title
 * @param {string} options.link - Feed homepage URL
 * @param {string} options.description - Feed description
 * @param {string} options.feedUrl - Self-referencing URL for this feed
 * @param {Array} options.records - Archive records to include
 * @param {number} options.limit - Max items (default 100)
 * @returns {string} RSS 2.0 XML
 */
export function generateRSS({ title, link, description, feedUrl, records, limit = 100 }) {
  const items = records.slice(0, limit);
  const lastBuildDate = toRFC822(new Date().toISOString());

  const itemsXml = items.map(record => {
    const pubDate = toRFC822(record.date);
    const categories = (record.categories || [])
      .map(cat => `    <category>${escapeXml(cat)}</category>`)
      .join('\n');

    // Use summary for description, fall back to title
    const desc = record.summary || record.title || '';

    // Build the item URL - use record.url if it's absolute, otherwise construct it
    let itemUrl = record.url || '';
    if (itemUrl && !itemUrl.startsWith('http')) {
      itemUrl = `${link}${itemUrl.startsWith('/') ? '' : '/'}${itemUrl}`;
    }

    return `  <item>
    <title>${escapeXml(record.title)}</title>
    <link>${escapeXml(itemUrl)}</link>
    <guid isPermaLink="true">${escapeXml(itemUrl)}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${escapeXml(desc)}</description>
${categories}
  </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(link)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>
    <generator>Jay Rosen Internet Archive RSS Generator</generator>
${itemsXml}
  </channel>
</rss>`;
}

/**
 * Generate multiple RSS feeds from archive records
 *
 * @param {Array} records - All archive records
 * @param {string} baseUrl - Base URL for the archive (e.g., "https://pressthink.org/j/rosen-archive")
 * @returns {Object} Map of filename -> RSS XML content
 */
export function generateAllFeeds(records, baseUrl) {
  const feeds = {};

  // Sort records by date (newest first)
  const sortedRecords = [...records].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '')
  );

  // 1. Main feed - 100 most recent items
  feeds['rss.xml'] = generateRSS({
    title: 'Jay Rosen Internet Archive',
    link: baseUrl,
    description: 'Archive of Jay Rosen\'s journalism scholarship, including articles, essays, social posts, and the 1986 dissertation "The Impossible Press"',
    feedUrl: `${baseUrl}/data/feeds/rss.xml`,
    records: sortedRecords,
    limit: 100
  });

  // 2. Articles only (exclude social posts)
  const articles = sortedRecords.filter(r => r.type === 'article' || r.type === 'Dissertation');
  feeds['articles.xml'] = generateRSS({
    title: 'Jay Rosen Internet Archive - Articles',
    link: baseUrl,
    description: 'Articles and essays from Jay Rosen\'s journalism scholarship',
    feedUrl: `${baseUrl}/data/feeds/articles.xml`,
    records: articles,
    limit: 100
  });

  // 3. Per-category feeds
  const categories = new Set();
  sortedRecords.forEach(r => (r.categories || []).forEach(c => categories.add(c)));

  for (const category of categories) {
    const categoryRecords = sortedRecords.filter(r =>
      (r.categories || []).includes(category)
    );

    if (categoryRecords.length >= 5) { // Only create feed if 5+ records
      const slug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
      feeds[`categories/${slug}.xml`] = generateRSS({
        title: `Jay Rosen Internet Archive - ${category}`,
        link: baseUrl,
        description: `Archive records in the "${category}" category`,
        feedUrl: `${baseUrl}/data/feeds/categories/${slug}.xml`,
        records: categoryRecords,
        limit: 50
      });
    }
  }

  // 4. Per-era feeds
  const eras = new Set(sortedRecords.map(r => r.era).filter(Boolean));

  for (const era of eras) {
    const eraRecords = sortedRecords.filter(r => r.era === era);
    const slug = era.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    feeds[`eras/${slug}.xml`] = generateRSS({
      title: `Jay Rosen Internet Archive - ${era}`,
      link: baseUrl,
      description: `Archive records from the ${era} era`,
      feedUrl: `${baseUrl}/data/feeds/eras/${slug}.xml`,
      records: eraRecords,
      limit: 50
    });
  }

  return feeds;
}

export default { generateRSS, generateAllFeeds };
