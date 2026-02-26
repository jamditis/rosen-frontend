# Media Industry Analysis: Jay Rosen's Relationship with Journalism Organizations
# Maps how Rosen engages with mainstream media vs alternative media

library(dplyr)
library(ggplot2)
library(tidyr)

cat("=== MEDIA INDUSTRY RELATIONSHIP ANALYSIS ===\n\n")

# Ensure data is loaded
if (!exists("entities") || !exists("relationships")) {
  stop("Please run source('load_data.R') first!")
}

entities <- entities %>%
  mutate(total_mentions = as.numeric(total_mentions),
         prominence_score = as.numeric(prominence_score))

# 1. IDENTIFY MEDIA ORGANIZATIONS
cat("1. MEDIA ORGANIZATIONS IN THE ARCHIVE:\n")

# Major mainstream media keywords
mainstream_keywords <- c(
  "New York Times", "Washington Post", "Wall Street Journal",
  "CNN", "Fox News", "MSNBC", "NBC", "CBS", "ABC",
  "NPR", "PBS", "BBC",
  "Associated Press", "Reuters", "Bloomberg",
  "USA Today", "Los Angeles Times", "Chicago Tribune"
)

media_orgs <- entities %>%
  filter(entity_type == "Organization") %>%
  mutate(
    is_mainstream = grepl(paste(mainstream_keywords, collapse = "|"),
                          entity_name, ignore.case = TRUE),
    is_media = grepl("news|media|press|times|post|journal|network|broadcast|television|radio|magazine",
                     tolower(paste(entity_name, role_or_description)))
  ) %>%
  filter(is_media) %>%
  arrange(desc(total_mentions))

cat("Total media organizations:", nrow(media_orgs), "\n")
cat("Mainstream media:", sum(media_orgs$is_mainstream, na.rm = TRUE), "\n")
cat("Alternative/other media:", sum(!media_orgs$is_mainstream, na.rm = TRUE), "\n\n")

cat("Top 20 media organizations:\n")
print(media_orgs %>%
        select(entity_name, is_mainstream, total_mentions, role_or_description) %>%
        head(20))

# 2. JAY ROSEN'S ENGAGEMENT WITH MEDIA ORGANIZATIONS
cat("\n2. HOW JAY ROSEN ENGAGES WITH MEDIA ORGANIZATIONS:\n")

rosen_media_rels <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  inner_join(media_orgs %>% select(entity_name, is_mainstream),
             by = c("target_entity_name" = "entity_name"),
             relationship = "many-to-many") %>%
  count(relationship_type, is_mainstream, sort = TRUE)

print(rosen_media_rels)

# Visualization: Mainstream vs Alternative
ggplot(rosen_media_rels, aes(x = relationship_type, y = n,
                              fill = ifelse(is_mainstream, "Mainstream", "Alternative"))) +
  geom_col(position = "dodge") +
  labs(title = "Jay Rosen's Engagement with Media Organizations",
       subtitle = "Mainstream vs Alternative Media",
       x = "Relationship Type",
       y = "Count",
       fill = "Media Type") +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1),
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/rosen_media_engagement.png", width = 12, height = 7, dpi = 300)
cat("\nSaved: rosen_media_engagement.png\n")

# 3. ORGANIZATIONS ROSEN CRITICIZES
cat("\n3. ORGANIZATIONS JAY ROSEN CRITICIZES:\n")

criticized_orgs <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Criticizes") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Organization") %>%
  count(target_entity_name, role_or_description, sort = TRUE)

cat("Total organizations criticized:", nrow(criticized_orgs), "\n")
print(criticized_orgs %>% head(15))

# Visualization
if (nrow(criticized_orgs) > 0) {
  top_criticized <- criticized_orgs %>% head(15)

  ggplot(top_criticized, aes(x = reorder(target_entity_name, n), y = n)) +
    geom_col(fill = "#E74C3C") +
    coord_flip() +
    labs(title = "Media Organizations Most Criticized by Jay Rosen",
         subtitle = "Top 15 by number of critical mentions",
         x = "Organization",
         y = "Number of Critical Mentions") +
    theme_minimal() +
    theme(plot.title = element_text(size = 14, face = "bold"))

  ggsave("../output/rosen_criticized_orgs.png", width = 11, height = 8, dpi = 300)
  cat("Saved: rosen_criticized_orgs.png\n")
}

# 4. ORGANIZATIONS ROSEN FOUNDED vs CONCEPTS PIONEERED
# NOTE: These are DIFFERENT relationship types and should NOT be combined!
# - "Founded By" = Organization/Work was created by someone (institutional)
# - "Pioneered" = Person was first to develop a concept/practice (intellectual)
cat("\n4. JAY ROSEN'S BUILDING AND INTELLECTUAL CONTRIBUTIONS:\n")
cat("   (Separating 'Founded By' from 'Pioneered' - these are distinct!)\n\n")

# 4a. ORGANIZATIONS ACTUALLY FOUNDED (institutional founding)
orgs_founded <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Founded By") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Organization") %>%
  distinct(target_entity_name, role_or_description)

cat("4a. ORGANIZATIONS Founded By Jay Rosen:\n")
cat("    Count:", nrow(orgs_founded), "\n")
if (nrow(orgs_founded) > 0) {
  print(orgs_founded %>% arrange(target_entity_name))
}

