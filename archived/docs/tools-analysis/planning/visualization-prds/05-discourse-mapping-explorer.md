# PRD: Discourse Mapping & Conversation Explorer

## Executive Summary
A specialized visualization system that maps intellectual conversations and discourse threads across the Jay Rosen Internet Archive. By leveraging the `responds_to` and `related_to` relationship fields, this tool reveals how ideas, critiques, and discussions evolved through direct citation, response, and debate over 25+ years of journalism criticism.

## Problem Statement
Journalism scholarship is fundamentally conversational—ideas build on, critique, and extend previous work. The archive contains rich `responds_to` relationships (Record A responds to Record B) but no interface to:
- Visualize conversation threads (A→B→C→D)
- Discover discourse communities (who responds to whom)
- Track how critiques/ideas evolved through responses
- See Jay Rosen's role in multi-party conversations
- Understand the "genealogy" of specific arguments

Current interfaces treat records as isolated documents, obscuring the conversational structure of intellectual discourse.

## Goals & Success Metrics

### Primary Goals
1. **Conversation Discovery**: Surface hidden discussion threads spanning years
2. **Discourse Analysis**: Enable scholarly analysis of idea evolution and debate structure
3. **Citation Mapping**: Show influence patterns through response networks
4. **Intellectual Lineage**: Trace conceptual genealogies from origin to current form

### Success Metrics
- **Thread discovery**: >60% of records with responds_to relationships get explored via this tool
- **Multi-hop navigation**: Average 4+ responses followed per session
- **Research citations**: Discourse maps cited in academic papers about Rosen's work
- **User satisfaction**: >4.3/5 rating from researcher persona
- **Thread exports**: >30% of users export conversation thread data

## User Personas

### Media Studies Scholar (Primary)
- **Needs**: Trace how Jay Rosen's arguments evolved through responses and critiques
- **Use case**: "Map the conversation thread about 'The Citizens' Agenda' from origin to present"
- **Tech savvy**: Medium-high

### Dissertation Researcher (Primary)
- **Needs**: Understand discourse structure in journalism criticism
- **Use case**: "Show me all the back-and-forth between Jay and critics of 'View from Nowhere'"
- **Tech savvy**: Medium

### Intellectual Historian (Secondary)
- **Needs**: Analyze how ideas spread and evolved through citation networks
- **Use case**: "Visualize the influence network around Jay's platform journalism critique"
- **Tech savvy**: Medium-high

### Journalism Student (Tertiary)
- **Needs**: Follow important debates to understand journalism theory evolution
- **Use case**: "I want to read the original exchange that led to 'Church of the Savvy'"
- **Tech savvy**: Low-medium

## Feature Requirements

### Core Conversation Thread View (P0 - Must Have)

#### Thread Visualization
- **Vertical timeline layout**: Chronological flow top-to-bottom
- **Record cards** connected by arrows showing response relationships
- **Visual thread structure**:
  ```
  ┌────────────────┐
  │ Original Post  │ 2011-09-12
  └────────┬───────┘
           │ responds_to
           ↓
  ┌────────────────┐
  │ Response 1     │ 2011-09-15
  └────────┬───────┘
           │
           ↓
  ┌────────────────┐
  │ Jay's Reply    │ 2011-09-18
  └────────┬───────┘
           │
           ↓
  ┌────────────────┐
  │ Counter-point  │ 2011-10-02
  └────────────────┘
  ```

#### Record Card Design
- **Mini preview**: Title, date, author, publication
- **Excerpt snippet**: Key quote or first 150 chars
- **Response indicator**: ↑ "Responds to above" / ↓ "Responded to by below"
- **Response type badge**: Direct response, Critical response, Extension, etc.
- **Click to expand**: Full record content in modal
- **"Start new thread from here"**: Re-center visualization on this record

#### Thread Metadata
- **Thread length**: "5 records over 14 months"
- **Participants**: "Jay Rosen, Jeff Jarvis, 2 others"
- **Thread origin**: Link to earliest record in thread
- **Thread status**: Active (recent response) / Dormant (no responses in 6+ months)

### Discourse Network Graph (P0 - Must Have)

#### Network Visualization
- **Force-directed layout** showing respond_to relationships as edges
- **Nodes = Records** (sized by response count or importance)
- **Edges = Response relationships** (directed arrows)
- **Color coding**:
  - Jay Rosen's records: Blue
  - Records by others: Orange
  - Collaborative/multi-author: Purple
- **Clustering**: Automatic grouping of tightly-connected conversation clusters

#### Interactive Features
- **Click node**: Show record details + immediate responses/responded-to
- **Click edge**: Show response context ("X responds to Y about [topic]")
- **Filter by**:
  - Date range (show conversations from specific period)
  - Participant (show only threads involving specific person/entity)
  - Topic (filter to specific thematic_category)
  - Minimum thread length (≥3 records, ≥5 records, etc.)
