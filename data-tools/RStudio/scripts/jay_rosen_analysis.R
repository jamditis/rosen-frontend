# Jay Rosen Deep Dive Analysis
# Focused queries on Jay Rosen's network, concepts, and journalism criticism
# Just run: source("jay_rosen_analysis.R")

library(dplyr)
library(ggplot2)

cat("=== JAY ROSEN DEEP DIVE ANALYSIS ===\n\n")

# 1. WHO DOES JAY ROSEN MENTION MOST?
cat("1. TOP 20 ENTITIES JAY ROSEN MENTIONS:\n")
jay_mentions <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  count(target_entity_name, sort = TRUE) %>%
  head(20)
print(jay_mentions)

# Add entity types to understand what he mentions
cat("\n   With entity types:\n")
jay_mentions_typed <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  count(target_entity_name, sort = TRUE) %>%
  head(20) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name"))
print(jay_mentions_typed)

# 2. JAY ROSEN'S KEY CONCEPTS
cat("\n2. CONCEPTS ASSOCIATED WITH JAY ROSEN:\n")
jay_concepts <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name")) %>%
  filter(entity_type == "Concept") %>%
  count(target_entity_name, relationship_type, sort = TRUE)
print(jay_concepts)

cat("\n   Jay Rosen concepts with descriptions:\n")
jay_concepts_detailed <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("target_entity_name" = "entity_name")) %>%
  filter(entity_type == "Concept") %>%
  distinct(target_entity_name, role_or_description, relationship_type) %>%
  arrange(target_entity_name)
print(jay_concepts_detailed)

# 3. CONCEPTS JAY ROSEN PIONEERED
cat("\n3. CONCEPTS JAY ROSEN PIONEERED:\n")
jay_pioneered <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Pioneered") %>%
  left_join(entities %>% select(entity_name, role_or_description),
            by = c("target_entity_name" = "entity_name")) %>%
  select(target_entity_name, role_or_description)
print(jay_pioneered)

# 4. ALL JOURNALISM CRITICISM CONCEPTS (HIGH PROMINENCE)
cat("\n4. TOP JOURNALISM CONCEPTS IN ARCHIVE (by prominence):\n")
top_concepts <- entities %>%
  filter(entity_type == "Concept") %>%
  arrange(desc(prominence_score), desc(total_mentions)) %>%
  select(entity_name, prominence_score, role_or_description) %>%
  head(20)
print(top_concepts)

# 5. ORGANIZATIONS JAY ROSEN CRITICIZES
cat("\n5. ORGANIZATIONS JAY ROSEN CRITICIZES:\n")
jay_criticizes <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Criticizes") %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name")) %>%
  filter(entity_type == "Organization") %>%
  select(target_entity_name, context_snippet)
print(jay_criticizes)

# 6. WHO MENTIONS JAY ROSEN?
cat("\n6. TOP 20 ENTITIES THAT MENTION JAY ROSEN:\n")
mentions_jay <- relationships %>%
  filter(target_entity_name == "Jay Rosen") %>%
  count(source_entity_name, sort = TRUE) %>%
  head(20)
print(mentions_jay)

# 7. JAY ROSEN'S AFFILIATIONS
cat("\n7. JAY ROSEN'S AFFILIATIONS:\n")
jay_affiliations <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Affiliated With") %>%
  select(target_entity_name, context_snippet)
print(jay_affiliations)

# 8. MOST CRITICIZED ORGANIZATIONS (OVERALL)
cat("\n8. MOST CRITICIZED ORGANIZATIONS IN ARCHIVE:\n")
criticized_orgs <- relationships %>%
  filter(relationship_type == "Criticizes") %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name")) %>%
  filter(entity_type == "Organization") %>%
  count(target_entity_name, sort = TRUE) %>%
  head(15)
print(criticized_orgs)

# 9. KEY WORKS ASSOCIATED WITH JAY ROSEN
cat("\n9. WORKS (ARTICLES, BOOKS) ASSOCIATED WITH JAY ROSEN:\n")
jay_works <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("target_entity_name" = "entity_name")) %>%
  filter(entity_type == "Work") %>%
  distinct(target_entity_name, role_or_description) %>%
  head(20)
print(jay_works)

