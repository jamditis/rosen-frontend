# PRD: Interactive Network Graph Explorer

## Executive Summary
An interactive force-directed network graph visualization that allows users to explore relationships between entities (people, organizations, concepts, works) across the Jay Rosen Internet Archive. Users can click, drag, filter, and explore the interconnected web of journalism scholarship.

## Problem Statement
The archive contains 600+ records with potentially thousands of entities and relationships. Users need a way to:
- Understand connections between key figures in journalism (Jay Rosen, Jeff Jarvis, James Carey, etc.)
- See which organizations appear together in discussions
- Discover how Jay Rosen's concepts relate to specific people and institutions
- Explore the intellectual network of journalism criticism

## Goals & Success Metrics

### Primary Goals
1. **Discoverability**: Help users find unexpected connections between entities
2. **Comprehension**: Make complex relationship networks understandable at a glance
3. **Engagement**: Create an exploratory experience that encourages deep browsing
4. **Research Value**: Provide citation-quality insights into entity relationships

### Success Metrics
- Time on page > 3 minutes (high engagement)
- Entity clicks per session > 8 (active exploration)
- Filter usage rate > 60% (users finding specific insights)
- Share/citation rate (users finding value for their work)

## User Personas

### Journalism Researcher (Primary)
- **Needs**: Find all mentions of specific scholars, trace intellectual influences
- **Tech savvy**: Medium-high
- **Use case**: "Show me everyone Jay Rosen collaborated with on press criticism"

### Graduate Student (Primary)
- **Needs**: Understand the landscape of journalism studies concepts
- **Tech savvy**: Medium
- **Use case**: "How does 'View from Nowhere' connect to other scholars and institutions?"

### General Public (Secondary)
- **Needs**: Casual exploration, understanding media criticism
- **Tech savvy**: Medium
- **Use case**: "I want to see what this archive is about through its connections"

## Feature Requirements

### Core Visualization (P0 - Must Have)

#### Graph Layout
- **Force-directed layout** using D3.js force simulation
  - Nodes represent entities (People, Organizations, Concepts, Works, Events, Locations)
  - Edges represent relationships (Mentions, Cites, Discusses, Criticizes, etc.)
  - Node size scales with prominence/mention count
  - Edge thickness reflects relationship strength/frequency

