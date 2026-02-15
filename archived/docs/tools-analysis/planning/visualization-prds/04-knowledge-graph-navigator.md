# PRD: Knowledge Graph Navigation System

## Executive Summary
A multi-faceted, interconnected exploration system that treats the archive as a living knowledge graph. Users can navigate seamlessly between records, entities, concepts, topics, and relationships using a unified interface that reveals the deep structure of journalism criticism discourse.

## Problem Statement
Current archive interfaces force users into single-mode exploration:
- Search by keyword (misses conceptual connections)
- Browse chronologically (misses thematic connections)
- Filter by topic (misses entity relationships)

Users need a **unified navigation system** that lets them:
- Start with a concept and find related entities, then their records
- Start with a person and discover their conceptual contributions
- Navigate from record → entities → related records → concepts
- Discover unexpected connections across all dimensions

## Goals & Success Metrics

### Primary Goals
1. **Multi-dimensional Discovery**: Enable exploration across concepts, entities, topics, and time
2. **Contextual Navigation**: Show why connections matter (not just that they exist)
3. **Serendipitous Learning**: Users discover valuable content they didn't know to search for
4. **Research Depth**: Support both casual browsing and deep scholarly investigation

### Success Metrics
- **Cross-navigation rate**: >80% of users navigate beyond their entry point type
- **Discovery diversity**: Average session touches 3+ navigation dimensions (concept/entity/topic/time)
- **Path depth**: Average 6+ navigation steps per session
- **Return visits**: >50% of users return within 7 days
- **Research value**: >70% of researchers rate as "essential" or "very valuable"

## User Personas

### Interdisciplinary Researcher (Primary)
- **Needs**: Navigate complex conceptual territory without predetermined path
- **Use case**: "I'm studying 'objectivity' but want to see who Jay discusses it with and what broader topics connect"
- **Tech savvy**: Medium-high

### Dissertation Student (Primary)
- **Needs**: Build comprehensive understanding of topic landscape
- **Use case**: "Map out all of Jay's work on platform journalism—concepts, key figures, influential pieces"
- **Tech savvy**: Medium

### Journalist/Practitioner (Secondary)
- **Needs**: Quick answers that lead to deeper context
- **Use case**: "What does Jay say about NYT? Who else does he discuss in that context? What concepts?"
- **Tech savvy**: Medium

### Curious Browser (Tertiary)
- **Needs**: Follow interesting connections wherever they lead
- **Use case**: "I started with 'View from Nowhere' and want to see where the rabbit hole goes"
- **Tech savvy**: Low-medium

## Feature Requirements

### Core Navigation Hub (P0 - Must Have)

#### Unified Search/Entry Point
- **Omnibox search**: Single search bar finds everything
  - Records (by title, excerpt, content)
  - Entities (people, organizations, concepts, works)
  - Topics (thematic_categories, key_concepts)
  - Tags (all archive tags)
- **Type-ahead suggestions**: Categorized by type as you type
- **"I'm looking for..."** prompt examples:
  - "View from Nowhere" → Concept
  - "Jeff Jarvis" → Person
  - "Press & Media Criticism" → Topic
  - "The Church of the Savvy" → Record or Concept

#### Current Context Panel
- **Breadcrumb trail**: Shows navigation path
  - Example: `Home > Concept: View from Nowhere > Person: Jay Rosen > Record: PRESSTH-0234`
- **Context indicator**: Bold text showing current node type and name
- **"Where am I?"** helper text explaining current view
- **Back button**: Return to previous node
- **Home reset**: Clear trail and return to entry point

### Node Detail Views (P0 - Must Have)

#### Record Node
- **Full record details** (title, date, publication, content)
- **Connections panel**:
  - **Entities mentioned**: Clickable chips → Entity nodes
  - **Concepts discussed**: Clickable chips → Concept nodes
  - **Topics/categories**: Clickable tags → Topic nodes
  - **Related records**: Based on responds_to/related_to fields