# 10. PEOPLE JAY ROSEN IS CONNECTED TO
cat("\n10. TOP 20 PEOPLE IN JAY ROSEN'S NETWORK:\n")
jay_people <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description, affiliation),
            by = c("target_entity_name" = "entity_name")) %>%
  filter(entity_type == "Person") %>%
  count(target_entity_name, role_or_description, affiliation, sort = TRUE) %>%
  head(20)
print(jay_people)

# 11. RELATIONSHIP TYPE BREAKDOWN FOR JAY ROSEN
cat("\n11. JAY ROSEN'S RELATIONSHIP TYPES (what he does):\n")
jay_rel_types <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  count(relationship_type, sort = TRUE)
print(jay_rel_types)

# Visualize it
ggplot(jay_rel_types, aes(x = reorder(relationship_type, n), y = n, fill = relationship_type)) +
  geom_col() +
  coord_flip() +
  labs(title = "Jay Rosen's Relationship Types",
       subtitle = "How Jay Rosen engages with other entities",
       x = "Relationship Type",
       y = "Count") +
  theme_minimal() +
  theme(legend.position = "none",
        plot.title = element_text(size = 14, face = "bold"))

ggsave("jay_rosen_relationships.png", width = 10, height = 6, dpi = 300)
cat("\nSaved: jay_rosen_relationships.png\n")

# 12. JAY ROSEN EGO NETWORK (all direct connections)
cat("\n12. JAY ROSEN EGO NETWORK - ALL DIRECT CONNECTIONS:\n")
jay_ego <- relationships %>%
  filter(source_entity_name == "Jay Rosen" | target_entity_name == "Jay Rosen") %>%
  mutate(other_entity = ifelse(source_entity_name == "Jay Rosen",
                                target_entity_name,
                                source_entity_name)) %>%
  count(other_entity, sort = TRUE) %>%
  head(30)
print(jay_ego)

# 13. FIND SPECIFIC FAMOUS CONCEPTS
cat("\n13. SEARCHING FOR FAMOUS JAY ROSEN CONCEPTS:\n")
famous_concepts <- c("View from Nowhere", "Church of the Savvy", "PressThink",
                     "Public Journalism", "Savvy")

for (concept in famous_concepts) {
  cat(paste0("\n   '", concept, "':\n"))
  result <- entities %>%
    filter(grepl(concept, entity_name, ignore.case = TRUE)) %>%
    select(entity_name, entity_type, role_or_description, total_mentions, prominence_score)

  if (nrow(result) > 0) {
    print(result)

    # Show relationships
    rels <- relationships %>%
      filter(grepl(concept, target_entity_name, ignore.case = TRUE) |
             grepl(concept, source_entity_name, ignore.case = TRUE)) %>%
      head(5) %>%
      select(source_entity_name, relationship_type, target_entity_name)

    if (nrow(rels) > 0) {
      cat("   Sample relationships:\n")
      print(rels)
    }
  } else {
    cat("   Not found as standalone entity\n")
  }
}

# 14. EVENTS ASSOCIATED WITH JAY ROSEN
cat("\n14. EVENTS ASSOCIATED WITH JAY ROSEN:\n")
jay_events <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("target_entity_name" = "entity_name")) %>%
  filter(entity_type == "Event") %>%
  distinct(target_entity_name, role_or_description)
print(jay_events)

# 15. SUMMARY STATISTICS
cat("\n15. JAY ROSEN SUMMARY STATISTICS:\n")
cat("   Total outgoing relationships:",
    nrow(relationships %>% filter(source_entity_name == "Jay Rosen")), "\n")
cat("   Total incoming relationships:",
    nrow(relationships %>% filter(target_entity_name == "Jay Rosen")), "\n")
cat("   Total direct connections:",
    length(unique(c(
      relationships %>% filter(source_entity_name == "Jay Rosen") %>% pull(target_entity_name),
      relationships %>% filter(target_entity_name == "Jay Rosen") %>% pull(source_entity_name)
    ))), "\n")

jay_entity_types <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name")) %>%
  count(entity_type, sort = TRUE)

cat("\n   Entity types Jay Rosen connects to:\n")
print(jay_entity_types)

cat("\n=== ANALYSIS COMPLETE ===\n")
cat("Generated visualization: jay_rosen_relationships.png\n")
