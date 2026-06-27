# Jay Rosen's Internet Archive — Context

The shared vocabulary for talking about what the archive *is*, as distinct from how it's built. Use these terms exactly. When a generic word (post, service, document, map) feels natural, reach for the term below instead.

## Language

**Archive**:
The whole collection — every **Record**, every **Entity**, plus the derived structures (**Entity Index**, **Facets**) used to navigate them.
_Avoid_: dataset, corpus, collection.

**Record**:
A single archive entry. Has `id`, `title`, `date`, `year`, `era`, `pub`, `categories`, `type`. Source of truth for "what's in the archive."
_Avoid_: document, article, post, item, entry.

**Record type**:
The discriminator on a **Record**. One of: `RECORD` (article), `TUMBLR`, `CLIP` (newspaper clipping), `THREAD` (social-media thread), `Dissertation` (the unique 1986 PhD).
_Avoid_: kind, category (overloaded), format.

**Entity**:
An extracted named thing — a Person, an Organization, or a Concept — that appears across one or more **Records**. Has `id`, `type`, `prominence`.
_Avoid_: tag, keyword, term, mention.

**Entity type**:
The discriminator on an **Entity**. One of: `Person`, `Organization`, `Concept` (and any future types added to `ENTITY_TYPE_CONFIG`).
_Avoid_: category (overloaded with **Record** categories), kind.

**Entity Index**:
The derived bidirectional lookup over **Records** and **Entities**: given a **Record**, list its **Entities**; given an **Entity**, list the **Records** that mention it. Built once from loaded **Archive** data; queried by every component that surfaces relationships (Explorer, EntityBrowser, RecordModal).
_Avoid_: map, maps, lookup, dictionary, graph (the **Explorer** *visualises* a graph; the index *is* the index).

**Facet**:
A filter dimension over **Records** — `categories`, `eras`, `publications`. Derived from **Records** at load time.
_Avoid_: filter (filter is the *act* of using a facet), bucket, group.

**Era**:
A named time period a **Record** belongs to (e.g., "Public Journalism (90s)"). One of the **Facets**.

**Categories** (on a Record):
Topic labels the curator assigns: "Journalism Theory & Practice," "Press & Media Criticism," etc. Plural-by-design — a **Record** has multiple. Distinct from **Entity type** `Concept`.
_Avoid_: tags, topics, themes.

**Concepts** (on a Record):
Free-text idea labels in `Record.concepts` ("Public Sphere", "Objectivity"). String-typed at the **Record** level. Distinct from a structured **Entity** of type `Concept`. See *Flagged ambiguities*.

**Loader**:
The thing that fetches **Archive** data over the network and returns it. Distinct from the **Entity Index** that consumes the data. Today there's one loader (HTTP + browser cache); a test-time in-memory loader is the second adapter we expect.
_Avoid_: service, fetcher, client.

**Curator**:
The human (Joe Amditis) who decides which **Records** enter the **Archive**. Used in `verified` and `author` provenance.

## Relationships

- An **Archive** contains many **Records** and many **Entities**.
- A **Record** references zero or more **Entities** via `relatedIds`.
- An **Entity** is referenced by zero or more **Records**.
- The **Entity Index** is a pure projection of (**Records** + **Entities**) — no independent state.
- **Facets** are a pure projection of **Records**.
- A **Loader** produces (**Records**, **Entities**); the **Entity Index** is built from them. The **Loader** does not own the index.

## Example dialogue

> **Dev:** "Should the **Loader** populate the **Entity Index** when it finishes fetching?"
> **Curator:** "No — those are different jobs. The **Loader** delivers raw **Records** and **Entities**. Whatever wants to query relationships should ask for the **Entity Index** explicitly."
> **Dev:** "And if someone calls a query before the index is built?"
> **Curator:** "That should be a type error or an awaited promise — never an empty-result silent failure."

## Flagged ambiguities

- **"tags"** in `DISSERTATION_RECORD.tags` (e.g., "Walter Lippmann," "John Dewey") are de-facto **Entity** references — most are `Person` entities — but live as plain strings on the **Record**. Resolution: `tags` on a **Record** is a legacy free-text field; treat it as Entity-shaped when displaying, but do not invert the relationship through it (use the **Entity Index** instead, which is built from `relatedIds`).
- **"concepts"** is overloaded: `Record.concepts` is a string array of idea labels; `Entity.type === 'Concept'` is a structured **Entity**. Resolution: keep the names distinct in code — refer to "concept strings on a Record" vs "Concept Entities." Don't merge them without a migration.
- **"category"** is overloaded with **Entity type**. Resolution: `categories` (plural) always means the **Record** field; **Entity type** is always written out as "Entity type."
