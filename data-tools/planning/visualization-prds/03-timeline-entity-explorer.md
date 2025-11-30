# PRD: Timeline + Entity Visualization Explorer

## Executive Summary
A temporal-first exploration interface that reveals the archive through time, showing how entities, concepts, and topics emerged, evolved, and interconnected across Jay Rosen's 25+ year career. Users navigate a rich timeline visualization with entity filters to discover temporal patterns and historical context.

## Problem Statement
The archive spans from 1999 to 2025, covering major shifts in journalism (blogging era, social media, Trump presidency, platform journalism). Users need to:
- Understand when specific concepts emerged ("The Citizens' Agenda" vs "View from Nowhere")
- See how Jay Rosen's focus evolved across different eras
- Discover which entities dominated different time periods
- Trace the evolution of journalism criticism themes over decades

Current archive interfaces treat all content as temporally flat, missing crucial historical context.

## Goals & Success Metrics

### Primary Goals
1. **Temporal Discovery**: Help users find content by time period, not just keyword
2. **Pattern Recognition**: Surface trends in entity mentions and topic focus
3. **Historical Context**: Connect archive content to journalism history eras
4. **Narrative Building**: Enable users to construct temporal narratives from archive data

### Success Metrics
- **Timeline engagement**: >70% of users interact with timeline controls
- **Era-based browsing**: >40% of searches use era/date filters
- **Discovery rate**: Users find 3+ records outside their initial query via timeline exploration
- **Session depth**: Average 15+ records viewed per session (vs. 8 in list view)
- **Educational value**: >60% of users rate timeline as "helps me understand context"

## User Personas

### Journalism Historian (Primary)
- **Needs**: Understand how journalism criticism evolved across decades
- **Use case**: "Show me how 'objectivity' discussions changed from 2000s to 2020s"
- **Tech savvy**: Medium-high

### Graduate Student (Primary)
- **Needs**: Situate Jay Rosen's work within journalism history eras
- **Use case**: "What was Jay writing about during the 2016 election vs 2020?"
- **Tech savvy**: Medium

### Journalist/Media Professional (Secondary)
- **Needs**: Quick context on how issues evolved
- **Use case**: "When did Jay start discussing platform journalism?"
- **Tech savvy**: Medium

### Casual Browser (Tertiary)
- **Needs**: Interesting entry point to explore archive
- **Use case**: "I want to see what happened in journalism in the 2000s"
- **Tech savvy**: Low-medium

## Feature Requirements

### Core Timeline Visualization (P0 - Must Have)

#### Timeline Axis
- **Horizontal timeline**: 1999-2025 (full archive span)
- **Zoomable**: Decade view → Year view → Month view
- **Scroll/drag navigation**: Pan left/right through time
- **Era markers**: Vertical bands showing journalism history periods
  - Early Career & Public Journalism (1989-1999)
  - Rise of Web & Blogging (2000-2009)
  - Social Media & Platform Era (2010-2016)
  - Trump Era & Crisis in Trust (2017-2021)
  - Post-Trump & Future of News (2022-Present)

#### Record Markers
- **Dots/circles** on timeline representing individual records
- **Size**: Scaled by word count or importance (engagement, citations)
- **Color**: Coded by thematic_category or publication source
- **Clustering**: Dots group when zoomed out, expand when zoomed in
- **Hover tooltip**: Record title, date, excerpt preview

#### Density Visualization
- **Heatmap overlay**: Shows publication frequency over time
- **Color gradient**: Low (pale) to High (intense) activity
- **Identifies**: Periods of high output, gaps/quiet periods

### Entity Timeline Overlay (P0 - Must Have)

#### Entity Mention Streams
- **Swim lanes**: Horizontal lanes for top entities
- **Entity selection**: Choose up to 5 entities to display simultaneously
- **Mention markers**: Dots appear when entity is mentioned in a record
- **Line connections**: Connect entity mentions to record markers

#### Entity Lifecycle
- **First appearance**: Special marker for entity's first mention
- **Peak activity**: Highlight time periods with most mentions
- **Recent activity**: Show if entity still being discussed
- **Dormant periods**: Visual gaps showing when entity not discussed

#### Interactive Entity Controls
- **Entity search/autocomplete**: Type to add entity to timeline
- **Entity type filters**: Show all "People" or all "Concepts"
- **Top entities shortcuts**: Quick-add "Jay Rosen", "NYT", "View from Nowhere"
- **Remove entity**: Click X to clear entity from timeline
- **Entity legend**: Color key showing which lane represents which entity

