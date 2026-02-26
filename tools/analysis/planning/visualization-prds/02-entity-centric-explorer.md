# PRD: Entity-Centric Record Explorer

## Executive Summary
A focused interface that inverts the traditional archive browsing experience: instead of browsing records to find mentions of entities, users start with an entity and discover all archive records that mention it. This creates entity "profile pages" showing complete provenance across the archive.

## Problem Statement
Traditional archive interfaces force users to manually search through hundreds of records to find all mentions of a specific person, organization, or concept. Users need:
- A comprehensive view of every mention of "Jeff Jarvis" across 600+ records
- To see how Jay Rosen's discussion of "View from Nowhere" evolved over time
- To track which organizations (NYT, Washington Post, etc.) appear in which contexts
- To understand the full arc of a concept's usage throughout the archive

## Goals & Success Metrics

### Primary Goals
1. **Completeness**: Show 100% of entity mentions with zero manual searching
2. **Context**: Provide rich context for each mention (excerpt, date, related entities)
3. **Temporal Understanding**: Reveal how entity discussions evolved over 25+ years
4. **Research Efficiency**: Reduce entity research time from hours to minutes

### Success Metrics
- **Coverage**: 100% of entity mentions surfaced (vs. keyword search ~60-70%)
- **Research time savings**: 80% reduction in time to compile entity bibliography
- **User satisfaction**: >4.5/5 rating from researcher persona
- **Citation usage**: >40% of users use "Export citations" feature

## User Personas

### Academic Researcher (Primary)
- **Needs**: Comprehensive entity mentions for literature review, dissertation research
- **Pain points**: Manual searching misses variations ("NYU" vs "New York University")
- **Use case**: "I need every mention of James Carey to understand his influence on Rosen's work"

### Journalist (Secondary)
- **Needs**: Quickly understand Jay Rosen's stance on specific topics/people
- **Pain points**: Need context, not just keyword matches
- **Use case**: "What has Jay Rosen said about The New York Times over the years?"

### Archivist/Curator (Tertiary)
- **Needs**: Quality control, completeness verification for entity extraction
- **Pain points**: Need to audit AI extraction accuracy
- **Use case**: "Are we capturing all variants of 'Washington Post' correctly?"

## Feature Requirements

### Core Entity Profile (P0 - Must Have)

#### Entity Header
- **Entity name** (large, prominent typography)
- **Entity type badge** (Person/Organization/Concept/Work/Event/Location)
- **Role/Description** (e.g., "Professor of Journalism")
- **Affiliation** (e.g., "New York University")
- **Prominence score** (visual bar: 1-100 scale)
- **Total mentions** (big number: "247 mentions across 156 records")
- **First/Last mention dates** (temporal span)
- **Entity ID** (small, bottom-right, for research citation)

#### Key Statistics Panel
- **Mention frequency over time** (sparkline chart)
- **Top co-occurring entities** (5 most frequent)
- **Primary topics** (thematic_categories from records mentioning this entity)
- **Era distribution** (which historical eras this entity appears in)

### Mentions Timeline (P0 - Must Have)

#### Chronological List
- All records mentioning this entity, sorted by publication_date (newest first)
- Sortable: Newest, Oldest, Most Relevant, Most Related

#### Record Card (for each mention)
- **Record title** (clickable → opens full record modal)
- **Publication date** (MM/DD/YYYY)
- **Publication source** (e.g., "PressThink", "Columbia Journalism Review")
- **Context excerpt** (150 chars showing entity mention in context)
  - Entity name highlighted in yellow
- **Relationship type** (if applicable: "Cites", "Discusses", "Criticizes")
- **Related entities mentioned** (up to 5 entity chips)
- **Record tags** (key_concepts, thematic_categories)
- **"Read full record" button**

#### Timeline Visualization
- Visual timeline showing mention density over years
- Interactive: click year → filter to that year's mentions
- Annotated with significant events/eras

### Related Entities Network (P0 - Must Have)

