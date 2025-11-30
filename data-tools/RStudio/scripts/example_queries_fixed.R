# Example Queries for Jay Rosen Archive Analysis - FIXED VERSION
# Run after loading data with source("load_data.R")

library(dplyr)
library(ggplot2)

# Make sure data is loaded
if (!exists("entities") || !exists("relationships")) {
  stop("Please run source('load_data.R') first to load the data")
}

# Convert text columns to numbers for analysis
entities <- entities %>%
  mutate(
    total_mentions = as.numeric(total_mentions),
    prominence_score = as.numeric(prominence_score)
  )

cat("=== EXAMPLE QUERIES ===\n\n")

# 1. Entity Type Distribution
cat("1. Entity Type Breakdown:\n")
entity_summary <- entities %>%
  count(entity_type, sort = TRUE) %>%
  mutate(percentage = n / sum(n) * 100)
print(entity_summary)

# 2. Top 10 Most Mentioned Entities (overall)
cat("\n2. Top 10 Most Mentioned Entities:\n")
top_10 <- entities %>%
  arrange(desc(total_mentions)) %>%
  select(entity_name, entity_type, total_mentions, prominence_score) %>%
  head(10)
print(top_10)

# 3. Top People
cat("\n3. Top 10 People:\n")
top_people <- entities %>%
  filter(entity_type == "Person") %>%
  arrange(desc(total_mentions)) %>%
  select(entity_name, total_mentions, role_or_description, affiliation) %>%
  head(10)
print(top_people)

# 4. Top Organizations
cat("\n4. Top 10 Organizations:\n")
top_orgs <- entities %>%
  filter(entity_type == "Organization") %>%
  arrange(desc(total_mentions)) %>%
  select(entity_name, total_mentions, role_or_description) %>%
  head(10)
print(top_orgs)

# 5. Top Concepts
cat("\n5. Top 10 Concepts:\n")
top_concepts <- entities %>%
  filter(entity_type == "Concept") %>%
  arrange(desc(total_mentions)) %>%
  select(entity_name, total_mentions, role_or_description) %>%
  head(10)
print(top_concepts)

# 6. Top Works (articles, books, etc.)
cat("\n6. Top 10 Works:\n")
top_works <- entities %>%
  filter(entity_type == "Work") %>%
  arrange(desc(total_mentions)) %>%
  select(entity_name, total_mentions, role_or_description) %>%
  head(10)
print(top_works)

# 7. Relationship Types
cat("\n7. Relationship Type Breakdown:\n")
rel_summary <- relationships %>%
  count(relationship_type, sort = TRUE) %>%
  mutate(percentage = n / sum(n) * 100)
print(rel_summary)

# 8. Most Connected Entities (by degree centrality)
cat("\n8. Most Connected Entities (Top 15):\n")
# Count outgoing connections
out_degree <- relationships %>%
  count(source_entity_name, name = "outgoing")

# Count incoming connections
in_degree <- relationships %>%
  count(target_entity_name, name = "incoming")

# Combine
degree_centrality <- full_join(
  out_degree,
  in_degree,
  by = c("source_entity_name" = "target_entity_name")
) %>%
  rename(entity_name = source_entity_name) %>%
  mutate(
    outgoing = coalesce(outgoing, 0),
    incoming = coalesce(incoming, 0),
    total_connections = outgoing + incoming
  ) %>%
  arrange(desc(total_connections)) %>%
  head(15)

print(degree_centrality)

# 9. Entity Distribution Across Records
cat("\n9. Records with Most Entities (Top 10):\n")
entity_per_record <- entities %>%
  group_by(first_mention_record_id) %>%
  summarise(
    num_entities = n(),
    entity_types = n_distinct(entity_type)
  ) %>%
  arrange(desc(num_entities)) %>%
  head(10)
print(entity_per_record)

cat("\n   Entity per record statistics:\n")
summary_stats <- entities %>%
  count(first_mention_record_id) %>%
  summarise(
    min_entities = min(n),
    max_entities = max(n),
    mean_entities = round(mean(n), 2),
    median_entities = median(n)
  )
print(summary_stats)

# 10. High Prominence Entities
cat("\n10. Highest Prominence Entities (Top 10):\n")
high_prominence <- entities %>%
  filter(!is.na(prominence_score)) %>%
  arrange(desc(prominence_score), desc(total_mentions)) %>%
  select(entity_name, entity_type, prominence_score, total_mentions, role_or_description) %>%
  head(10)
print(high_prominence)

# 11. Entities with Affiliations
cat("\n11. People with Institutional Affiliations (Sample 10):\n")
affiliated <- entities %>%
  filter(entity_type == "Person", !is.na(affiliation), affiliation != "None") %>%
  arrange(desc(total_mentions)) %>%
  select(entity_name, affiliation, role_or_description, total_mentions) %>%
  head(10)
print(affiliated)

# 12. Most Common Relationship Types by Entity Type
cat("\n12. Most Common Relationships by Entity Type:\n")
rel_by_type <- relationships %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name")) %>%
  filter(!is.na(entity_type)) %>%
  count(entity_type, relationship_type, sort = TRUE) %>%
  group_by(entity_type) %>%
  slice_head(n = 3) %>%
  ungroup()
print(rel_by_type)

# 13. Entity Co-occurrence (entities in same records)
cat("\n13. Entities That Frequently Appear Together (Top 10):\n")
cooccurrence <- entities %>%
  select(first_mention_record_id, entity_name) %>%
  inner_join(
    entities %>% select(first_mention_record_id, entity_name),
    by = "first_mention_record_id",
    relationship = "many-to-many"
  ) %>%
  filter(entity_name.x < entity_name.y) %>%
  count(entity_name.x, entity_name.y, sort = TRUE) %>%
  head(10)
print(cooccurrence)

# 14. Summary Statistics
cat("\n14. Overall Archive Statistics:\n")
cat("   Total unique entities:", nrow(entities), "\n")
cat("   Total relationships:", nrow(relationships), "\n")
cat("   Total records referenced:", n_distinct(entities$first_mention_record_id), "\n")
cat("   Average entities per record:", round(nrow(entities) / n_distinct(entities$first_mention_record_id), 2), "\n")
cat("   Average relationships per record:", round(nrow(relationships) / n_distinct(relationships$source_record_id), 2), "\n")

cat("\n   Entity type distribution:\n")
print(entities %>% count(entity_type, sort = TRUE))

cat("\n=== QUERIES COMPLETE ===\n")
cat("Modify these queries or create your own based on your research needs!\n")