- **Layout modes**:
  - Force-directed (shows clustering)
  - Hierarchical (shows conversation trees)
  - Temporal (positions nodes by publication date)

#### Conversation Clusters
- **Auto-detection**: Algorithm identifies tightly-connected groups
- **Cluster labels**: "Platform Journalism Debate (2012-2015, 18 records)"
- **Cluster expansion**: Click to zoom into cluster subgraph
- **Cross-cluster connections**: Highlight bridges between discourse communities

### Conversation Thread Discovery (P0 - Must Have)

#### Entry Points
- **Featured threads**: Curated list of important conversations
  - "The View from Nowhere Debate (2003-2010)"
  - "Objectivity Wars (2015-2020)"
  - "Platform Journalism Critique (2012-2018)"
- **Search threads**: Find threads by keyword, entity, concept
- **Browse by length**: "Long conversations (10+ records)", "Short exchanges (2-3 records)"
- **Browse by participant**: "Threads involving Jeff Jarvis", "Jay's solo threads"

#### Thread Summaries
- **AI-generated summary**: "This thread discusses objectivity in journalism, beginning with Jay's original 2003 essay..."
- **Key moments**: Annotated inflection points ("Critical turning point", "Major pushback", "Consensus emerges")
- **Outcome/resolution**: "Thread concluded with [result]" or "Ongoing discussion"

### Response Context & Analysis (P1 - Should Have)

#### Response Type Classification
- **Direct Response**: Explicitly replies to specific arguments
- **Critical Response**: Challenges or disagrees with previous record
- **Supportive Extension**: Builds on and extends ideas
- **Tangential**: Related but diverges from main thread
- **Synthesis**: Combines multiple previous arguments

#### Citation Analysis
- **Direct quotes**: Highlight where Record B quotes Record A
- **Paraphrasing detection**: AI identifies rephrased arguments
- **Concept tracking**: Which concepts travel through thread
- **Entity tracking**: Which entities discussed at each stage

#### Sentiment Tracking
- **Tone indicators**: Supportive ✓, Critical ✗, Neutral —
- **Sentiment arc**: Visualize how tone shifts through thread
- **Debate intensity**: Heatmap showing periods of active back-and-forth

### Thread Export & Citation (P1 - Should Have)

#### Export Formats
- **PDF thread report**: Formatted document with full conversation thread
- **BibTeX**: All records in thread with proper citations
- **JSON**: Structured data for computational analysis
- **Chronological HTML**: Web page displaying conversation flow

#### Citation Tools
- **"Cite this thread"**: Generate academic citation for entire conversation
- **"Cite turning point"**: Reference specific moment in discourse evolution
- **Permalink**: Shareable URL to exact thread visualization state

### Multi-Thread Comparison (P2 - Nice to Have)

#### Side-by-Side View
- **Compare 2-3 threads** on related topics
- **Identify patterns**: Similar structure, different outcomes
- **Cross-pollination**: When threads reference each other
- **Parallel evolution**: Simultaneous conversations on same topic

#### Conversation Patterns
- **Common thread structures**: Identify recurring debate patterns
- **Response velocity**: How quickly threads generate responses
- **Resolution patterns**: How conversations typically conclude
- **Participant dynamics**: Who initiates, who responds, who synthesizes

### Temporal Thread Evolution (P2 - Nice to Have)

#### Thread Timeline
- **Horizontal timeline** showing when each response occurred
- **Response gaps**: Visualize dormant periods between replies
- **Burst detection**: Periods of rapid-fire exchange
- **Revival tracking**: When old threads get re-awakened by new responses

#### Animation Mode
- **"Watch thread unfold"**: Animated playback showing conversation building over time
- **Playback speed control**: Adjust animation speed
- **Pause at inflection points**: Automatic pauses at key moments
- **Annotation overlay**: Commentary appears during playback

## Technical Architecture

### Frontend Stack
- **Framework**: Vue.js 3 with reactive thread state
- **Network viz**: Cytoscape.js (optimized for conversation graphs)
- **Timeline**: D3.js for temporal thread views
- **Layout**: Custom CSS Grid for thread card layout