# 4b. CONCEPTS PIONEERED (intellectual contributions)
concepts_pioneered <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Pioneered") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Concept") %>%
  distinct(target_entity_name, role_or_description)

cat("\n4b. CONCEPTS Pioneered by Jay Rosen:\n")
cat("    Count:", nrow(concepts_pioneered), "\n")
if (nrow(concepts_pioneered) > 0) {
  print(concepts_pioneered %>% arrange(target_entity_name))
}

# 4c. WORKS created (for completeness)
works_created <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Founded By") %>%
  left_join(entities %>% select(entity_name, entity_type, role_or_description),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Work") %>%
  distinct(target_entity_name, role_or_description)

cat("\n4c. WORKS with 'Founded By' relationship:\n")
cat("    Count:", nrow(works_created), "\n")
cat("    (Note: 'Founded By' may be mis-applied to Works; should be 'Author Of')\n")

# Summary of section 4
cat("\n4d. SUMMARY - Correctly Separated Counts:\n")
cat("    Organizations founded:", nrow(orgs_founded), "\n")
cat("    Concepts pioneered:", nrow(concepts_pioneered), "\n")
cat("    Works (potentially miscategorized):", nrow(works_created), "\n")
cat("    NOTE: Do NOT combine these counts - they represent different things!\n")

# 5. COMPARISON: MAINSTREAM VS INDEPENDENT JOURNALISM
cat("\n5. ROSEN'S STANCE: MAINSTREAM VS INDEPENDENT JOURNALISM:\n")

stance_analysis <- relationships %>%
  filter(source_entity_name == "Jay Rosen") %>%
  inner_join(media_orgs %>% select(entity_name, is_mainstream),
             by = c("target_entity_name" = "entity_name"),
             relationship = "many-to-many") %>%
  mutate(
    stance = case_when(
      relationship_type == "Criticizes" ~ "Critical",
      relationship_type == "Supports" ~ "Supportive",
      relationship_type == "Discusses" ~ "Analytical",
      relationship_type == "Mentions" ~ "Mentions",
      TRUE ~ "Other"
    )
  ) %>%
  count(is_mainstream, stance)

print(stance_analysis)

# Visualization
ggplot(stance_analysis, aes(x = stance, y = n,
                            fill = ifelse(is_mainstream, "Mainstream", "Alternative"))) +
  geom_col(position = "dodge") +
  labs(title = "Jay Rosen's Stance Toward Media Organizations",
       subtitle = "Critical, supportive, or analytical engagement",
       x = "Engagement Type",
       y = "Count",
       fill = "Media Type") +
  theme_minimal() +
  theme(axis.text.x = element_text(angle = 45, hjust = 1),
        plot.title = element_text(size = 14, face = "bold"))

ggsave("../output/rosen_media_stance.png", width = 11, height = 7, dpi = 300)
cat("Saved: rosen_media_stance.png\n")

# 6. TOP DISCUSSED ORGANIZATIONS
cat("\n6. MEDIA ORGANIZATIONS MOST DISCUSSED BY ROSEN:\n")

discussed_orgs <- relationships %>%
  filter(source_entity_name == "Jay Rosen",
         relationship_type == "Discusses") %>%
  left_join(entities %>% select(entity_name, entity_type),
            by = c("target_entity_name" = "entity_name"),
            relationship = "many-to-many") %>%
  filter(entity_type == "Organization") %>%
  count(target_entity_name, sort = TRUE)

print(discussed_orgs %>% head(20))

# 7. NETWORK OF MEDIA CRITICISM
cat("\n7. MEDIA CRITICISM NETWORK:\n")
cat("Finding entities that also criticize the same organizations as Rosen...\n")

# Find organizations Rosen criticizes
rosen_criticized <- relationships %>%
  filter(source_entity_name == "Jay Rosen", relationship_type == "Criticizes") %>%
  pull(target_entity_name)

# Find who else criticizes them
shared_criticism <- relationships %>%
  filter(target_entity_name %in% rosen_criticized,
         relationship_type == "Criticizes",
         source_entity_name != "Jay Rosen") %>%
  count(source_entity_name, sort = TRUE)

cat("Other entities sharing Rosen's critical perspective:\n")
print(shared_criticism %>% head(15))

# 8. SUMMARY STATS
cat("\n=== SUMMARY STATISTICS ===\n")
cat("Total media organizations in archive:", nrow(media_orgs), "\n")
cat("Organizations Rosen criticizes:", nrow(criticized_orgs), "\n")
cat("Organizations Rosen discusses:", nrow(discussed_orgs), "\n")
cat("\n--- Building vs Intellectual Contributions (SEPARATED) ---\n")
cat("Organizations Rosen founded:", nrow(orgs_founded), "\n")
cat("Concepts Rosen pioneered:", nrow(concepts_pioneered), "\n")
cat("Works (may need reclassification):", nrow(works_created), "\n")
cat("\nMainstream media relationships:", sum(rosen_media_rels$is_mainstream, na.rm = TRUE), "\n")
cat("Alternative media relationships:", sum(!rosen_media_rels$is_mainstream, na.rm = TRUE), "\n")

cat("\n=== ANALYSIS COMPLETE ===\n")
cat("Generated 4 visualizations in output/ folder\n")
cat("\nIMPORTANT: Organizations founded and Concepts pioneered are DIFFERENT.\n")
cat("Do not combine these counts to make claims about 'organizations founded.'\n")