- **Navigation actions**:
  - "Explore entities in this record" (→ Entity list view)
  - "See related conversations" (→ Related records)
  - "View temporal context" (→ Timeline centered on this date)

#### Entity Node
- **Entity profile** (name, type, role, affiliation, prominence)
- **Connections panel**:
  - **Records mentioning this entity**: Chronological list
  - **Related entities**: Co-occurring entities
  - **Concepts this entity discusses**: From entity-to-concept relationships
  - **Topics this entity appears in**: Thematic grouping
- **Navigation actions**:
  - "Browse all mentions" (→ Entity-Centric Explorer)
  - "See relationship network" (→ Network Graph centered on entity)
  - "Timeline of mentions" (→ Timeline with entity filter)

#### Concept Node
- **Concept definition** (Jay Rosen's journalism concepts or general themes)
- **Connections panel**:
  - **Records discussing this concept**: All mentions
  - **Entities who discuss it**: People/orgs associated
  - **Related concepts**: Co-occurring or derivative concepts
  - **Temporal evolution**: How concept usage changed over time
- **Navigation actions**:
  - "Explore concept evolution" (→ Timeline with concept filter)
  - "See who discusses this" (→ Entity list filtered by concept)
  - "Find related concepts" (→ Concept network subgraph)

#### Topic Node (Thematic Category)
- **Topic description** (what this category encompasses)
- **Connections panel**:
  - **All records in this topic**: Complete listing
  - **Key entities in this topic**: Most prominent
  - **Key concepts in this topic**: Most frequent
  - **Subtopics/tags**: Finer-grained classification
- **Navigation actions**:
  - "Browse topic timeline" (→ Timeline filtered to topic)
  - "See topic entity network" (→ Network graph, topic-filtered)
  - "Compare with other topics" (→ Topic comparison view)

### Connection Strength Indicators (P0 - Must Have)

#### Visual Cues
- **Connection count badges**: "Mentioned together 45 times"
- **Relationship type labels**: "Cites", "Discusses", "Criticizes"
- **Strength bars**: Visual indicator of connection intensity
- **Confidence scores**: AI extraction confidence (if available)

#### Sorting & Prioritization
- **Sort connections by**:
  - Frequency (most mentions first)
  - Recency (newest first)
  - Relevance (semantic similarity to current context)
  - Importance (prominence score)
- **"Top connections" shortcut**: Show only strongest 10 connections

### Multi-Path Navigation (P1 - Should Have)

#### Parallel Paths
- **"Also explore"** sidebar: Alternative navigation paths from current node
- **"Related starting points"**: Other entry points for similar exploration
- **"Frequently followed"**: Popular navigation paths from current node

#### Path Recommendations
- **AI-suggested next steps**: "Users exploring this also looked at..."
- **Conceptual bridges**: "Connect to related topics via..."
- **Temporal jumps**: "See how this evolved in [earlier/later period]"

#### Path Visualization
- **Navigation map**: Visual diagram showing your current path
- **Clickable nodes**: Jump to any previous point in path
- **Branch points**: Where you chose one path over another
- **"Explore alternative"**: Go back and take the other path

### Saved Explorations & Research Sessions (P1 - Should Have)

#### Session Saving
- **"Save this exploration"** button: Bookmarks current navigation state
- **Named sessions**: User can label saved paths ("NYT coverage research")
- **Resume later**: Return to exact point in exploration
- **Share session**: URL encodes entire navigation path

#### Research Collections
- **"Add to collection"** on any node: Save records/entities/concepts to personal collection
- **Collection management**: Organize saved items into folders
- **Export collection**: BibTeX, CSV, or PDF report
- **Annotate items**: Add personal notes to collected items

### Visualization Modes (P2 - Nice to Have)

#### Graph View Mode
- **Mini network graph** in sidebar showing current node + 1-hop connections
- **Click nodes** in graph → Navigate to that node
- **Expandable**: Click "View full graph" → Network Graph Explorer

#### List View Mode
- **Connections as scrollable list** (default for mobile)
- **Group by type**: Entities, Concepts, Records, Topics
- **Filter within**: Search/filter current connection list

#### Card View Mode
- **Rich preview cards** for each connection
- **Hover for more**: Extended details on hover
- **Quick actions**: "View", "Add to collection", "Share"

### Context-Aware Features (P2 - Nice to Have)

#### Smart Filters
- **Auto-suggest filters** based on current node
  - On Entity node: "Filter to records from 2010s"
  - On Concept node: "Show only academic publications"
  - On Topic node: "Focus on Jay's blog posts"
- **One-click apply**: Instant filter activation

#### Contextual Insights
- **AI-generated summaries**: "Jay Rosen discusses this entity primarily in the context of..."
- **Trend indicators**: ↑ Increasing mentions / ↓ Decreasing / → Stable
- **Anomaly detection**: "This entity rarely appears with this concept, but does here..."

## Technical Architecture

### Frontend Stack
- **Framework**: Vue.js 3 with Vue Router for navigation state
- **State management**: Pinia for complex navigation history
- **UI components**: Modular card/panel components
- **Visualization**: D3.js for mini-graph views, full integration with Network Graph Explorer

### Data Model (Knowledge Graph)
```json
{
  "nodes": {
    "records": {
      "PRESSTH-0001": {
        "type": "record",
        "title": "...",
        "content_preview": "...",
        "connections": {
          "entities": ["P0001", "O0015"],
          "concepts": ["C0003"],
          "topics": ["press-criticism"],
          "related_records": ["PRESSTH-0045"]
        }
      }
    },
    "entities": {
      "P0001": {
        "type": "entity",
        "subtype": "Person",
        "name": "Jay Rosen",
        "connections": {
          "records": ["PRESSTH-0001", "..."],
          "related_entities": ["P0045", "O0015"],
          "concepts": ["C0003"],
          "topics": ["press-criticism"]
        }
      }
    },
    "concepts": {
      "C0003": {
        "type": "concept",
        "name": "View from Nowhere",
        "connections": {
          "records": ["PRESSTH-0023", "..."],
          "entities": ["P0001", "P0045"],
          "related_concepts": ["C0001"],
          "topics": ["journalism-theory"]
        }
      }
    },
    "topics": {
      "press-criticism": {
        "type": "topic",
        "name": "Press & Media Criticism",
        "connections": {
          "records": ["..."],
          "entities": ["..."],
          "concepts": ["..."]
        }
      }
    }
  },
  "edges": {
    "record-entity": [...],
    "entity-entity": [...],
    "concept-record": [...],
    ...
  }
}
```

### Navigation State Management
```javascript
// Pinia store
{
  navigationHistory: [
    { type: 'record', id: 'PRESSTH-0001', timestamp: 1234567890 },
    { type: 'entity', id: 'P0001', timestamp: 1234567895 },
    { type: 'concept', id: 'C0003', timestamp: 1234567900 }
  ],
  currentNode: { type: 'concept', id: 'C0003' },
  activeFilters: { dateRange: [2010, 2020], topics: ['press-criticism'] },
  savedSession: { id: 'abc123', name: 'NYT Research' }
}
```

### URL Structure & Routing
- `/explore/record/{record_id}` - Record node
- `/explore/entity/{entity_id}` - Entity node
- `/explore/concept/{concept_slug}` - Concept node
- `/explore/topic/{topic_slug}` - Topic node
- `/explore/path/{session_id}` - Restore saved navigation path

### Data Precomputation
- **Weekly rebuild**: Aggregate all connections for each node type
- **Static JSON files**: One per node (e.g., `entity-P0001.json`)
- **Graph index**: Lightweight index for quick searches
- **Lazy loading**: Load connection details on demand

## User Flow

### Exploration Flow 1: Concept → Entity → Record
1. User searches for "View from Nowhere"
2. Concept node loads showing:
   - 89 records discussing this concept
   - 45 entities who discuss it
   - Related concepts: "Objectivity", "Church of the Savvy"
3. User clicks "See who discusses this" (45 entities)
4. Entity list shows Jay Rosen (67 mentions), Jeff Jarvis (12 mentions), etc.
5. User clicks "Jeff Jarvis"
6. Entity node shows Jeff's profile + all records mentioning him
7. User clicks a record: "PRESSTH-0234: Jarvis on Platform Journalism"
8. Record node shows full content + related entities/concepts
9. User discovers "Platform Journalism" concept mentioned
10. User clicks "Platform Journalism" concept chip
11. New concept node loads → exploration continues

### Exploration Flow 2: Entity → Network → Timeline
1. User searches for "New York University"
2. Entity node (Organization) loads
3. User sees 134 mentions, top connections: Jay Rosen (87×), journalism (etc.)
4. User clicks "See relationship network" button
5. Network Graph opens, centered on NYU
6. User explores graph, finds "Journalism Education" concept connected
7. User clicks "Journalism Education" node in graph
8. Returns to Knowledge Navigator, now on Journalism Education concept
9. User clicks "Explore concept evolution"
10. Timeline view opens, filtered to Journalism Education mentions over time

### Research Session Flow
1. User starts researching Jay's coverage of NYT
2. Searches for "New York Times"
3. Navigates: NYT entity → Records → Related entities → Concepts
4. After 20 minutes, clicks "Save this exploration" (has visited 12 nodes)
5. Names session "NYT Coverage Analysis"
6. Later, clicks "Resume" → Loads exact navigation state
7. Continues exploration from same point
8. Adds 8 records to collection "NYT Critical Analysis"
9. Exports collection as BibTeX for citation management

## Design Mockups

### Main Navigation Hub
```
┌──────────────────────────────────────────────────────────────┐
│  Jay Rosen Internet Archive - Knowledge Navigator              │
│                                                                │
│  [Search for records, entities, concepts, topics...]    🔍    │
│                                                                │
│  Path: Home > Concept: View from Nowhere                      │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  💡 VIEW FROM NOWHERE                                   │  │
│  │  Journalism Concept                                     │  │
│  │                                                          │  │
│  │  "The ideology of objectivity in journalism, where     │  │
│  │  journalists claim a 'view from nowhere' detached from │  │
│  │  any particular perspective."                           │  │
│  │                                                          │  │
│  │  📊 89 mentions  •  First: 2003  •  Peak: 2010-2015   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  Connections:                                                  │
│                                                                │
│  📄 Records (89) ──────────────────── [Explore all →]        │
│  ├─ The View from Nowhere (2003)           ★ Origin          │
│  ├─ Objectivity and Its Critics (2010)     ⚡ Peak period    │
│  └─ Beyond Objectivity (2023)              📅 Recent         │
│                                                                │
│  👥 Entities (45) ─────────────────── [See who discusses →]  │
│  ├─ Jay Rosen (67 mentions)          ████████░░              │
│  ├─ Jeff Jarvis (12 mentions)        ███░░░░░░░              │
│  └─ James Carey (8 mentions)         ██░░░░░░░░              │
│                                                                │
│  💭 Related Concepts (5) ───────────── [Explore network →]   │
│  ├─ Objectivity (co-occurs 45×)                              │
│  ├─ Church of the Savvy (co-occurs 23×)                      │
│  └─ He Said/She Said (co-occurs 18×)                         │
│                                                                │
│  🏷️ Topics (3) ───────────────────────                        │
│  ├─ Journalism Theory & Practice                             │
│  ├─ Press & Media Criticism                                  │
│  └─ Journalism Education                                     │
│                                                                │
│  [📊 View in Timeline] [🕸️ See Network] [💾 Save Exploration] │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Navigation Breadcrumb & Context
```
┌──────────────────────────────────────────────────────────────┐
│  [🏠 Home] > [💡 Concept: View from Nowhere] >                 │
│  [👤 Person: Jay Rosen] > [📄 Record: PRESSTH-0234]           │
│                                                                │
│  You are viewing: Record "The Church of the Savvy Revisited"  │
│  [← Back] [⬆ Up to Jay Rosen] [🗺️ Show full path]            │
└──────────────────────────────────────────────────────────────┘
```

### Saved Sessions Panel
```
┌────────────────────────────┐
│  Your Saved Explorations   │
├────────────────────────────┤
│  📁 NYT Coverage Analysis  │
│     12 nodes • 3 hours ago │
│     [Resume] [Export]      │
│                            │
│  📁 Platform Journalism    │
│     8 nodes • 2 days ago   │
│     [Resume] [Export]      │
│                            │
│  📁 Objectivity Research   │
│     15 nodes • 1 week ago  │
│     [Resume] [Export]      │
│                            │
│  [+ New Session]           │
└────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Navigation (3 weeks)
- [ ] Unified search with type-ahead
- [ ] Node detail views (Record, Entity, Concept, Topic)
- [ ] Connection panels with clickable navigation
- [ ] Breadcrumb trail
- [ ] URL routing for each node type
- [ ] Back button support

### Phase 2: Enhanced Discovery (2 weeks)
- [ ] Connection strength indicators
- [ ] Sorting/filtering connections
- [ ] "Also explore" recommendations
- [ ] Path visualization
- [ ] Integration with existing visualizations (Network, Timeline)

### Phase 3: Research Features (2 weeks)
- [ ] Session saving/resuming
- [ ] Research collections
- [ ] Export functionality
- [ ] Annotation support
- [ ] Sharing saved explorations

### Phase 4: Advanced Features (2-3 weeks)
- [ ] Mini graph visualizations
- [ ] AI-generated insights
- [ ] Contextual filters
- [ ] Anomaly detection
- [ ] Mobile-optimized navigation

## Open Questions & Risks

### Questions
1. **Default starting point**: Home page with search, or jump straight to featured entry point?
   - Proposed: Landing page with 3 suggested starting points (recent record, popular entity, trending concept)
2. **Navigation depth limits**: Should we limit breadcrumb trail to prevent overwhelming complexity?
   - Proposed: Show last 5 steps, collapse older into "..." with dropdown
3. **Mobile navigation**: How to adapt multi-panel layout for mobile?
   - Proposed: Full-screen node views with slide-out connection drawer

### Risks
- **User confusion**: Complex navigation may overwhelm casual users
  - Mitigation: Interactive tutorial, simplified mode toggle, tooltips
- **Performance**: Many nested queries for connection data
  - Mitigation: Aggressive caching, precomputed connection graphs
- **Data complexity**: Knowledge graph requires significant preprocessing
  - Mitigation: Weekly automated rebuild, incremental updates

## Analytics & Measurement

### Key Metrics
- **Navigation diversity**: Types of nodes visited per session
- **Path depth**: Number of hops from entry to exit
- **Cross-type navigation**: % of sessions navigating between node types
- **Return rate**: Users returning to continue exploration
- **Session saves**: Frequency of saved exploration sessions

## Accessibility

- **Keyboard shortcuts**: N (next connection), P (previous), B (back), H (home)
- **Screen reader**: Announce node type, connection counts, navigation options
- **Focus management**: Clear focus indicators, skip-to-content
- **Reduced motion**: Disable transition animations
- **High contrast**: Increase connection strength indicator visibility

## Future Enhancements
- **Collaborative exploration**: Share live sessions with collaborators
- **AI conversation**: "Show me records about objectivity written after 2015"
- **Personalized recommendations**: Learn user interests over time
- **Cross-archive linking**: Connect to other journalism archives
- **Graph query language**: Power users can write custom queries
