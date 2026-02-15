# Jay Rosen's Concept Map & Intellectual Contributions
# Maps the concepts Jay Rosen pioneered and their relationships to journalism

library(dplyr)
library(ggplot2)
library(tidyr)

cat("=== JAY ROSEN'S INTELLECTUAL CONTRIBUTIONS ===\n\n")

# Ensure data is loaded
if (!exists("entities") || !exists("relationships")) {
  stop("Please run source('load_data.R') first!")
}

# Convert to numeric
entities <- entities %>%
  mutate(total_mentions = as.numeric(total_mentions),
         prominence_score = as.numeric(prominence_score))

# 1. CONCEPTS JAY ROSEN PIONEERED
cat("1. KEY CONCEPTS PIONEERED BY JAY ROSEN:\n")
pioneered_concepts <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Pioneered") %>%
  left_join(entities %>% select(entity_name, entity_type, prominence_score),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Concept") %>%
  distinct(target_entity_name, prominence_score) %>%
  arrange(desc(prominence_score))

cat("Total concepts pioneered:", nrow(pioneered_concepts), "\n\n")
cat("Top 15 most prominent:\n")
print(pioneered_concepts %>% head(15))

# Key concepts for analysis
key_concepts <- c(
  "View from Nowhere",
  "Public Journalism",
  "Citizen Journalism",
  "PressThink",
  "Savvy style",
  "The people formerly known as the audience",
  "Citizens Agenda",
  "Church of the Savvy"
)

# 2. HOW OTHERS ENGAGE WITH ROSEN'S CONCEPTS
cat("\n2. WHO DISCUSSES/CITES JAY ROSEN'S KEY CONCEPTS:\n")
concept_adoption <- relationships %>%
  filter(target_entity_name %in% key_concepts) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  count(target_entity_name, source_entity_name, entity_type, relationship_type, sort = TRUE)

cat("Total references to key concepts:", nrow(concept_adoption), "\n")
cat("\nBy entity type:\n")
print(concept_adoption %>% count(entity_type, sort = TRUE))

cat("\nTop 20 entities engaging with Rosen's concepts:\n")
print(concept_adoption %>%
        group_by(source_entity_name, entity_type) %>%
        summarise(concepts_engaged = n_distinct(target_entity_name),
                  total_references = sum(n)) %>%
        arrange(desc(total_references)) %>%
        head(20))

# 3. CONCEPT CO-OCCURRENCE (concepts mentioned together)
cat("\n3. CONCEPT CO-OCCURRENCE ANALYSIS:\n")
cat("Which of Rosen's concepts appear together in records:\n")

concept_cooccur <- relationships %>%
  filter(target_entity_name %in% key_concepts) %>%
  select(source_record_id, target_entity_name) %>%
  distinct() %>%
  inner_join(
    relationships %>%
      filter(target_entity_name %in% key_concepts) %>%
      select(source_record_id, target_entity_name) %>%
      distinct(),
    by = "source_record_id",
    relationship = "many-to-many"
  ) %>%
  filter(target_entity_name.x < target_entity_name.y) %>%
  count(target_entity_name.x, target_entity_name.y, sort = TRUE)

print(concept_cooccur %>% head(15))

# 4. VISUALIZATION: Concept Prominence
cat("\n4. GENERATING VISUALIZATIONS...\n")

# Top pioneered concepts by prominence
top_pioneered <- pioneered_concepts %>%
  filter(!is.na(prominence_score)) %>%
  head(15)

ggplot(top_pioneered, aes(x = reorder(target_entity_name, prominence_score),
                           y = prominence_score)) +
  geom_col(fill = "#2C3E50") +
  coord_flip() +
  labs(title = "Jay Rosen's Most Prominent Pioneered Concepts",
       subtitle = "Ranked by prominence score in the archive",
       x = "Concept",
       y = "Prominence Score") +
  theme_minimal() +
  theme(plot.title = element_text(size = 14, face = "bold"),
        axis.text.y = element_text(size = 9))

ggsave("../output/rosen_pioneered_concepts.png", width = 12, height = 8, dpi = 300)
cat("Saved: rosen_pioneered_concepts.png\n")

# 5. CONCEPT EVOLUTION BY RELATIONSHIP TYPE
cat("\n5. HOW JAY ROSEN ENGAGES WITH CONCEPTS:\n")
rosen_concept_rels <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Concept") %>%
  count(relationship_type, sort = TRUE)

print(rosen_concept_rels)

ggplot(rosen_concept_rels, aes(x = reorder(relationship_type, n), y = n, fill = relationship_type)) +
  geom_col() +
  coord_flip() +
  labs(title = "How Jay Rosen Engages with Concepts",
       subtitle = "Relationship types between Rosen and concepts",
       x = "Relationship Type",
       y = "Count") +
  theme_minimal() +
  theme(legend.position = "none",
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/rosen_concept_relationships.png", width = 10, height = 6, dpi = 300)
cat("Saved: rosen_concept_relationships.png\n")

# 6. CONCEPT SPREAD: Who adopted Rosen's ideas?
cat("\n6. CONCEPT ADOPTION BY ENTITY TYPE:\n")
adoption_by_type <- relationships %>%
  filter(target_entity_name %in% key_concepts,
         source_entity_name != "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  count(entity_type, target_entity_name) %>%
  filter(!is.na(entity_type))

print(adoption_by_type %>% arrange(desc(n)))

# Visualization
ggplot(adoption_by_type, aes(x = entity_type, y = n, fill = target_entity_name)) +
  geom_col() +
  labs(title = "Adoption of Rosen's Key Concepts",
       subtitle = "Which entity types engage with Rosen's ideas",
       x = "Entity Type",
       y = "Number of References",
       fill = "Concept") +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1),
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/concept_adoption_by_type.png", width = 12, height = 7, dpi = 300)
cat("Saved: concept_adoption_by_type.png\n")

# 7. SUMMARY STATS
cat("\n=== SUMMARY STATISTICS ===\n")
cat("Total concepts pioneered:", nrow(pioneered_concepts), "\n")
cat("Key concepts tracked:", length(key_concepts), "\n")
cat("Total references to key concepts:", nrow(concept_adoption), "\n")
cat("Unique entities engaging with concepts:",
    n_distinct(concept_adoption$source_entity_name), "\n")
cat("Concept co-occurrences found:", nrow(concept_cooccur), "\n")

cat("\n=== ANALYSIS COMPLETE ===\n")
cat("Generated 3 visualizations in output/ folder\n")