### Content Panel (P0 - Must Have)

#### On Record Click
- **Side panel** (right side, 400px wide)
- **Record details**:
  - Title, publication date, source
  - Full excerpt (300 words)
  - Entities mentioned (clickable chips → add to timeline)
  - Key concepts, thematic categories
  - "Read full record" button → modal
- **"Show related"**: Highlight related records on timeline
- **Navigation arrows**: Previous/next record chronologically

#### On Entity Marker Click
- **Entity mention context**: Which record mentioned this entity
- **Context excerpt**: Text surrounding entity mention
- **"View all mentions"**: Link to Entity-Centric Explorer for this entity
- **Related entities**: Others mentioned in same record

### Filtering & Search (P0 - Must Have)

#### Date Range Selector
- **Slider** with dual handles (start date, end date)
- **Preset ranges**:
  - Last 5 years
  - 2016-2021 (Trump era)
  - 2000-2009 (Blogging era)
  - All time
- **Year input fields**: Type specific year range

#### Topic/Category Filter
- **Checkboxes** for thematic_categories:
  - Press & Media Criticism
  - Journalism Theory & Practice
  - Politics & Democracy
  - Technology & Digital Media
  - etc.
- **Multi-select**: Show records matching ANY selected category

#### Publication Source Filter
- **Dropdown** or checkbox list:
  - PressThink
  - Columbia Journalism Review
  - The Nation
  - etc.
- **"PressThink only" toggle**: Quick filter for Jay's blog

#### Keyword Search
- **Search box**: Filter timeline to records containing keyword
- **Entity name search**: Highlight mentions of specific entity
- **Concept search**: Filter to records discussing specific key_concepts

### Timeline Visualization Modes (P1 - Should Have)

#### Mode 1: Record-Centric (Default)
- Focus on individual records as primary elements
- Entity mentions secondary overlay

#### Mode 2: Entity-Centric
- Focus on entity swim lanes
- Records become background dots

#### Mode 3: Concept Evolution
- Track how key_concepts appear/spread over time
- Concept "birth" and "maturity" visualization
- Show concept co-occurrence networks evolving

#### Mode 4: Network-Over-Time
- Animated force-directed graph showing entity relationships
- Network changes as timeline advances
- Play button: Watch network evolve year by year

### Export & Sharing (P1 - Should Have)

#### Export Options
- **Timeline screenshot**: Download current view as PNG
- **Filtered records**: Export CSV of visible records
- **Temporal data**: JSON export with full date-range data

#### Shareable Links
- **URL encodes filter state**: Share exact timeline view
- **Embeddable widget**: Iframe-compatible timeline for blog posts
- **Citation**: Generate "As of [date range], Jay Rosen discussed..."

### Annotations & Storytelling (P2 - Nice to Have)

#### Historical Event Markers
- **Annotate timeline** with external events:
  - 9/11 attacks
  - Iraq War
  - Financial crisis (2008)
  - Trump election (2016)
  - COVID-19 pandemic (2020)
  - Jan 6 insurrection (2021)
- **Vertical annotation lines** with hover details
- **Context**: "How did Jay respond to this event?"

#### Curatorial Tours
- **Pre-built narratives**: "The Evolution of 'View from Nowhere'"
- **Step-through experience**: Timeline automatically pans/zooms
- **Captions**: Explanatory text for each step
- **User creation**: Allow users to save their own timeline tours

## Technical Architecture

### Frontend Stack
- **Timeline library**: D3.js v7 (time scales, axis, zoom behavior)
- **Alternative**: Vis.js Timeline (higher-level, easier to implement)
- **Framework**: Vue.js 3 for reactive state management
- **Charts**: Chart.js for supplementary visualizations (density heatmap)
- **Responsive**: Desktop primary, simplified mobile timeline