#### Co-Occurrence Grid
- **Top 20 co-occurring entities** ranked by frequency
- Visual: Entity name + mention count + small bar chart
- Clickable: Click entity → navigate to that entity's profile
- **Relationship type filter**: Show only specific relationship types

#### Relationship Context
- For each related entity, show:
  - How many records mention both entities
  - Primary relationship type (most common)
  - Sample excerpt showing the relationship
  - "See all connections →" link

### Filtering & Refinement (P1 - Should Have)

#### Date Range Filter
- Slider: 1999–2025 (or archive's date range)
- Presets: "Last 5 years", "2000s", "2010s", "All time"
- Updates both mention list and statistics

#### Publication Filter
- Checkboxes for each publication source
- "Show only PressThink" / "Show only academic publications"
- Retains all other filters

#### Topic Filter
- Filter by thematic_categories (Press & Media Criticism, etc.)
- Filter by key_concepts (View from Nowhere, etc.)
- Filter by era (Early Career, Digital Media Era, etc.)

#### Relationship Type Filter
- "Mentions only" vs "Cites" vs "Discusses" vs "Criticizes"
- Multiple selection allowed

### Export & Citation (P1 - Should Have)

#### Export Options
- **CSV export**: All mentions with full metadata
- **BibTeX export**: Formatted citations for academic use
- **JSON export**: Raw data for computational analysis
- **PDF report**: Entity profile summary + mentions list

#### Citation Generation
- **Per-entity citation**: "Rosen, Jay. Mentions across Jay Rosen Internet Archive."
- **Per-mention citation**: Auto-generate MLA/APA/Chicago for each record
- **Copy to clipboard** quick action

### Search Within Entity (P2 - Nice to Have)

#### Full-Text Search
- Search within all records mentioning this entity
- Highlight matching terms in excerpts
- "X results in Y records"

#### Advanced Filters
- Exclude certain publications
- Require co-mention of specific entities
- Sentiment filter (if entity discussed positively/critically)

### Entity Comparison (P2 - Nice to Have)

#### Side-by-Side View
- Compare two entities (e.g., "Jeff Jarvis" vs "Clay Shirky")
- Shared mentions, unique mentions, temporal overlap
- Venn diagram visualization

## Technical Architecture

### Frontend Stack
- **Framework**: Vue.js 3 (reactive entity profiles)
- **Routing**: Vue Router (SEO-friendly URLs: `/entity/P0001`)
- **Charts**: Chart.js for timelines and statistics
- **UI**: Existing archive design system + new entity-specific components

### Data Pipeline
```
Google Sheets (extracted_entities + extracted_relationships + test_runs)
    ↓
Data aggregation script (Python)
    ↓
Pre-computed entity profiles (static JSON per entity)
    ↓
Frontend loads entity/{id}.json
    ↓
Vue renders profile + mentions + related entities
```

### Entity Profile Data Structure
```json
{
  "entity_id": "P0001",
  "entity_name": "Jay Rosen",
  "entity_type": "Person",
  "role": "Professor of Journalism",
  "affiliation": "New York University",
  "prominence_score": 95,
  "statistics": {
    "total_mentions": 247,
    "unique_records": 156,
    "first_mention": {
      "record_id": "PRESSTH-0001",
      "date": "1999-03-15",
      "title": "The Origins of PressThink"
    },
    "last_mention": {
      "record_id": "PRESSTH-0785",
      "date": "2025-01-08",
      "title": "Future of Journalism Education"
    },
    "mentions_by_year": {
      "1999": 3,
      "2000": 12,
      "2001": 18,
      ...
    },
    "mentions_by_publication": {
      "PressThink": 145,
      "Columbia Journalism Review": 23,
      "The Nation": 8,
      ...
    }
  },
  "related_entities": [
    {
      "entity_id": "O0015",
      "entity_name": "New York University",
      "co_mentions": 87,
      "primary_relationship": "Affiliated With"
    },
    {
      "entity_id": "P0045",
      "entity_name": "Jeff Jarvis",
      "co_mentions": 45,
      "primary_relationship": "Discusses"
    }
  ],
  "mentions": [
    {
      "record_id": "PRESSTH-0234",
      "title": "The Church of the Savvy Revisited",
      "publication_date": "2023-04-15",
      "publication": "PressThink",
      "excerpt": "...Jay Rosen's concept of the 'Church of the Savvy' describes...",
      "relationship_type": "Mentions",
      "related_entities_in_record": ["C0003", "O0012"],
      "tags": ["journalism", "media criticism", "political coverage"]
    }
  ]
}
```

### URL Structure
- `/entity/{entity_id}` - Main entity profile
- `/entity/{entity_id}?year=2020` - Filtered to specific year
- `/entity/{entity_id}?publication=pressthink` - Filtered to specific publication
- `/entity/compare?a={id1}&b={id2}` - Entity comparison view

### Performance Optimization
- **Pre-computation**: Generate static JSON for all entities weekly
- **Lazy loading**: Load mentions in batches of 50 (infinite scroll)
- **Caching**: Browser caches entity profiles for 24 hours
- **CDN**: Serve static entity JSONs from CDN

## User Flow

### Discovery Flow
1. User arrives via:
   - Link from network graph (click entity node)
   - Main archive search (click entity chip)
   - Direct URL (`/entity/P0001`)
   - Entity directory page (browse all entities)
2. Entity profile loads (header + statistics)
3. Mentions list loads (first 50 records)
4. User scrolls → infinite load next 50

### Research Flow
1. User searches for "Jeff Jarvis" in entity directory
2. Clicks "Jeff Jarvis - Journalist, Author" result
3. Sees: 67 mentions across 45 records, 1999-2024
4. Filters to "2010s" using date slider
5. Sees 34 mentions from 2010-2019
6. Clicks record "PRESSTH-0456: The Future of News Orgs"
7. Record modal opens showing full content
8. User clicks "Related: Clay Shirky" chip in modal
9. Navigates to Clay Shirky's entity profile
10. Clicks "Compare with Jeff Jarvis"
11. Side-by-side comparison shows shared vs unique mentions

### Export Flow
1. User on "New York University" entity profile
2. Filters to "Press & Media Criticism" topic
3. Sees 45 filtered mentions
4. Clicks "Export" button
5. Selects "CSV" format
6. Downloads `new-york-university-mentions-filtered.csv`
7. Opens in spreadsheet software for further analysis

## Design Mockups

### Entity Profile Header
```
┌──────────────────────────────────────────────────────────────┐
│  Jay Rosen Internet Archive                        [Search]   │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  👤 Person                                          ID: P0001  │
│  Jay Rosen                                                     │
│  Professor of Journalism • New York University                 │
│                                                                │
│  Prominence: ████████████████████████░ 95/100                 │
│                                                                │
│  ┌────────────┬────────────┬────────────┬────────────┐       │
│  │  247       │  156       │  1999      │  2025      │       │
│  │  Mentions  │  Records   │  First     │  Last      │       │
│  └────────────┴────────────┴────────────┴────────────┘       │
│                                                                │
│  Mentions over time:  ▁▂▃▅▇▇▆▅▄▃▃▂▂▃▄▅▆▇▆▅▄▃▂ →                │
│                                                                │
│  Top co-occurring entities:                                   │
│  • New York University (87×)  • Jeff Jarvis (45×)            │
│  • View from Nowhere (67×)    • James Carey (23×)            │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Mentions List
```
┌──────────────────────────────────────────────────────────────┐
│  Filters:  [All Time ▼] [All Publications ▼] [All Topics ▼] │
│            Sort by: [Newest First ▼]           [Export CSV]  │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  247 mentions found                                            │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ The Church of the Savvy Revisited                      │  │
│  │ April 15, 2023 • PressThink                            │  │
│  │                                                         │  │
│  │ "...Jay Rosen's concept of the 'Church of the Savvy'  │  │
│  │ describes how political journalists prioritize..."      │  │
│  │                                                         │  │
│  │ Related: [Church of Savvy] [Political Coverage]       │  │
│  │          [NYT] [Washington Post]                       │  │
│  │                                                         │  │
│  │                               [Read full record →]      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Not the Odds but the Stakes                            │  │
│  │ February 1, 2023 • The Nation                          │  │
│  │ ...                                                     │  │
│                                                                │
│  [Load more (197 remaining)]                                  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Entity Directory (Entry Point)
```
┌──────────────────────────────────────────────────────────────┐
│  Entity Directory                              [Search...]    │
│                                                                │
│  Filters: [People] [Organizations] [Concepts] [Works]        │
│           [Events] [Locations]                                │
│                                                                │
│  Sort by: [Most Mentions ▼]                                   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 👤 Jay Rosen                              247 mentions  │ │
│  │    Professor of Journalism • NYU                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 🏢 New York University                    134 mentions  │ │
│  │    Educational Institution                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 💡 View from Nowhere                       89 mentions  │ │
│  │    Journalism Concept                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Profile (2 weeks)
- [ ] Data aggregation script (Google Sheets → entity JSON files)
- [ ] Entity profile page component (Vue)
- [ ] Header with statistics
- [ ] Chronological mentions list with pagination
- [ ] Basic filtering (date range)
- [ ] Entity directory/index page

### Phase 2: Enhanced Features (1-2 weeks)
- [ ] Related entities section
- [ ] Publication and topic filters
- [ ] Timeline visualization (Chart.js)
- [ ] Export to CSV/BibTeX
- [ ] Search within entity
- [ ] Mobile-responsive design

### Phase 3: Advanced Features (2 weeks)
- [ ] Entity comparison view
- [ ] Full-text search within mentions
- [ ] Advanced filtering (sentiment, exclude)
- [ ] PDF report generation
- [ ] Shareable filtered URLs
- [ ] Analytics tracking

## Open Questions & Risks

### Questions
1. **Excerpt generation**: Should we show AI-generated excerpts or exact text windows?
   - Proposed: Exact text windows (150 chars before/after entity mention)
2. **Entity disambiguation**: How to handle entities with same name (e.g., multiple "John Smith")?
   - Proposed: Use role/affiliation in entity name display
3. **Update frequency**: How often to regenerate entity profiles?
   - Proposed: Weekly automated rebuild, on-demand for new extractions

### Risks
- **Data staleness**: Entity profiles static, may not reflect latest extractions
  - Mitigation: Show "Last updated" timestamp, daily automated rebuilds
- **Large entity profiles**: Some entities (Jay Rosen) may have 200+ mentions
  - Mitigation: Pagination (50 per page), lazy loading, performance testing
- **Missing context**: Raw excerpts may not capture relationship nuance
  - Mitigation: Include relationship type, allow click-through to full record

## Analytics & Measurement

### Key Metrics
- **Entity profile views** (top 20 most viewed entities)
- **Mention click-through rate** (% of users who open full records)
- **Filter usage** (most common filter combinations)
- **Export usage** (CSV vs BibTeX vs PDF)
- **Time on entity page** (indicator of research depth)

### Success Indicators
- Academic researchers cite specific entity profiles in papers
- Users report finding mentions they missed with keyword search
- Average session time > 5 minutes (deep engagement)

## Accessibility

- **Keyboard navigation**: Tab through mentions, Enter to expand
- **Screen reader**: Announce entity type, mention count, publication dates
- **Focus indicators**: Clear visual focus for current mention card
- **High contrast mode**: Increase text contrast, highlight borders
- **Reduced motion**: Disable timeline animations

## Future Enhancements
- **AI-generated entity summaries**: "Jay Rosen is most known for..."
- **Entity evolution tracking**: How entity role/description changed over time
- **Collaborative annotations**: Users can add notes to entity profiles
- **Entity alerts**: Email notifications when new mentions appear
- **Cross-archive integration**: Link to mentions in other digital archives
