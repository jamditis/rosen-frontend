# Journalism Paradigm Comparison
# Compares different approaches to journalism: Rosen's view vs mainstream vs emerging models

library(dplyr)
library(ggplot2)
library(tidyr)

cat("=== JOURNALISM PARADIGM COMPARISON ===\n\n")

# Ensure data is loaded
if (!exists("entities") || !exists("relationships")) {
  stop("Please run source('load_data.R') first!")
}

entities <- entities %>%
  mutate(total_mentions = as.numeric(total_mentions),
         prominence_score = as.numeric(prominence_score))

# DEFINE PARADIGMS
cat("Defining journalism paradigms...\n\n")

# 1. ROSEN'S ALTERNATIVE MODEL
rosen_paradigm <- c(
  "View from Nowhere", "Public Journalism", "Citizen Journalism",
  "PressThink", "Savvy style", "Church of the Savvy",
  "The people formerly known as the audience",
  "Citizens Agenda", "Verification in reverse",
  "Open Source Journalism", "Networked journalism"
)

# 2. TRADITIONAL/MAINSTREAM MODEL
traditional_paradigm <- c(
  "Objectivity", "Both sides", "He said she said",
  "Inverted pyramid", "Professional journalism",
  "Gatekeeping", "Balance", "Neutrality"
)

# 3. DIGITAL/PLATFORM ERA
digital_paradigm <- c(
  "Social media", "Algorithm", "Platform",
  "Viral", "Engagement", "Analytics",
  "Clickbait", "Native advertising", "Paywall"
)

# GET ACTUAL ENTITIES FOR EACH PARADIGM
cat("1. IDENTIFYING PARADIGM CONCEPTS IN ARCHIVE:\n")

paradigm_concepts <- bind_rows(
  entities %>%
    filter(entity_type == "Concept",
           entity_name %in% rosen_paradigm) %>%
    mutate(paradigm = "Rosen's Alternative"),

  entities %>%
    filter(entity_type == "Concept",
           grepl(paste(traditional_paradigm, collapse = "|"),
                 entity_name, ignore.case = TRUE)) %>%
    mutate(paradigm = "Traditional"),

  entities %>%
    filter(entity_type == "Concept",
           grepl(paste(digital_paradigm, collapse = "|"),
                 entity_name, ignore.case = TRUE)) %>%
    mutate(paradigm = "Digital Era")
)

paradigm_summary <- paradigm_concepts %>%
  count(paradigm)

cat("Concepts by paradigm:\n")
print(paradigm_summary)

# Visualization
ggplot(paradigm_summary, aes(x = paradigm, y = n, fill = paradigm)) +
  geom_col() +
  geom_text(aes(label = n), vjust = -0.5) +
  labs(title = "Journalism Paradigms in the Archive",
       subtitle = "Number of concepts associated with each paradigm",
       x = "Paradigm",
       y = "Number of Concepts") +
  theme_minimal() +
  theme(legend.position = "none",
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/paradigm_concepts.png", width = 10, height = 7, dpi = 300)
cat("\nSaved: paradigm_concepts.png\n")

# 2. WHO ENGAGES WITH EACH PARADIGM?
cat("\n2. ENGAGEMENT BY PARADIGM:\n")

paradigm_engagement <- relationships %>%
  inner_join(paradigm_concepts %>% select(entity_name, paradigm),
             by = c("target_entity_name" = "entity_name")) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  count(paradigm, entity_type)

cat("Who discusses each paradigm:\n")
print(paradigm_engagement)

# Visualization
ggplot(paradigm_engagement %>% filter(!is.na(entity_type)),
       aes(x = paradigm, y = n, fill = entity_type)) +
  geom_col(position = "dodge") +
  labs(title = "Who Engages with Each Journalism Paradigm",
       subtitle = "By entity type",
       x = "Paradigm",
       y = "Number of References",
       fill = "Entity Type") +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1),
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/paradigm_engagement.png", width = 11, height = 7, dpi = 300)
cat("Saved: paradigm_engagement.png\n")

# 3. PROMINENCE COMPARISON
cat("\n3. PROMINENCE SCORES BY PARADIGM:\n")

paradigm_prominence <- paradigm_concepts %>%
  group_by(paradigm) %>%
  summarise(
    avg_prominence = mean(prominence_score, na.rm = TRUE),
    median_prominence = median(prominence_score, na.rm = TRUE),
    concepts = n()
  ) %>%
  arrange(desc(avg_prominence))

print(paradigm_prominence)

# 4. RELATIONSHIP TYPES BY PARADIGM
cat("\n4. HOW PEOPLE RELATE TO EACH PARADIGM:\n")

paradigm_relationships <- relationships %>%
  inner_join(paradigm_concepts %>% select(entity_name, paradigm),
             by = c("target_entity_name" = "entity_name")) %>%
  count(paradigm, relationship_type, sort = TRUE)

print(paradigm_relationships)

# Visualization
ggplot(paradigm_relationships,
       aes(x = relationship_type, y = n, fill = paradigm)) +
  geom_col(position = "dodge") +
  labs(title = "Relationship Types by Journalism Paradigm",
       subtitle = "How entities engage with different models",
       x = "Relationship Type",
       y = "Count",
       fill = "Paradigm") +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1),
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/paradigm_relationships.png", width = 12, height = 7, dpi = 300)
cat("Saved: paradigm_relationships.png\n")