### Data Structure
```json
{
  "timeline_data": {
    "records": [
      {
        "id": "PRESSTH-0001",
        "title": "The Origins of PressThink",
        "date": "1999-03-15",
        "timestamp": 921456000000,
        "publication": "PressThink",
        "thematic_category": "Journalism Theory",
        "word_count": 2400,
        "entities": ["P0001", "O0015", "C0003"],
        "key_concepts": ["View from Nowhere"]
      }
    ],
    "entities": [
      {
        "id": "P0001",
        "name": "Jay Rosen",
        "type": "Person",
        "mentions": [
          {
            "record_id": "PRESSTH-0001",
            "date": "1999-03-15",
            "timestamp": 921456000000,
            "context": "...Jay Rosen argues that..."
          }
        ]
      }
    ],
    "eras": [
      {
        "name": "Rise of Web & Blogging",
        "start": "2000-01-01",
        "end": "2009-12-31",
        "color": "#4A90E2",
        "description": "The emergence of blogging as journalism"
      }
    ],
    "annotations": [
      {
        "date": "2016-11-08",
        "title": "Trump Elected President",
        "description": "Major shift in press coverage dynamics"
      }
    ]
  }
}
```

### Performance Optimization
- **Data chunking**: Load timeline data for current viewport only
- **Virtualization**: Render only visible markers (1000+ records)
- **Caching**: Browser caches static timeline JSON
- **Progressive loading**: Load record details on demand
- **Canvas rendering**: Use HTML5 Canvas for large datasets (10,000+ markers)

### URL State Management
```
/timeline?start=2010&end=2020&entities=P0001,O0015&categories=press-criticism&source=pressthink
```
- All filters encoded in URL
- Shareable, bookmarkable
- Back button support (Vue Router)

## User Flow

### Discovery Flow
1. User lands on `/timeline` page
2. Timeline renders showing all 600+ records (1999-2025)
3. Tooltip appears: "Drag to explore • Click records for details • Add entities to track"
4. User drags slider to zoom into 2016-2020 range
5. Timeline re-renders showing only records from Trump era
6. User sees density increase during 2016 election period
7. User clicks record marker from Nov 2016
8. Side panel opens: "Election Night and the Press"
9. User sees entities mentioned: "New York Times", "Washington Post"
10. User clicks "New York Times" chip
11. NYT entity lane appears on timeline showing all mentions
12. User observes NYT mentioned frequently during 2016-2020, less before

### Research Flow
1. User searches for "View from Nowhere" in entity search
2. "View from Nowhere" concept lane added to timeline
3. Markers show concept first appeared in 2003
4. User zooms to 2003-2010 to see early usage
5. User clicks first mention marker (2003)
6. Reads original "View from Nowhere" essay
7. User adds "Objectivity" concept to timeline
8. Sees both concepts co-occur frequently 2003-2015
9. Observes "Objectivity" discussions decline after 2016
10. User exports filtered records (2003-2015, both concepts) as CSV

### Storytelling Flow (Curatorial Tour)
1. User clicks "Featured Tour: The Church of the Savvy"
2. Timeline auto-zooms to 2011 (concept origin)
3. Caption appears: "In 2011, Jay Rosen coined 'Church of the Savvy'..."
4. Timeline highlights first mention
5. User clicks "Next" button
6. Timeline advances to 2012 showing concept spread
7. Caption: "Political journalists quickly adopted this framing..."
8. Tour continues through 5-7 key moments
9. User reaches end: "Save this tour" or "Create your own"

## Design Mockups

