# Dave Winer Analysis: Applying His Principles to the Rosen Archive

## Who is Dave Winer?

Dave Winer (born 1955) is an American software developer, entrepreneur, and writer who has shaped the modern web in fundamental ways. He is credited with inventing or co-developing:

- **Outliners** (ThinkTank, 1983 - first popular "idea processor")
- **RSS** (Really Simple Syndication) - the web's syndication backbone
- **OPML** (Outline Processor Markup Language) - open format for structured data
- **Podcasting** - he added the `<enclosure>` element to RSS that enabled audio distribution
- **XML-RPC and SOAP** - early web services protocols
- **Textcasting** - his vision for the future of text publishing

His blog **Scripting News** (scripting.com), launched in 1997, is one of the web's oldest continuously running blogs, earning him titles like "protoblogger" and "forefather of blogging."

---

## The Winer-Rosen Connection

**This is crucial context:** Dave Winer and Jay Rosen have a deep, documented collaboration:

1. **Rebooting the News Podcast (2009-2011)** - A weekly podcast where Winer and Rosen discussed technology and innovation in journalism. Described as "My Dinner With Andre for online audio geeks."

2. **NYU Visiting Scholar (2010)** - Winer was named Visiting Scholar at NYU's Arthur L. Carter Journalism Institute, serving as Technical Adviser to **Studio 20**, the program Jay Rosen directs.

3. **Shared Philosophy** - Both are deeply invested in how technology can transform journalism and empower users. Rosen described Winer as "directly responsible for some of the disruptions that are shifting power to the users."

4. **First Meeting (2003)** - At Harvard's Berkman Center, where Winer was advocating for blogging in academia.

---

## Dave Winer's Core Principles

### 1. "Protocols Over Platforms"
Open standards (RSS, OPML, HTTP) that nobody owns are safer to build on than proprietary platforms. Google, Twitter, Facebook can change or disappear; the web endures.

### 2. User Control and Content Ownership
> "Users need a place to build and control their content before they post it to any service or platform that's controlled by an outside company."

Data should not be locked in proprietary silos. Users should own their work.

### 3. "Once Users Take Control, They Never Give It Back"
A 1994 principle that predicted the blogging revolution.

### 4. Simplicity ("Really Simple")
> "If you don't understand [a new technology] first off and it makes your mind go numb, you're safe to ignore it - it will never work."

The best technology is dead simple to understand and use.

### 5. Software as a Performing Art
> "Software isn't a thing, it isn't finished, it's a process as it gets invented by the users."

Ship, listen, iterate.

### 6. Interoperability as a Cornerstone
> "Interoperability, aka shared protocols, is one of the cornerstones of decentralization."

Different tools should work together through open standards.

### 7. "Create Tools for People with Ideas, Then Get Out of Their Way"
Design for empowerment, not dependency.

### 8. Future-Safe Archives
Content should be preserved in formats that will outlast any company or platform. Universities and institutions should help people "future-safe their content."

---

## Current Rosen Archive Alignment with Winer Principles

### Already Strong Alignment

| Principle | Current Implementation | Winer Alignment |
|-----------|----------------------|-----------------|
| **Zero-Build Static** | No npm/webpack required, plain JS + HTML | Excellent - simple, no dependencies |
| **Open Data Formats** | JSON, CSV for all data | Strong - portable, non-proprietary |
| **No Platform Lock-in** | Can deploy via FTP to any host | Excellent - true portability |
| **User Control** | Data in human-readable files | Good - inspectable, modifiable |
| **Simplicity** | ES Modules, CDN dependencies | Good - understandable stack |

### Gaps to Address

| Principle | Current Gap | Opportunity |
|-----------|-------------|-------------|
| **RSS/Syndication** | No RSS feed for archive | Add RSS feed of records |
| **OPML** | Not used | Structure data in OPML for outliners |
| **Textcasting** | Not implemented | Enable content to flow to other platforms |
| **Future-Safe Archives** | WordPress-dependent paths | Add platform-agnostic export |
| **Bidirectional Linking** | One-way links only | Enable inbound as well as outbound |

---

## Specific Recommendations

### 1. Add RSS Feed for the Archive

**Why Winer would care:** RSS is the backbone of open syndication. An archive without RSS is an island.

**Implementation:**
```
/data/feed.xml - Full archive RSS 2.0 feed
/data/feed-recent.xml - Last 50 items
/data/feed-by-era/*.xml - Era-specific feeds
```

**Benefits:**
- Users can subscribe in any feed reader
- Content automatically flows to aggregators
- Validates the archive as a living resource, not a static museum

### 2. Export Data in OPML Format

**Why Winer would care:** OPML is his format for structured, hierarchical data. Outliners are central to his philosophy.

**Implementation:**
```
/data/archive.opml - Full archive as outline
/data/dissertation.opml - Dissertation structure
/data/concepts.opml - Concept taxonomy
```

**Benefits:**
- Can be opened in Drummer, Fargo, or any outliner
- Preserves hierarchical relationships
- Winer literally invented this format

### 3. Implement a "Take Your Data" Export

**Why Winer would care:** User control means nothing if you can't leave with your data.

**Implementation:**
Add a "Download Archive" button that exports:
- `archive-export.json` - Complete data
- `archive-export.opml` - Outline format
- `archive-export.csv` - Spreadsheet format
- `README.txt` - How to use the data

### 4. Add "Textcasting" Support

**Why Winer would care:** This is his current passion project.