### Data Structure
```json
{
  "threads": [
    {
      "thread_id": "T001",
      "title": "The View from Nowhere Debate",
      "origin_record": "PRESSTH-0023",
      "participants": ["Jay Rosen", "Jeff Jarvis", "..."],
      "records": [
        {
          "record_id": "PRESSTH-0023",
          "date": "2003-09-18",
          "title": "The View from Nowhere",
          "position_in_thread": 0,
          "responds_to": null,
          "responded_to_by": ["PRESSTH-0045"],
          "response_type": "origin"
        },
        {
          "record_id": "PRESSTH-0045",
          "date": "2003-10-12",
          "title": "In Defense of Objectivity",
          "position_in_thread": 1,
          "responds_to": "PRESSTH-0023",
          "responded_to_by": ["PRESSTH-0067"],
          "response_type": "critical_response",
          "context": "Challenges Jay's critique of objectivity..."
        }
      ],
      "thread_stats": {
        "length": 12,
        "duration_days": 2547,
        "participant_count": 5,
        "status": "dormant"
      }
    }
  ],
  "discourse_network": {
    "nodes": [
      {
        "id": "PRESSTH-0023",
        "label": "The View from Nowhere",
        "author": "Jay Rosen",
        "date": "2003-09-18",
        "response_count": 4,
        "size": 8
      }
    ],
    "edges": [
      {
        "source": "PRESSTH-0045",
        "target": "PRESSTH-0023",
        "type": "responds_to",
        "response_type": "critical",
        "days_between": 24
      }
    ]
  }
}
```

### Thread Detection Algorithm
```python
def build_conversation_threads(records):
    """
    Construct conversation threads from responds_to relationships.

    Algorithm:
    1. Build graph from responds_to edges
    2. Find root nodes (no incoming responds_to)
    3. Traverse depth-first from each root
    4. Generate thread objects with metadata
    """
    threads = []
    for root in find_roots(records):
        thread = {
            'origin': root,
            'records': traverse_thread(root, records),
            'stats': calculate_thread_stats()
        }
        threads.append(thread)
    return threads
```

### URL Structure
- `/discourse` - Main discourse map landing page
- `/discourse/thread/{thread_id}` - Specific conversation thread
- `/discourse/network` - Full discourse network graph
- `/discourse/compare?threads={id1},{id2}` - Thread comparison view

## User Flow

### Thread Discovery Flow
1. User lands on `/discourse` page
2. Sees featured threads: "Platform Journalism Debate", "Objectivity Wars", etc.
3. Clicks "Platform Journalism Debate"
4. Thread visualization loads showing 18 records over 6 years
5. User scrolls through chronological thread
6. Clicks record card "Jay's Original Critique (2012)"
7. Full record modal opens
8. User sees "Responded to by 4 records" indicator
9. Clicks "Show all responses"
10. Thread view highlights the 4 direct responses

### Network Exploration Flow
1. User navigates to `/discourse/network`
2. Full discourse network loads (all responds_to relationships)
3. User sees conversation clusters auto-detected
4. Largest cluster: "Objectivity & Press Criticism (47 records)"
5. User clicks cluster to zoom in
6. Sees subgraph of tightly-connected objectivity discussions
7. Notices bridge connection to separate "Platform Journalism" cluster
8. Clicks bridge edge to see context: "Record links both discussions"
9. User filters to "2015-2020" date range
10. Graph updates showing only recent conversations

### Research Export Flow
1. User viewing "The Citizens' Agenda Thread" (14 records, 2000-2008)
2. Clicks "Export thread" button
3. Selects "PDF Report with full text"
4. System generates 25-page formatted PDF with:
   - Thread summary and metadata
   - Full chronological record text
   - Response relationship diagrams
   - Citation information
5. User downloads PDF for dissertation appendix

## Design Mockups

