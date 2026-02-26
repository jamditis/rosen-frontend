# Public Journalism Movement Analysis
# Maps the network around public journalism, citizen journalism, and democratization of media

library(dplyr)
library(ggplot2)
library(tidyr)

cat("=== PUBLIC JOURNALISM MOVEMENT ANALYSIS ===\n\n")

# Ensure data is loaded
if (!exists("entities") || !exists("relationships")) {
  stop("Please run source('load_data.R') first!")
}

entities <- entities %>%
  mutate(total_mentions = as.numeric(total_mentions),
         prominence_score = as.numeric(prominence_score))

# 1. CORE CONCEPTS OF THE MOVEMENT
cat("1. CORE CONCEPTS OF PUBLIC/CITIZEN JOURNALISM:\n")

movement_keywords <- c(
  "Public Journalism", "Citizen Journalism", "Civic Journalism",
  "participatory journalism", "open source journalism",
  "crowdsourcing", "user-generated content",
  "citizen media", "grassroots journalism",
  "community journalism", "collaborative journalism",
  "networked journalism", "pro-am journalism"
)

movement_concepts <- entities %>%
  filter(entity_type == "Concept",
         grepl(paste(movement_keywords, collapse = "|"),
               entity_name, ignore.case = TRUE)) %>%
  arrange(desc(prominence_score))

cat("Movement-related concepts found:", nrow(movement_concepts), "\n\n")
print(movement_concepts %>%
        select(entity_name, prominence_score, role_or_description))

# 2. WHO DISCUSSES THESE CONCEPTS?
cat("\n2. KEY FIGURES IN THE PUBLIC JOURNALISM MOVEMENT:\n")

movement_participants <- relationships %>%
  filter(target_entity_name %in% movement_concepts$entity_name) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Person") %>%
  count(source_entity_name, sort = TRUE)

cat("Total people discussing these concepts:", nrow(movement_participants), "\n")
print(movement_participants %>% head(20))

# Visualization
if (nrow(movement_participants) >= 15) {
  top_participants <- movement_participants %>% head(15)

  ggplot(top_participants, aes(x = reorder(source_entity_name, n), y = n)) +
    geom_col(fill = "#27AE60") +
    coord_flip() +
    labs(title = "Key Figures in Public Journalism Movement",
         subtitle = "People most engaged with movement concepts",
         x = "Person",
         y = "Number of Concept References") +
    theme_minimal() +
    theme(plot.title = element_text(size = 14, face = "bold"))

  ggsave("../output/public_journalism_figures.png", width = 11, height = 8, dpi = 300)
  cat("Saved: public_journalism_figures.png\n")
}

# 3. ROSEN'S ROLE IN THE MOVEMENT
cat("\n3. JAY ROSEN'S ROLE IN PUBLIC JOURNALISM:\n")

rosen_movement <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         target_entity_name %in% movement_concepts$entity_name) %>%
  count(relationship_type, target_entity_name, sort = TRUE)

print(rosen_movement)

cat("\nRosen's relationship types with movement concepts:\n")
print(rosen_movement %>% count(relationship_type, sort = TRUE))

# 4. ORGANIZATIONS IN THE MOVEMENT
cat("\n4. ORGANIZATIONS ASSOCIATED WITH PUBLIC JOURNALISM:\n")

movement_orgs <- relationships %>%
  filter(target_entity_name %in% movement_concepts$entity_name) %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Organization") %>%
  count(source_entity_name, role_or_description, sort = TRUE)

cat("Organizations engaged with movement:", nrow(movement_orgs), "\n")
print(movement_orgs %>% head(20))

# 5. COMPARE: PUBLIC JOURNALISM VS TRADITIONAL JOURNALISM
cat("\n5. CONCEPTUAL COMPARISON:\n")
cat("Public/Citizen Journalism concepts vs Traditional Journalism concepts\n\n")

traditional_keywords <- c(
  "objectivity", "neutrality", "balance",
  "inverted pyramid", "who what when where why",
  "professional journalism", "mainstream media",
  "traditional media", "legacy media"
)

traditional_concepts <- entities %>%
  filter(entity_type == "Concept",
         grepl(paste(traditional_keywords, collapse = "|"),
               entity_name, ignore.case = TRUE))

cat("Traditional journalism concepts:", nrow(traditional_concepts), "\n")
cat("Public journalism concepts:", nrow(movement_concepts), "\n")

# Who discusses each type?
concept_comparison <- bind_rows(
  relationships %>%
    filter(target_entity_name %in% movement_concepts$entity_name) %>%
    mutate(concept_type = "Public/Citizen"),
  relationships %>%
    filter(target_entity_name %in% traditional_concepts$entity_name) %>%
    mutate(concept_type = "Traditional")
) %>%
  count(concept_type)