**Implementation:**
For each archive record, generate:
- Markdown version
- Plain text version
- Shareable snippet with proper attribution

Enable records to be easily shared to Mastodon, Bluesky, or any platform that supports text.

### 5. Create a "River of News" View

**Why Winer would care:** River5 is his RSS aggregator. The "river" is his preferred reading metaphor.

**Implementation:**
A chronological, scrolling feed view (alternative to the current card grid):
- Newest first
- No pagination, just scroll
- Quick skim of titles/summaries
- Click to expand

### 6. Add Changelog/Update Feed

**Why Winer would care:** He's blogged every day for 30 years. Continuous publishing is sacred.

**Implementation:**
```
/data/changelog.xml - RSS feed of archive updates
```

When new records are added or existing ones updated, publish to the changelog.

### 7. Enable Linkbacks/Pingbacks (Conceptually)

**Why Winer would care:** The web is about linking. Two-way links are better than one-way.

**Implementation:**
Track and display when archive records are cited elsewhere:
- "This piece has been cited by..."
- Could integrate with Internet Archive's availability API

### 8. Document the Data Schema Publicly

**Why Winer would care:** Open protocols require documentation.

**Implementation:**
Create `/data/schema.md` that fully documents:
- All fields in archive records
- Entity types and relationships
- How to extend the format

---

## Technical Recommendations Aligned with Winer's Stack

### Node.js Alignment
Winer uses Node.js for his tools (River5, PagePark, FeedLand). The Rosen archive already uses Node for the export script. Consider:

- **PagePark-style simplicity** - The current zero-build approach already matches this
- **Feed generation in Node** - Add RSS/OPML export to `export-archive-data.js`

### Add to `export-archive-data.js`:
```javascript
// Generate RSS feed
function generateRSSFeed(records) {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Jay Rosen Digital Archive</title>
    <link>https://pressthink.org/j/rosen-archive/</link>
    <description>Archive of Jay Rosen's journalism scholarship</description>
    ${records.slice(0, 100).map(r => `
    <item>
      <title>${escapeXml(r.title)}</title>
      <link>${r.url}</link>
      <pubDate>${new Date(r.date).toUTCString()}</pubDate>
      <description>${escapeXml(r.summary)}</description>
    </item>`).join('')}
  </channel>
</rss>`;
  return rss;
}

// Generate OPML
function generateOPML(records) {
  // Group by era/category for hierarchical outline
  // ...
}
```

---

## What Winer Would Likely Say About the Archive

### Positives He'd Appreciate:
1. **Static deployment** - No server dependency, just files
2. **JSON data** - Open, portable, readable
3. **FTP deployable** - Works anywhere
4. **No build step** - Understandable immediately
5. **The subject matter** - It's about journalism and public life

### Areas He'd Probe:
1. "Where's the RSS feed?" - First question, guaranteed
2. "Can I open this in an outliner?" - OPML compatibility
3. "What happens if WordPress goes away?" - Platform independence
4. "Can users take their data?" - Export capability
5. "How does this connect to the larger web?" - Syndication/linking

---

## Priority Implementation Order

**Before Winer Review (High Priority):**
1. Generate RSS feed from archive data
2. Add OPML export of archive structure
3. Document the data format publicly

**Medium Priority:**
4. Add "River of News" view option
5. Implement data export button
6. Create changelog feed

**Lower Priority (Nice to Have):**
7. Textcasting/sharing features
8. Linkback tracking
9. Outliner-native editing tools

---

## Quotes to Keep in Mind

> "Once the users take control, they never give it back." - Dave Winer, 1994

> "The web needed to be writeable, not just readable." - On the blogging revolution

> "Create tools for the people with the ideas and then get out of their way." - On OPML

> "It's really all about getting enough people to do something the same way so that a new medium emerges." - On standards

> "Interoperability, aka shared protocols, is one of the cornerstones of decentralization." - On the open web

---

## Sources

- [Dave Winer - Wikipedia](https://en.wikipedia.org/wiki/Dave_Winer)
- [Dave Winer's Blog - Scripting News](http://scripting.com/)
- [Dave Winer GitHub](https://github.com/scripting)
- [Rebooting The News Podcast](https://rebootnews.wordpress.com/)
- [Dave Winer, Welcome to NYU - Rebooting The News](https://rebootnews.wordpress.com/2010/01/14/dave-winer-welcome-to-nyu-visiting-scholar-technical-adviser/)
- [Nieman Lab - Rebooting the News](https://www.niemanlab.org/2009/04/rebooting-the-news-dave-winer-and-jay-rosen-talk-about-saving-journalism/)
- [Dave Winer's 30 Years of Blogging - Dan Gillmor](https://dangillmor.com/2024/10/15/dave-winers-30-years-of-blogging-and-much-more/)
- [The Rise and Demise of RSS - Two-Bit History](https://twobithistory.org/2018/12/18/rss.html)
- [The Future of RSS is Textcasting - Kottke](https://kottke.org/23/11/the-future-of-rss-is-textcasting-1)
- [Dave Winer on Decentralisation - WP Tavern Podcast](https://wptavern.com/podcast/186-dave-winer-on-decentralisation-wordpress-and-open-publishing)
- [Archiving Ourselves - Salon](https://www.salon.com/2010/11/05/archiving_ourselves/)
- [Internet History Podcast - Dave Winer](https://www.internethistorypodcast.com/2017/10/dave-winer-on-the-open-web-blogging-podcasting-and-more/)

---

*Document generated: January 31, 2026*
*For the Jay Rosen Digital Archive project*