### Thread View
```
┌──────────────────────────────────────────────────────────────┐
│  Discourse Explorer                         [Network] [Threads]│
│  Thread: "The View from Nowhere Debate"                       │
│  12 records • 2003-2010 • 7 years • 5 participants           │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  Thread origin: September 18, 2003                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ The View from Nowhere                                   │  │
│  │ Jay Rosen • PressThink • Sep 18, 2003                  │  │
│  │                                                          │  │
│  │ "In the ideology of the American press, objectivity     │  │
│  │ claims to be a view from nowhere..."                    │  │
│  │                                                          │  │
│  │ [Read full record →]     [⇩ 4 direct responses]        │  │
│  └────────────────────────────────────────────────────────┘  │
│            │ responds_to (24 days later)                      │
│            ↓                                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ In Defense of Objectivity                  ✗ Critical   │  │
│  │ Michael Kinsley • Slate • Oct 12, 2003                 │  │
│  │                                                          │  │
│  │ "Rosen mischaracterizes objectivity. Journalists don't  │  │
│  │ claim a view from 'nowhere'..."                         │  │
│  │                                                          │  │
│  │ [Read full record →]     [⇩ 1 response]                │  │
│  └────────────────────────────────────────────────────────┘  │
│            │ responds_to (6 days later)                       │
│            ↓                                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Reply to Kinsley                           ✓ Supportive │  │
│  │ Jay Rosen • PressThink • Oct 18, 2003                  │  │
│  │ ...                                                      │  │
│                                                                │
│  [Load 9 more records ↓]            [Export thread] [Share]  │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Discourse Network View
```
┌──────────────────────────────────────────────────────────────┐
│  Discourse Network                          [Thread] [Network] │
│  Filters: [2003-2025] [All Participants] [Min 2 responses ▼] │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  Conversation Clusters Detected: 8                            │
│                                                                │
│       Objectivity Debate            Platform Journalism       │
│           (47 records)                   (32 records)         │
│              ●─●                            ●─●               │
│             / │ \                          / │ \              │
│            ●  ●  ●                        ●  ●  ●             │
│             \ │ /                          \ │ /              │
│              ●─●                            ●─●               │
│                │                             │                │
│                └──── bridge connection ──────┘                │
│                                                                │
│  Click cluster to zoom • Click node for details              │
│  Drag to pan • Scroll to zoom                                │
│                                                                │
│  [Export network data] [Save view] [Share link]              │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### Featured Threads List
```
┌──────────────────────────────────────────────────────────────┐
│  Featured Conversation Threads                                │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  🔥 The View from Nowhere Debate                              │
│     12 records • 2003-2010 • Jay Rosen, 4 others             │
│     Origin: Critique of journalistic objectivity...           │
│     [Explore thread →]                                        │
│                                                                │
│  🔥 Platform Journalism Wars                                  │
│     18 records • 2012-2018 • Jay Rosen, Jeff Jarvis, 3 others│
│     Origin: How platforms changed journalism...               │
│     [Explore thread →]                                        │
│                                                                │
│  💬 The Citizens' Agenda Evolution                            │
│     14 records • 2000-2008 • Jay Rosen, 2 others             │
│     Origin: Reframing election coverage...                    │
│     [Explore thread →]                                        │
│                                                                │
│  [Browse all threads →]                                       │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Core Thread View (2 weeks)
- [ ] Thread detection algorithm from responds_to relationships
- [ ] Chronological thread visualization with record cards
- [ ] Basic thread metadata (length, participants, dates)
- [ ] Click to expand record details
- [ ] Export thread to PDF

### Phase 2: Network Visualization (2 weeks)
- [ ] Discourse network graph (Cytoscape.js)
- [ ] Automatic cluster detection
- [ ] Interactive filtering (date, participant, topic)
- [ ] Node/edge click for details
- [ ] Layout mode switching (force/hierarchical/temporal)

### Phase 3: Discovery & Analysis (1-2 weeks)
- [ ] Featured threads curation
- [ ] Thread search and browse
- [ ] Response type classification
- [ ] Citation analysis (quote detection)
- [ ] Sentiment indicators

### Phase 4: Advanced Features (2 weeks)
- [ ] Multi-thread comparison
- [ ] Thread evolution animation
- [ ] AI-generated thread summaries
- [ ] Conversation pattern detection
- [ ] Embeddable thread widgets

## Open Questions & Risks

### Questions
1. **Thread boundaries**: How to handle weakly-connected records (related_to vs responds_to)?
   - Proposed: Only responds_to for main threads, related_to shown as "See also" links
2. **Thread titles**: Auto-generate or manually curate?
   - Proposed: Auto-generate from origin record title, allow manual override
3. **Minimum thread length**: Display single-response threads or require 3+?
   - Proposed: Default 3+, allow users to toggle "Show short threads"

### Risks
- **Sparse responds_to data**: Not all records may have response relationships
  - Mitigation: Supplement with AI-detected implicit responses, manual curation
- **Complex graph rendering**: Large discourse networks may be slow
  - Mitigation: Progressive rendering, viewport-based loading, Canvas fallback
- **Thread context loss**: Excerpts may not capture full argument
  - Mitigation: Always link to full records, AI-generated summaries

## Analytics & Measurement

### Key Metrics
- **Thread exploration depth**: Number of records viewed per thread
- **Network interaction**: Graph zoom, pan, filter usage
- **Export usage**: PDF vs JSON vs BibTeX
- **Thread discovery paths**: How users find threads (search vs featured vs network)
- **Research citations**: Academic papers citing discourse maps

## Accessibility

- **Keyboard navigation**: Tab through thread, Enter to expand, Arrow keys to navigate
- **Screen reader**: Announce thread structure, response relationships, record order
- **Focus indicators**: Clear visual focus for current record in thread
- **Reduced motion**: Disable network animations, smooth scrolling
- **High contrast**: Increase edge visibility in network graph

## Future Enhancements
- **Live thread monitoring**: Notifications when new responses added to active threads
- **Collaborative annotations**: Users can annotate key moments in threads
- **Cross-archive linking**: Connect to responses in external publications
- **AI debate summarization**: "Explain this debate in simple terms"
- **Conversational search**: "Show me threads where Jay debates objectivity with critics"
