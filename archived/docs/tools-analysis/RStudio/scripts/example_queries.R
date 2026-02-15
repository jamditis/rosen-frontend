# Example Queries for Jay Rosen Archive Analysis
# Run after loading data with source("load_data.R")

library(dplyr)
library(ggplot2)

# Make sure data is loaded
if (!exists("entities") || !exists("relationships")) {
  stop("Please run source('load_data.R') first to load the data")
}

cat("=== EXAMPLE QUERIES ===\n\n")

# 1. Entity Type Distribution
cat("1. Entity Type Breakdown:\n")
entity_summary <- entities %>%
  count(entity_type, sort = TRUE) %>%
  mutate(percentage = n / sum(n) * 100)
print(entity_summary)

# 2. Top 10 Most Mentioned Entities (overall)
cat("\n2. Top 10 Most Mentioned Entities:\n")
if ("mention_count" %in% names(entities)) {
  top_10 <- entities %>%
    arrange(desc(mention_count)) %>%
    select(entity_name, entity_type, mention_count) %>%
    head(10)
  print(top_10)
}

# 3. Top People
cat("\n3. Top 10 People:\n")
if ("entity_type" %in% names(entities)) {
  top_people <- entities %>%
    filter(entity_type == "PERSON") %>%
    arrange(desc(mention_count)) %>%
    select(entity_name, mention_count) %>%
    head(10)
  print(top_people)
}

# 4. Top Organizations
cat("\n4. Top 10 Organizations:\n")
if ("entity_type" %in% names(entities)) {
  top_orgs <- entities %>%
    filter(entity_type == "ORGANIZATION") %>%
    arrange(desc(mention_count)) %>%
    select(entity_name, mention_count) %>%
    head(10)
  print(top_orgs)
}

# 5. Relationship Types
cat("\n5. Relationship Type Breakdown:\n")
if ("relationship_type" %in% names(relationships)) {
  rel_summary <- relationships %>%
    count(relationship_type, sort = TRUE)
  print(rel_summary)
}

# 6. Most Connected Entities (by degree centrality)
cat("\n6. Most Connected Entities:\n")
if (all(c("source_entity", "target_entity") %in% names(relationships))) {
  # Count outgoing connections
  out_degree <- relationships %>%
    count(source_entity, name = "outgoing")

  # Count incoming connections
  in_degree <- relationships %>%
    count(target_entity, name = "incoming")

  # Combine
  degree_centrality <- full_join(
    out_degree,
    in_degree,
    by = c("source_entity" = "target_entity")
  ) %>%
    mutate(
      outgoing = coalesce(outgoing, 0),
      incoming = coalesce(incoming, 0),
      total_degree = outgoing + incoming
    ) %>%
    arrange(desc(total_degree)) %>%
    head(10)

  print(degree_centrality)
}

# 7. Entity-Record Coverage
cat("\n7. Entity Distribution Across Records:\n")
if ("record_id" %in% names(entities)) {
  entity_per_record <- entities %>%
    group_by(record_id) %>%
    summarise(
      num_entities = n(),
      entity_types = n_distinct(entity_type)
    ) %>%
    arrange(desc(num_entities)) %>%
    head(10)

  cat("Records with most entities:\n")
  print(entity_per_record)

  # Summary stats
  cat("\nEntity per record statistics:\n")
  summary_stats <- entities %>%
    count(record_id) %>%
    summarise(
      min_entities = min(n),
      max_entities = max(n),
      mean_entities = mean(n),
      median_entities = median(n)
    )
  print(summary_stats)
}

# 8. Find entities that co-occur frequently
cat("\n8. Entities That Frequently Appear Together:\n")
if ("record_id" %in% names(entities) && "entity_name" %in% names(entities)) {
  cooccurrence <- entities %>%
    select(record_id, entity_name) %>%
    inner_join(
      entities %>% select(record_id, entity_name),
      by = "record_id",
      relationship = "many-to-many"
    ) %>%
    filter(entity_name.x < entity_name.y) %>%
    count(entity_name.x, entity_name.y, sort = TRUE) %>%
    head(10)

  print(cooccurrence)
}

# 9. Relationship density per record
cat("\n9. Records with Most Relationships:\n")
if ("record_id" %in% names(relationships)) {
  relationship_density <- relationships %>%
    count(record_id, sort = TRUE) %>%
    head(10)
  print(relationship_density)
}

# 10. Jay Rosen Concept Analysis
cat("\n10. Jay Rosen Specific Concepts:\n")
jay_rosen_concepts <- c(
  "View from Nowhere",
  "Church of the Savvy",
  "PressThink",
  "Jay Rosen",
  "NYU",
  "journalism criticism"
)

if ("entity_name" %in% names(entities)) {
  rosen_related <- entities %>%
    filter(grepl(paste(jay_rosen_concepts, collapse = "|"),
                entity_name, ignore.case = TRUE)) %>%
    arrange(desc(mention_count)) %>%
    select(entity_name, entity_type, mention_count)

  if (nrow(rosen_related) > 0) {
    print(rosen_related)
  } else {
    cat("No direct matches found. Try broader search.\n")
  }
}

cat("\n=== QUERIES COMPLETE ===\n")
cat("Modify these queries or create your own based on your research needs!\n")