# 5. ROSEN'S STANCE ON EACH PARADIGM
cat("\n5. JAY ROSEN'S STANCE ON DIFFERENT PARADIGMS:\n")

rosen_paradigm_stance <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  inner_join(paradigm_concepts %>% select(entity_name, paradigm),
             by = c("target_entity_name" = "entity_name")) %>%
  count(paradigm, relationship_type)

print(rosen_paradigm_stance)

# Visualization
ggplot(rosen_paradigm_stance,
       aes(x = paradigm, y = n, fill = relationship_type)) +
  geom_col() +
  labs(title = "Jay Rosen's Engagement with Different Paradigms",
       subtitle = "How Rosen relates to alternative, traditional, and digital models",
       x = "Paradigm",
       y = "Number of References",
       fill = "Relationship Type") +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1),
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/rosen_paradigm_stance.png", width = 11, height = 7, dpi = 300)
cat("Saved: rosen_paradigm_stance.png\n")

# 6. PARADIGM ADOPTION OVER TIME (by first mention)
cat("\n6. WHICH PARADIGM IS MOST DISCUSSED?\n")

paradigm_mentions <- relationships %>%
  inner_join(paradigm_concepts %>% select(entity_name, paradigm),
             by = c("target_entity_name" = "entity_name")) %>%
  count(paradigm, sort = TRUE)

print(paradigm_mentions)

# 7. CROSS-PARADIGM CONCEPTS
cat("\n7. CONCEPTS BRIDGING PARADIGMS:\n")
cat("Looking for concepts that appear in multiple paradigm discussions...\n\n")

# Get records that discuss multiple paradigms
multi_paradigm_records <- relationships %>%
  inner_join(paradigm_concepts %>% select(entity_name, paradigm),
             by = c("target_entity_name" = "entity_name")) %>%
  group_by(source_record_id) %>%
  summarise(paradigms_discussed = n_distinct(paradigm)) %>%
  filter(paradigms_discussed > 1)

cat("Records discussing multiple paradigms:", nrow(multi_paradigm_records), "\n")

# 8. KEY FIGURES BY PARADIGM
cat("\n8. KEY FIGURES ASSOCIATED WITH EACH PARADIGM:\n")

paradigm_people <- relationships %>%
  inner_join(paradigm_concepts %>% select(entity_name, paradigm),
             by = c("target_entity_name" = "entity_name")) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Person") %>%
  count(paradigm, source_entity_name, sort = TRUE)

cat("\nTop people per paradigm:\n")
paradigm_people %>%
  group_by(paradigm) %>%
  slice_max(n, n = 5) %>%
  print()

# 9. ORGANIZATIONS ALIGNED WITH EACH PARADIGM
cat("\n9. ORGANIZATIONS BY PARADIGM:\n")

paradigm_orgs <- relationships %>%
  inner_join(paradigm_concepts %>% select(entity_name, paradigm),
             by = c("target_entity_name" = "entity_name")) %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("source_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Organization") %>%
  count(paradigm, source_entity_name, sort = TRUE)

cat("\nTop organizations per paradigm:\n")
paradigm_orgs %>%
  group_by(paradigm) %>%
  slice_max(n, n = 5) %>%
  print()

# 10. COMPREHENSIVE COMPARISON TABLE
cat("\n10. PARADIGM COMPARISON TABLE:\n")

comparison_table <- paradigm_concepts %>%
  group_by(paradigm) %>%
  summarise(
    Concepts = n(),
    Avg_Prominence = round(mean(prominence_score, na.rm = TRUE), 2),
    Total_Mentions = sum(total_mentions, na.rm = TRUE)
  ) %>%
  left_join(
    paradigm_engagement %>%
      group_by(paradigm) %>%
      summarise(Entity_Types = n_distinct(entity_type)),
    by = "paradigm"
  ) %>%
  left_join(
    paradigm_mentions %>% rename(Total_References = n),
    by = "paradigm"
  )

print(comparison_table)

# Export comparison table
write.csv(comparison_table, "../output/paradigm_comparison_table.csv", row.names = FALSE)
cat("\nSaved: paradigm_comparison_table.csv\n")

# SUMMARY
cat("\n=== SUMMARY STATISTICS ===\n")
cat("Total paradigm concepts identified:", nrow(paradigm_concepts), "\n")
cat("  Rosen's Alternative:", sum(paradigm_concepts$paradigm == "Rosen's Alternative"), "\n")
cat("  Traditional:", sum(paradigm_concepts$paradigm == "Traditional"), "\n")
cat("  Digital Era:", sum(paradigm_concepts$paradigm == "Digital Era"), "\n")
cat("\nRecords discussing multiple paradigms:", nrow(multi_paradigm_records), "\n")
cat("Total paradigm references:", sum(paradigm_mentions$n), "\n")

cat("\n=== ANALYSIS COMPLETE ===\n")
cat("Generated 5 visualizations + 1 CSV in output/ folder\n")
