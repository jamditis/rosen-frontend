# R Analysis Guide - Jay Rosen Archive Data

## Quick Start

### 1. Install Required Packages (First Time Only)

Open RStudio and run:

```r
install.packages(c("googlesheets4", "tidyverse", "igraph", "networkD3"))
```

### 2. Load the Data

Run the provided script in RStudio:

```r
source("analyze_entities.R")
```

**First time only:** This will open your browser for Google authentication. Sign in with the Google account that has access to the spreadsheet.

### 3. Explore the Data

After running the script, you'll have two data frames loaded:

- `entities` - All extracted entities from the archive
- `relationships` - All relationships between entities

## Available Scripts

### `analyze_entities.R`
Main analysis script that:
- Loads data from Google Sheets
- Generates summary statistics
- Creates visualizations (saved as PNG files)
- Analyzes entity types, mentions, and relationships

### Example Analyses You Can Run

#### View Entity Types
```r
entities %>%
  count(entity_type, sort = TRUE)
```

#### Find Top People Mentioned
```r
entities %>%
  filter(entity_type == "PERSON") %>%
  arrange(desc(mention_count)) %>%
  select(entity_name, mention_count, first_mentioned_in) %>%
  head(20)
```

#### Find Top Organizations
```r
entities %>%
  filter(entity_type == "ORGANIZATION") %>%
  arrange(desc(mention_count)) %>%
  head(20)
```

#### Analyze Relationship Patterns
```r
relationships %>%
  count(relationship_type, sort = TRUE)
```

#### Find Most Connected Entities
```r
# Entities with most outgoing relationships
relationships %>%
  count(source_entity, sort = TRUE) %>%
  head(10)

# Entities with most incoming relationships
relationships %>%
  count(target_entity, sort = TRUE) %>%
  head(10)
```

#### Temporal Analysis
```r
# If your entities have date information
entities %>%
  group_by(entity_type, year = year(first_mentioned_in)) %>%
  summarise(count = n()) %>%
  ggplot(aes(x = year, y = count, color = entity_type)) +
  geom_line() +
  theme_minimal() +
  labs(title = "Entity Mentions Over Time")
```

## Data Structure

### Entities Sheet Expected Columns:
- `entity_id` - Unique identifier
- `entity_name` - Name of the entity
- `entity_type` - Type (PERSON, ORGANIZATION, LOCATION, etc.)
- `mention_count` - Number of times mentioned
- `record_id` - Associated record ID
- `first_mentioned_in` - First record where entity appeared

### Relationships Sheet Expected Columns:
- `relationship_id` - Unique identifier
- `source_entity` - Starting entity
- `target_entity` - Ending entity
- `relationship_type` - Type of relationship
- `record_id` - Associated record ID

## Troubleshooting

### Authentication Issues
If you get authentication errors:
```r
gs4_deauth()  # Clear authentication
gs4_auth()    # Re-authenticate
```

### Package Installation Issues
If packages fail to install, try:
```r
install.packages("tidyverse", dependencies = TRUE)
```

### Check Your Data
```r
# View first few rows
head(entities)
head(relationships)

# Check column names
names(entities)
names(relationships)

# Check data dimensions
dim(entities)
dim(relationships)
```

## Network Analysis (Advanced)

To create interactive network visualizations:

```r
library(igraph)
library(networkD3)

# Create network graph
g <- graph_from_data_frame(
  d = relationships %>% select(source_entity, target_entity),
  vertices = entities %>% select(entity_name, entity_type),
  directed = TRUE
)

# Simple plot
plot(g, vertex.size = 5, edge.arrow.size = 0.3)

# Interactive visualization
library(networkD3)
# Convert to format for networkD3
nodes <- data.frame(name = V(g)$name, group = V(g)$entity_type)
links <- as_data_frame(g, what = "edges")
links$source <- match(links$from, nodes$name) - 1
links$target <- match(links$to, nodes$name) - 1

forceNetwork(
  Links = links,
  Nodes = nodes,
  Source = "source",
  Target = "target",
  NodeID = "name",
  Group = "group",
  opacity = 0.8,
  zoom = TRUE
)
```

## Output Files

The analysis script generates:
- `entity_type_distribution.png` - Bar chart of entity types
- `top_entities.png` - Top 20 most mentioned entities
- `relationship_type_distribution.png` - Distribution of relationship types

## Next Steps

After running the initial analysis, explore the data interactively in RStudio:

1. Use `View(entities)` to browse the data in a spreadsheet-like interface
2. Create custom visualizations based on your research questions
3. Export results to CSV: `write.csv(entities, "entities_export.csv")`
4. Build network graphs to visualize entity relationships

## Resources

- [googlesheets4 documentation](https://googlesheets4.tidyverse.org/)
- [tidyverse documentation](https://www.tidyverse.org/)
- [igraph for network analysis](https://igraph.org/r/)