### Main Timeline View
```
┌──────────────────────────────────────────────────────────────────┐
│  Timeline Explorer                                    [Search]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Filters: [All Topics ▼] [All Sources ▼]            [Export ⬇]   │
│                                                                    │
│  Entity Lanes: [+ Add Entity]                                     │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Jay Rosen      ● ●  ●● ● ●   ●●●  ● ●    ●●●●●●● ●●●  ● ●    ││
│  │ NYT           ●   ● ●   ●  ●   ● ●● ● ●●●   ●● ●  ●  ●       ││
│  │ View from...        ●  ●   ●●  ●   ●     ●  ●  ●              ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                    │
│  Records:                                                          │
│  ▂▃▅▇██▇▅▃▂▁▂▃▅▇██▇▅▄▃▂▁▂▃▄▅▇█▇▅▃▂▁                                │
│  ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●                        │
│  ├────┼────┼────┼────┼────┼────┼────┼────┤                       │
│  1999 2002 2005 2008 2011 2014 2017 2020 2023                    │
│                                                                    │
│  Era: [Rise of Web]  [Social Media]  [Trump Era]  [Post-Trump]   │
│                                                                    │
│  Date Range: [1999] ═══════●═══════●═══════ [2025]               │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Detail Panel (After Click)
```
┌─────────────────────────────┐
│  The Church of the Savvy  [×]│
│  September 12, 2011          │
│  PressThink                  │
│                              │
│  "The Church of the Savvy is│
│  a quasi-religious sect that │
│  political journalists have  │
│  created. It demands that... │
│                              │
│  Entities mentioned:         │
│  • [Jay Rosen] • [NYT]      │
│  • [Political Journalism]   │
│                              │
│  Concepts:                   │
│  • Church of the Savvy      │
│  • Political Coverage       │
│                              │
│  [Read Full Record →]       │
│  [Show Related on Timeline] │
│                              │
│  ← Previous  |  Next →       │
└─────────────────────────────┘
```

### Mobile Simplified View
```
┌────────────────────────────┐
│  Timeline  [≡]             │
├────────────────────────────┤
│  [2010] ●═●═●═●═●═ [2020] │
│                            │
│  ▂▃▅▇█▇▅▃▂ Activity        │
│                            │
│  Showing: 47 records       │
│  [Filter ▼]                │
│                            │
│  ┌──────────────────────┐ │
│  │ Nov 8, 2016          │ │
│  │ Election Night...    │ │
│  │ [Tap for details →]  │ │
│  └──────────────────────┘ │
│  ┌──────────────────────┐ │
│  │ Sep 12, 2011         │ │
│  │ Church of Savvy...   │ │
│  └──────────────────────┘ │
│                            │
└────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Timeline (2-3 weeks)
- [ ] Data aggregation (Google Sheets → timeline JSON)
- [ ] Basic D3 timeline with date axis
- [ ] Record markers (dots) with hover tooltips
- [ ] Date range selector (slider)
- [ ] Click to open record detail panel
- [ ] Zoom/pan controls

### Phase 2: Entity Integration (2 weeks)
- [ ] Entity swim lane visualization
- [ ] Add/remove entity controls
- [ ] Entity mention markers
- [ ] Entity search/autocomplete
- [ ] Entity-to-record connection lines
- [ ] Entity legend/color key

### Phase 3: Enhanced Features (1-2 weeks)
- [ ] Era background bands
- [ ] Topic/source filtering
- [ ] Density heatmap overlay
- [ ] Export options (PNG, CSV)
- [ ] Shareable URLs with filter state
- [ ] Mobile-responsive simplified view

### Phase 4: Advanced Features (2-3 weeks)
- [ ] Historical event annotations
- [ ] Curatorial tours system
- [ ] Visualization mode switching
- [ ] Network-over-time animation
- [ ] Concept evolution tracking
- [ ] Embeddable timeline widget

## Open Questions & Risks

### Questions
1. **Timeline scale**: Should default view show all time or recent 5 years?
   - Proposed: All time with automatic zoom to recent activity
2. **Entity limit**: How many entities can users track simultaneously?
   - Proposed: Max 5 entities to prevent visual clutter
3. **Mobile experience**: Full timeline or list-first on mobile?
   - Proposed: Simplified timeline + filterable list view

### Risks
- **Performance**: 600 records × 15 entities/each = 9,000 data points
  - Mitigation: Canvas rendering, viewport-based loading
- **Visual complexity**: Too many entity lanes = overwhelming
  - Mitigation: Smart defaults (top 3 entities), progressive disclosure
- **Data freshness**: Timeline needs frequent updates as new records added
  - Mitigation: Automated weekly rebuild, "Last updated" indicator

## Analytics & Measurement

### Key Metrics
- **Timeline interactions**: Zoom, pan, drag usage
- **Entity additions**: Which entities most frequently added
- **Date range usage**: Popular time periods explored
- **Record clicks**: Click-through rate from timeline to records
- **Export usage**: How often users export timeline data

### A/B Testing
- Default zoom level (all time vs last 10 years)
- Entity lane density (3 vs 5 vs 10 entities)
- Record marker size (small vs medium vs large)
- Color schemes (topic-based vs source-based)

## Accessibility

- **Keyboard navigation**: Arrow keys to navigate timeline, Enter to open records
- **Screen reader**: Announce date ranges, entity counts, record titles
- **Focus indicators**: Clear visual focus for current timeline position
- **High contrast**: Increase marker visibility, thicker lines
- **Reduced motion**: Disable auto-zoom animations, smooth transitions

## Future Enhancements
- **AI narrative generation**: "During 2016-2020, Jay focused on..."
- **Comparative timelines**: Side-by-side timelines for entity comparison
- **Predictive suggestions**: "You might also explore this time period"
- **Real-time updates**: Live-updating timeline as new records added
- **Integration with external archives**: Show related journalism history events