#### Visual Design
- **Color coding by entity type**:
  - Person: Blue (#4A90E2)
  - Organization: Orange (#E27A3F)
  - Concept: Purple (#9B59B6)
  - Work: Green (#27AE60)
  - Event: Red (#E74C3C)
  - Location: Teal (#16A085)
- **Node labels**: Entity names (always visible for high-prominence entities)
- **Hover tooltips**: Full entity details + mention count
- **Click interaction**: Expand to show connected records

#### Pan & Zoom
- Mouse wheel zoom (10%-400% scale)
- Click-drag panning
- "Reset view" button to return to default layout
- Minimap in corner showing current viewport position

### Filtering & Search (P0 - Must Have)

#### Entity Type Filters
- Toggle visibility for each entity type (checkboxes)
- "Show only People" / "Show only Organizations" quick filters
- Maintain graph connectivity when filtering (don't isolate nodes)

#### Text Search
- Real-time search bar to highlight matching entities
- Search by: entity name, role, affiliation
- Highlighted results with zoom-to-focus

#### Relationship Type Filters
- Filter by relationship type: Mentions, Cites, Discusses, Criticizes, etc.
- "Show direct relationships only" vs "Show all connections"
- Minimum relationship strength slider

### Entity Details Panel (P0 - Must Have)

#### On Node Click
- Side panel slides in from right
- **Entity Information**:
  - Name, type, role/description, affiliation
  - Total mentions across archive
  - First mention (earliest record)
- **Connected Records** (scrollable list):
  - Record title, publication date, excerpt
  - Click to open full record in modal
- **Connected Entities** (top 10):
  - Entity name + relationship type
  - Click to jump to that entity in graph
- **"Explore from here" button**: Rebuilds graph centered on this entity

### Record Context (P1 - Should Have)

#### Record Linking
- Each relationship edge stores source record IDs
- Click edge to see "mentioned together in:"
  - List of records where both entities appear
  - Excerpt snippets showing co-mention context

#### "Show in archive" button
- From entity panel, link to main archive view filtered to records mentioning this entity

### Advanced Features (P2 - Nice to Have)

#### Graph Layouts
- Toggle between force-directed, hierarchical, circular layouts
- "Cluster by topic" using thematic_categories from records
- "Time-based" layout (older entities on left, newer on right)

#### Entity Grouping
- "Combine related entities" (e.g., "NYU" + "New York University")
- Show aggregate connections for entity clusters

#### Path Finding
- "Show shortest path between two entities"
- Interactive: click entity 1, shift-click entity 2 → highlight path

#### Export & Sharing
- Export graph as PNG/SVG
- Generate shareable URL with current filter state
- "Citation" button: Generate citation for specific entity network view

#### Temporal Filtering
- Slider to filter by publication date
- "Show network evolution over time" animation
- See how entity relationships grew/changed across decades

## Technical Architecture

### Frontend Stack
- **Visualization**: D3.js v7 (d3-force module)
- **Framework**: Vanilla JS or lightweight Vue.js component
- **UI Components**: Custom CSS with existing archive design tokens
- **Responsive**: Desktop-first, tablet-optimized, mobile-simplified view

### Data Pipeline
```
Google Sheets (extracted_entities + extracted_relationships)
    ↓
CSV export / Sheets API
    ↓
Data transformation script (Python or JS)
    ↓
Static JSON file (nodes + edges)
    ↓
D3.js force simulation
```

### Data Format
```json
{
  "nodes": [
    {
      "id": "P0001",
      "type": "Person",
      "name": "Jay Rosen",
      "role": "Professor of Journalism",
      "affiliation": "NYU",
      "prominence": 95,
      "mentions": 247,
      "first_mention": "PRESSTH-0001"
    }
  ],
  "edges": [
    {
      "source": "P0001",
      "target": "O0015",
      "type": "Affiliated With",
      "strength": 12,
      "records": ["PRESSTH-0001", "PRESSTH-0045", ...]
    }
  ]
}
```

### Performance Considerations
- **Initial load**: Limit to top 500 entities by prominence (lazy load rest)
- **Force simulation**: Cap at 1000 nodes for smooth interaction
- **Data updates**: Cache static JSON, rebuild weekly from Google Sheets
- **Progressive disclosure**: Load entity details on-demand via API

## User Flow

### Initial Landing
1. User arrives at `/network` page
2. Graph loads with top 100 entities (most prominent)
3. Animated force simulation settles over 2 seconds
4. Tooltip overlay: "Drag to explore • Click nodes for details • Use filters to focus"

### Exploration Flow
1. User searches for "Jay Rosen"
2. Graph highlights Jay Rosen node + connected entities
3. Camera zooms to focus on Jay Rosen's subgraph
4. User clicks Jay Rosen node
5. Side panel opens showing: 247 mentions, top connections, affiliated records
6. User clicks "New York University" connection
7. Graph re-centers on NYU, showing all NYU-related entities
8. User filters to "Show only People"
9. Graph shows only people connected to NYU
10. User clicks "Export view" → Downloads PNG of current graph state

### Mobile Simplified Flow
1. Graph loads with simplified layout (50 top entities)
2. Search-first interface (graph as background)
3. Tap entity → Full-screen detail view (no side panel)
4. "Show connections" button → Focused subgraph view

## Design Mockups

### Main View
```
┌─────────────────────────────────────────────────────────────┐
│ Jay Rosen Internet Archive          [Search entities...]  🔍 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Filters:                         [NETWORK GRAPH AREA]       │
│  ☑ People (152)                                              │
│  ☑ Organizations (87)                    ●─────●             │
│  ☑ Concepts (23)                        /│      │\           │
│  ☑ Works (45)                          ● ●     ● ●          │
│  ☑ Events (12)                          \│      │/           │
│  ☑ Locations (18)                        ●─────●             │
│                                                               │
│  Relationships:                    [Pan, zoom, drag nodes]   │
│  ─ All types ▼                                               │
│                                                               │
│  [Reset View]                           [Minimap: ▪︎ ]        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Entity Detail Panel
```
┌──────────────────────────────────┐
│  Jay Rosen                    [×]│
│  Professor of Journalism         │
│  New York University             │
│                                  │
│  👤 Person                       │
│  📊 247 mentions                 │
│  📅 First: PRESSTH-0001 (1999)  │
│                                  │
│  Top Connections (18 total):     │
│  ├─ New York University (87×)    │
│  ├─ Jeff Jarvis (45×)           │
│  ├─ James Carey (23×)           │
│  └─ View from Nowhere (67×)     │
│                                  │
│  Recent Mentions:                │
│  ├─ "The Church of the Savvy"   │
│  │   2023-04-15 • PRESSTH-0234  │
│  ├─ "Not the Odds but Stakes"   │
│  │   2023-02-01 • NATION-0089   │
│  └─ See all 247 records →       │
│                                  │
│  [Explore from here]             │
│  [Show in archive]               │
└──────────────────────────────────┘
```

## Implementation Phases

### Phase 1: MVP (2-3 weeks)
- [ ] Data export script (Google Sheets → JSON)
- [ ] Basic force-directed graph with D3.js
- [ ] Node coloring by entity type
- [ ] Click to show entity details
- [ ] Basic filtering (entity type toggles)
- [ ] Search by entity name

### Phase 2: Enhanced Exploration (1-2 weeks)
- [ ] Relationship type filtering
- [ ] Record context on edge click
- [ ] "Explore from here" re-centering
- [ ] Improved tooltips with full context
- [ ] Pan/zoom controls and minimap
- [ ] Export as PNG

### Phase 3: Advanced Features (2-3 weeks)
- [ ] Temporal filtering slider
- [ ] Alternative graph layouts
- [ ] Path finding between entities
- [ ] Mobile-optimized view
- [ ] Shareable URLs with filter state
- [ ] Weekly automated data updates

## Open Questions & Risks

### Questions
1. **Graph complexity**: How do we handle 1000+ entities without overwhelming users?
   - Proposed: Progressive disclosure with "Show more" expansion zones
2. **Entity disambiguation**: How to handle entities with same name?
   - Proposed: Include affiliation/role in tooltip for disambiguation
3. **Relationship directionality**: Should edges be directed (A→B) or undirected (A—B)?
   - Proposed: Directed for asymmetric relationships (Cites), undirected for symmetric (Mentions)

### Risks
- **Performance degradation**: Large graphs may be slow on older browsers
  - Mitigation: Implement WebGL fallback using sigma.js for 1000+ node graphs
- **Data quality**: Extracted entities may have errors/duplicates
  - Mitigation: Entity Registry already handles deduplication; manual review of top 100 entities
- **User confusion**: Complex interface may intimidate casual users
  - Mitigation: Interactive tutorial overlay on first visit, simplified mobile view

## Analytics & Measurement

### Key Metrics to Track
- **Engagement**: Time on page, nodes clicked, filters used
- **Discovery**: Unique entity views, cross-references followed
- **Value**: Export usage, citation generation, shares
- **Performance**: Page load time, graph render time, interaction lag

### A/B Testing Opportunities
- Default graph size (50 vs 100 vs 200 nodes)
- Color scheme effectiveness (entity type recognition)
- Panel layout (side panel vs modal vs bottom sheet)
- Label density (always visible vs hover-only)

## Accessibility

### Requirements
- Keyboard navigation (tab through nodes, enter to open details)
- Screen reader support (ARIA labels for all interactive elements)
- High contrast mode (increase edge visibility, thicker lines)
- Reduced motion mode (disable force simulation animation)
- Focus indicators (clear visual focus state for current node)

## Future Enhancements
- **3D graph view**: Using three.js for immersive exploration (research prototype)
- **Collaborative annotation**: Users can add notes to entity relationships
- **AI-powered insights**: "Similar to Jay Rosen" recommendations
- **Temporal animation**: Watch network evolve from 1999-2025
- **Subgraph extraction**: Create custom views focusing on specific topics
