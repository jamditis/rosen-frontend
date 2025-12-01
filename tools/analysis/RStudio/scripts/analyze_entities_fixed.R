# Jay Rosen Archive - Entity & Relationship Analysis (FIXED VERSION)
# Analysis of extracted_entities and extracted_relationships from Google Sheets

# Load libraries
library(googlesheets4)
library(dplyr)
library(ggplot2)
library(tidyr)

# Configure authentication
gs4_auth()

# Connect to the Google Sheet
sheet_id <- "1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg"

# Read the data
cat("Reading extracted_entities...\n")
entities <- read_sheet(sheet_id, sheet = "extracted_entities")

cat("Reading extracted_relationships...\n")
relationships <- read_sheet(sheet_id, sheet = "extracted_relationships")

# Convert text columns to numbers
entities <- entities %>%
  mutate(
    total_mentions = as.numeric(total_mentions),
    prominence_score = as.numeric(prominence_score)
  )

# Display basic information
cat("\n=== ENTITIES SUMMARY ===\n")
cat("Total entities:", nrow(entities), "\n")
cat("Columns:", paste(names(entities), collapse = ", "), "\n\n")

cat("=== RELATIONSHIPS SUMMARY ===\n")
cat("Total relationships:", nrow(relationships), "\n")
cat("Columns:", paste(names(relationships), collapse = ", "), "\n\n")

# Entity Type Distribution
cat("=== ENTITY TYPE DISTRIBUTION ===\n")
entity_type_counts <- entities %>%
  count(entity_type, sort = TRUE)
print(entity_type_counts)

# Visualize entity types
ggplot(entity_type_counts, aes(x = reorder(entity_type, n), y = n, fill = entity_type)) +
  geom_col() +
  coord_flip() +
  labs(title = "Entity Type Distribution",
       subtitle = paste("Total:", nrow(entities), "entities"),
       x = "Entity Type",
       y = "Count") +
  theme_minimal() +
  theme(legend.position = "none",
        plot.title = element_text(size = 16, face = "bold"),
        axis.text = element_text(size = 11))

ggsave("entity_type_distribution.png", width = 10, height = 6, dpi = 300)
cat("\nSaved: entity_type_distribution.png\n")

# Top Entities by Mention Count
cat("\n=== TOP 20 ENTITIES BY TOTAL MENTIONS ===\n")
top_entities <- entities %>%
  arrange(desc(total_mentions)) %>%
  head(20) %>%
  select(entity_name, entity_type, total_mentions, prominence_score)
print(top_entities)

# Visualize top entities
ggplot(top_entities, aes(x = reorder(entity_name, total_mentions),
                         y = total_mentions,
                         fill = entity_type)) +
  geom_col() +
  coord_flip() +
  labs(title = "Top 20 Entities by Total Mentions",
       x = "Entity",
       y = "Total Mentions",
       fill = "Entity Type") +
  theme_minimal() +
  theme(plot.title = element_text(size = 16, face = "bold"),
        axis.text = element_text(size = 10))

ggsave("top_entities.png", width = 10, height = 8, dpi = 300)
cat("\nSaved: top_entities.png\n")

# Top entities by type
cat("\n=== TOP ENTITIES BY TYPE ===\n")

# Top People
top_people <- entities %>%
  filter(entity_type == "Person") %>%
  arrange(desc(total_mentions)) %>%
  head(15) %>%
  select(entity_name, total_mentions, role_or_description)

ggplot(top_people, aes(x = reorder(entity_name, total_mentions),
                       y = total_mentions)) +
  geom_col(fill = "#E41A1C") +
  coord_flip() +
  labs(title = "Top 15 People in the Archive",
       x = "Person",
       y = "Total Mentions") +
  theme_minimal() +
  theme(plot.title = element_text(size = 16, face = "bold"))

ggsave("top_people.png", width = 10, height = 7, dpi = 300)
cat("Saved: top_people.png\n")

# Top Organizations
top_orgs <- entities %>%
  filter(entity_type == "Organization") %>%
  arrange(desc(total_mentions)) %>%
  head(15) %>%
  select(entity_name, total_mentions)

ggplot(top_orgs, aes(x = reorder(entity_name, total_mentions),
                     y = total_mentions)) +
  geom_col(fill = "#377EB8") +
  coord_flip() +
  labs(title = "Top 15 Organizations in the Archive",
       x = "Organization",
       y = "Total Mentions") +
  theme_minimal() +
  theme(plot.title = element_text(size = 16, face = "bold"))

ggsave("top_organizations.png", width = 10, height = 7, dpi = 300)
cat("Saved: top_organizations.png\n")

# Relationship Type Distribution
cat("\n=== RELATIONSHIP TYPE DISTRIBUTION ===\n")
rel_type_counts <- relationships %>%
  count(relationship_type, sort = TRUE)
print(rel_type_counts)