print(concept_comparison)

# 6. TIMELINE: EVOLUTION OF PUBLIC JOURNALISM
cat("\n6. WORKS RELATED TO PUBLIC JOURNALISM:\n")

movement_works <- relationships %>%
  filter(target_entity_name %in% movement_concepts$entity_name) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Work") %>%
  distinct(source_entity_name) %>%
  left_join(entities %>% select(entity_name, role_or_description),
            by = c("source_entity_name" = "entity_name"))

cat("Books/articles about public journalism:", nrow(movement_works), "\n")
print(movement_works %>% head(20))

# 7. CONCEPT NETWORK: What ideas connect to public journalism?
cat("\n7. CONCEPTS THAT CO-OCCUR WITH PUBLIC JOURNALISM:\n")

pub_journalism_records <- relationships %>%
  filter(grepl("Public Journalism|Citizen Journalism", target_entity_name, ignore.case = TRUE)) %>%
  pull(source_record_id) %>%
  unique()

related_concepts <- relationships %>%
  filter(source_record_id %in% pub_journalism_records) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Concept",
         !grepl("Public Journalism|Citizen Journalism", target_entity_name, ignore.case = TRUE)) %>%
  count(target_entity_name, sort = TRUE)

cat("Related concepts appearing in same records:\n")
print(related_concepts %>% head(20))

# Visualization
if (nrow(related_concepts) >= 15) {
  top_related <- related_concepts %>% head(15)

  ggplot(top_related, aes(x = reorder(target_entity_name, n), y = n)) +
    geom_col(fill = "#3498DB") +
    coord_flip() +
    labs(title = "Concepts Related to Public Journalism",
         subtitle = "Most frequently co-occurring concepts",
         x = "Concept",
         y = "Co-occurrence Count") +
    theme_minimal() +
    theme(plot.title = element_text(size = 14, face = "bold"))

  ggsave("../output/public_journalism_related_concepts.png", width = 11, height = 8, dpi = 300)
  cat("Saved: public_journalism_related_concepts.png\n")
}

# 8. ROSEN'S CONTRIBUTIONS TO THE MOVEMENT
cat("\n8. ROSEN'S SPECIFIC CONTRIBUTIONS:\n")

rosen_contributions <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type %in% c("Pioneered", "Founded By", "Originated By")) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(grepl("public|citizen|civic|community|participat",
               tolower(target_entity_name))) %>%
  distinct(target_entity_name, entity_type, relationship_type)

cat("Direct contributions to movement:\n")
print(rosen_contributions)

# 9. MOVEMENT IMPACT: Who was influenced?
cat("\n9. INFLUENCE ANALYSIS:\n")
cat("People who cite Rosen's public journalism concepts:\n")

influenced_people <- relationships %>%
  filter(target_entity_name %in% rosen_movement$target_entity_name,
         source_entity_name != "Jay Rosen") %>%
  left_join(entities %>% select(entity_name, entity_type, affiliation),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Person") %>%
  count(source_entity_name, affiliation, sort = TRUE)

print(influenced_people %>% head(20))

# 10. SUMMARY VISUALIZATION: Movement Overview
cat("\n10. GENERATING MOVEMENT OVERVIEW...\n")

movement_summary <- data.frame(
  Category = c("Concepts", "People", "Organizations", "Works", "Rosen Relations"),
  Count = c(
    nrow(movement_concepts),
    nrow(movement_participants),
    nrow(movement_orgs),
    nrow(movement_works),
    nrow(rosen_movement)
  )
)

ggplot(movement_summary, aes(x = Category, y = Count, fill = Category)) +
  geom_col() +
  geom_text(aes(label = Count), vjust = -0.5) +
  labs(title = "Public Journalism Movement: Entity Overview",
       subtitle = "Scale of movement in the archive",
       x = "Entity Category",
       y = "Count") +
  theme_minimal() +
  theme(legend.position = "none",
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/public_journalism_overview.png", width = 10, height = 7, dpi = 300)
cat("Saved: public_journalism_overview.png\n")

# SUMMARY STATS
cat("\n=== SUMMARY STATISTICS ===\n")
cat("Movement concepts identified:", nrow(movement_concepts), "\n")
cat("Key participants:", nrow(movement_participants), "\n")
cat("Organizations involved:", nrow(movement_orgs), "\n")
cat("Related works:", nrow(movement_works), "\n")
cat("Rosen's direct contributions:", nrow(rosen_contributions), "\n")
cat("People influenced:", nrow(influenced_people), "\n")

cat("\n=== ANALYSIS COMPLETE ===\n")
cat("Generated 4 visualizations in output/ folder\n")
