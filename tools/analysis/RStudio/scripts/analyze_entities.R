# Jay Rosen Archive - Entity & Relationship Analysis
# Analysis of extracted_entities and extracted_relationships from Google Sheets

# Install required packages (run once)
# install.packages(c("googlesheets4", "tidyverse", "igraph", "ggplot2", "dplyr"))

# Load libraries
library(googlesheets4)
library(dplyr)
library(ggplot2)
library(tidyr)

# Configure authentication
# First time: this will open a browser for Google OAuth
# The authentication token will be cached for future use
gs4_auth()

# Connect to the Google Sheet
# From the CLAUDE.md: SPREADSHEET_NAME="📎Rosen Archive URL List"
sheet_id <- "1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg"

# Read the data
cat("Reading extracted_entities...\n")
entities <- read_sheet(sheet_id, sheet = "extracted_entities")

cat("Reading extracted_relationships...\n")
relationships <- read_sheet(sheet_id, sheet = "extracted_relationships")

# Display basic information
cat("\n=== ENTITIES SUMMARY ===\n")
cat("Total entities:", nrow(entities), "\n")
cat("Columns:", paste(names(entities), collapse = ", "), "\n\n")

cat("=== RELATIONSHIPS SUMMARY ===\n")
cat("Total relationships:", nrow(relationships), "\n")
cat("Columns:", paste(names(relationships), collapse = ", "), "\n\n")

# Entity Type Distribution
if ("entity_type" %in% names(entities)) {
  cat("=== ENTITY TYPE DISTRIBUTION ===\n")
  entity_type_counts <- entities %>%
    count(entity_type, sort = TRUE)
  print(entity_type_counts)

  # Visualize entity types
  ggplot(entity_type_counts, aes(x = reorder(entity_type, n), y = n, fill = entity_type)) +
    geom_col() +
    coord_flip() +
    labs(title = "Entity Type Distribution",
         x = "Entity Type",
         y = "Count") +
    theme_minimal() +
    theme(legend.position = "none")

  ggsave("entity_type_distribution.png", width = 10, height = 6)
  cat("\nSaved: entity_type_distribution.png\n")
}

# Top Entities by Mention Count
if ("mention_count" %in% names(entities) && "entity_name" %in% names(entities)) {
  cat("\n=== TOP 20 ENTITIES BY MENTIONS ===\n")
  top_entities <- entities %>%
    arrange(desc(mention_count)) %>%
    head(20) %>%
    select(entity_name, entity_type, mention_count)
  print(top_entities)

  # Visualize top entities
  ggplot(top_entities, aes(x = reorder(entity_name, mention_count),
                           y = mention_count,
                           fill = entity_type)) +
    geom_col() +
    coord_flip() +
    labs(title = "Top 20 Entities by Mention Count",
         x = "Entity",
         y = "Mentions") +
    theme_minimal()

  ggsave("top_entities.png", width = 10, height = 8)
  cat("\nSaved: top_entities.png\n")
}

# Relationship Type Distribution
if ("relationship_type" %in% names(relationships)) {
  cat("\n=== RELATIONSHIP TYPE DISTRIBUTION ===\n")
  rel_type_counts <- relationships %>%
    count(relationship_type, sort = TRUE)
  print(rel_type_counts)

  # Visualize relationship types
  ggplot(rel_type_counts, aes(x = reorder(relationship_type, n), y = n, fill = relationship_type)) +
    geom_col() +
    coord_flip() +
    labs(title = "Relationship Type Distribution",
         x = "Relationship Type",
         y = "Count") +
    theme_minimal() +
    theme(legend.position = "none")

  ggsave("relationship_type_distribution.png", width = 10, height = 6)
  cat("\nSaved: relationship_type_distribution.png\n")
}

# Network Statistics
if (all(c("source_entity", "target_entity") %in% names(relationships))) {
  cat("\n=== NETWORK STATISTICS ===\n")

  # Most connected entities (by degree)
  source_counts <- relationships %>%
    count(source_entity, name = "out_degree")

  target_counts <- relationships %>%
    count(target_entity, name = "in_degree")

  node_stats <- full_join(source_counts, target_counts,
                          by = c("source_entity" = "target_entity")) %>%
    mutate(total_degree = coalesce(out_degree, 0) + coalesce(in_degree, 0)) %>%
    arrange(desc(total_degree)) %>%
    head(20)

  cat("\nTop 20 Most Connected Entities:\n")
  print(node_stats)
}

# Entity Co-occurrence Analysis
if ("record_id" %in% names(entities)) {
  cat("\n=== ENTITY CO-OCCURRENCE ===\n")

  # Find entities that frequently appear together
  entity_pairs <- entities %>%
    select(record_id, entity_name) %>%
    inner_join(entities %>% select(record_id, entity_name),
               by = "record_id",
               relationship = "many-to-many") %>%
    filter(entity_name.x < entity_name.y) %>%
    count(entity_name.x, entity_name.y, sort = TRUE) %>%
    head(20)

  cat("\nTop 20 Entity Co-occurrences:\n")
  print(entity_pairs)
}

cat("\n=== ANALYSIS COMPLETE ===\n")
cat("Data loaded and ready for exploration!\n")
cat("Objects available: 'entities', 'relationships'\n")