# Visualize relationship types
ggplot(rel_type_counts, aes(x = reorder(relationship_type, n), y = n, fill = relationship_type)) +
  geom_col() +
  coord_flip() +
  labs(title = "Relationship Type Distribution",
       subtitle = paste("Total:", nrow(relationships), "relationships"),
       x = "Relationship Type",
       y = "Count") +
  theme_minimal() +
  theme(legend.position = "none",
        plot.title = element_text(size = 16, face = "bold"),
        axis.text = element_text(size = 11))

ggsave("relationship_type_distribution.png", width = 10, height = 7, dpi = 300)
cat("Saved: relationship_type_distribution.png\n")

# Network Statistics
cat("\n=== NETWORK STATISTICS ===\n")

# Most connected entities (by degree)
source_counts <- relationships %>%
  count(source_entity_name, name = "out_degree")

target_counts <- relationships %>%
  count(target_entity_name, name = "in_degree")

node_stats <- full_join(source_counts, target_counts,
                        by = c("source_entity_name" = "target_entity_name")) %>%
  rename(entity_name = source_entity_name) %>%
  mutate(
    out_degree = coalesce(out_degree, 0),
    in_degree = coalesce(in_degree, 0),
    total_degree = out_degree + in_degree
  ) %>%
  arrange(desc(total_degree)) %>%
  head(20)

cat("\nTop 20 Most Connected Entities:\n")
print(node_stats)

# Visualize network connectivity
ggplot(node_stats, aes(x = reorder(entity_name, total_degree),
                       y = total_degree)) +
  geom_col(fill = "#4DAF4A") +
  geom_text(aes(label = total_degree), hjust = -0.2, size = 3) +
  coord_flip() +
  labs(title = "Most Connected Entities in the Network",
       subtitle = "Based on total number of relationships (in + out degree)",
       x = "Entity",
       y = "Total Connections") +
  theme_minimal() +
  theme(plot.title = element_text(size = 16, face = "bold"))

ggsave("most_connected_entities.png", width = 10, height = 8, dpi = 300)
cat("Saved: most_connected_entities.png\n")

# Prominence Score Distribution
cat("\n=== PROMINENCE SCORE ANALYSIS ===\n")
prominence_summary <- entities %>%
  filter(!is.na(prominence_score)) %>%
  group_by(entity_type) %>%
  summarise(
    avg_prominence = round(mean(prominence_score, na.rm = TRUE), 2),
    max_prominence = max(prominence_score, na.rm = TRUE),
    count = n()
  ) %>%
  arrange(desc(avg_prominence))

print(prominence_summary)

# Visualize prominence by entity type
ggplot(entities %>% filter(!is.na(prominence_score)),
       aes(x = entity_type, y = prominence_score, fill = entity_type)) +
  geom_boxplot() +
  labs(title = "Prominence Score Distribution by Entity Type",
       x = "Entity Type",
       y = "Prominence Score") +
  theme_minimal() +
  theme(legend.position = "none",
        plot.title = element_text(size = 16, face = "bold"),
        axis.text.x = element_text(angle = 45, hjust = 1))

ggsave("prominence_distribution.png", width = 10, height = 6, dpi = 300)
cat("Saved: prominence_distribution.png\n")

# Entity Co-occurrence Analysis
cat("\n=== ENTITY CO-OCCURRENCE ===\n")

# Find entities that frequently appear together
entity_pairs <- entities %>%
  select(first_mention_record_id, entity_name) %>%
  inner_join(entities %>% select(first_mention_record_id, entity_name),
             by = "first_mention_record_id",
             relationship = "many-to-many") %>%
  filter(entity_name.x < entity_name.y) %>%
  count(entity_name.x, entity_name.y, sort = TRUE) %>%
  head(20)

cat("\nTop 20 Entity Co-occurrences (entities appearing in same records):\n")
print(entity_pairs)

# Summary Statistics
cat("\n=== OVERALL STATISTICS ===\n")
cat("Total unique entities:", nrow(entities), "\n")
cat("Total relationships:", nrow(relationships), "\n")
cat("Total records:", n_distinct(entities$first_mention_record_id), "\n")
cat("Average entities per record:", round(nrow(entities) / n_distinct(entities$first_mention_record_id), 2), "\n")
cat("Average relationships per record:", round(nrow(relationships) / n_distinct(relationships$source_record_id), 2), "\n")

cat("\n=== ANALYSIS COMPLETE ===\n")
cat("Generated visualizations:\n")
cat("  - entity_type_distribution.png\n")
cat("  - top_entities.png\n")
cat("  - top_people.png\n")
cat("  - top_organizations.png\n")
cat("  - relationship_type_distribution.png\n")
cat("  - most_connected_entities.png\n")
cat("  - prominence_distribution.png\n")
cat("\nData loaded and ready for exploration!\n")
cat("Objects available: 'entities', 'relationships'\n")
