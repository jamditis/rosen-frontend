# Interactive Entity Explorer
# Search and explore specific entities in the archive
# Copy-paste individual sections into the console

library(dplyr)

cat("=== ENTITY EXPLORER ===\n")
cat("This script has ready-to-use search queries.\n")
cat("Copy-paste any section below into your console!\n\n")

# ============================================
# SECTION 1: SEARCH BY ENTITY NAME
# ============================================

# Search for any entity by name (case-insensitive)
# CHANGE "New York Times" to whatever you want to search for

search_term <- "New York Times"

cat(paste0("SEARCHING FOR: '", search_term, "'\n\n"))

search_results <- entities %>%
  filter(grepl(search_term, entity_name, ignore.case = TRUE)) %>%
  select(entity_name, entity_type, total_mentions, prominence_score, role_or_description)

cat("Search results:\n")
print(search_results)

# Show relationships for the found entity
if (nrow(search_results) > 0) {
  entity_to_explore <- search_results$entity_name[1]

  cat(paste0("\n\nRelationships for '", entity_to_explore, "':\n"))

  # Outgoing relationships
  cat("\nWhat this entity discusses/mentions/criticizes:\n")
  outgoing <- relationships %>%
    filter(source_entity_name == entity_to_explore) %>%
    count(relationship_type, target_entity_name, sort = TRUE) %>%
    head(20)
  print(outgoing)

  # Incoming relationships
  cat("\nWho discusses/mentions this entity:\n")
  incoming <- relationships %>%
    filter(target_entity_name == entity_to_explore) %>%
    count(source_entity_name, relationship_type, sort = TRUE) %>%
    head(20)
  print(incoming)
}

cat("\n\n================================================\n")
cat("TO USE THIS SECTION:\n")
cat("1. Change the search_term variable above\n")
cat("2. Select all of SECTION 1 and run it\n")
cat("================================================\n\n")


# ============================================
# SECTION 2: FIND ALL ENTITIES OF A TYPE
# ============================================

# Options: "Person", "Organization", "Concept", "Work", "Event", "Location"

entity_type_to_find <- "Concept"

cat(paste0("\nALL ", toupper(entity_type_to_find), " ENTITIES:\n"))

type_results <- entities %>%
  filter(entity_type == entity_type_to_find) %>%
  arrange(desc(total_mentions), desc(prominence_score)) %>%
  select(entity_name, total_mentions, prominence_score, role_or_description) %>%
  head(30)

print(type_results)

cat("\n\n================================================\n")
cat("TO USE THIS SECTION:\n")
cat("1. Change entity_type_to_find above\n")
cat("2. Options: Person, Organization, Concept, Work, Event, Location\n")
cat("3. Select all of SECTION 2 and run it\n")
cat("================================================\n\n")


# ============================================
# SECTION 3: FIND RELATIONSHIPS BETWEEN TWO ENTITIES
# ============================================

entity_1 <- "Jay Rosen"
entity_2 <- "The New York Times"

cat(paste0("\nRELATIONSHIPS BETWEEN '", entity_1, "' AND '", entity_2, "':\n\n"))

# Direct relationships
direct_rels <- relationships %>%
  filter((source_entity_name == entity_1 & target_entity_name == entity_2) |
         (source_entity_name == entity_2 & target_entity_name == entity_1)) %>%
  select(source_entity_name, relationship_type, target_entity_name, context_snippet)

if (nrow(direct_rels) > 0) {
  cat("Direct relationships:\n")
  print(direct_rels)
} else {
  cat("No direct relationships found.\n")
}

# Common entities they both mention
cat("\nEntities both mention:\n")
common_mentions <- relationships %>%
  filter(source_entity_name == entity_1) %>%
  inner_join(
    relationships %>% filter(source_entity_name == entity_2),
    by = c("target_entity_name" = "target_entity_name")
  ) %>%
  count(target_entity_name, sort = TRUE) %>%
  head(10)

print(common_mentions)

cat("\n\n================================================\n")
cat("TO USE THIS SECTION:\n")
cat("1. Change entity_1 and entity_2 variables above\n")
cat("2. Select all of SECTION 3 and run it\n")
cat("================================================\n\n")


# ============================================
# SECTION 4: EXPLORE A SPECIFIC CONCEPT
# ============================================

concept_name <- "View from Nowhere"

cat(paste0("\nEXPLORING CONCEPT: '", concept_name, "'\n\n"))

# Find the concept
concept_info <- entities %>%
  filter(grepl(concept_name, entity_name, ignore.case = TRUE)) %>%
  select(entity_name, role_or_description, total_mentions, prominence_score)

cat("Concept information:\n")
print(concept_info)

# Who discusses this concept?
cat("\nWho discusses this concept:\n")
concept_rels <- relationships %>%
  filter(grepl(concept_name, target_entity_name, ignore.case = TRUE)) %>%
  count(source_entity_name, relationship_type, sort = TRUE) %>%
  head(20)
print(concept_rels)

# Context snippets
cat("\nContext snippets where this concept appears:\n")
concept_context <- relationships %>%
  filter(grepl(concept_name, target_entity_name, ignore.case = TRUE)) %>%
  select(source_entity_name, relationship_type, context_snippet) %>%
  head(10)
print(concept_context)

cat("\n\n================================================\n")
cat("TO USE THIS SECTION:\n")
cat("1. Change concept_name variable above\n")
cat("2. Try: 'View from Nowhere', 'Church of the Savvy', 'Public Journalism'\n")
cat("3. Select all of SECTION 4 and run it\n")
cat("================================================\n\n")


# ============================================
# SECTION 5: TOP ENTITIES BY RELATIONSHIP TYPE
# ============================================

# Relationship types: "Affiliated With", "Discusses", "Mentions", "Criticizes",
# "Published In", "Pioneered", "Inspired By", "Founded By", etc.

relationship_type_to_explore <- "Criticizes"

cat(paste0("\nTOP ENTITIES IN '", relationship_type_to_explore, "' RELATIONSHIPS:\n\n"))

# Who does this relationship most?
cat("Who does this most:\n")
top_sources <- relationships %>%
  filter(relationship_type == relationship_type_to_explore) %>%
  count(source_entity_name, sort = TRUE) %>%
  head(15)
print(top_sources)

# Who receives this relationship most?
cat("\nWho receives this most:\n")
top_targets <- relationships %>%
  filter(relationship_type == relationship_type_to_explore) %>%
  count(target_entity_name, sort = TRUE) %>%
  head(15)
print(top_targets)

cat("\n\n================================================\n")
cat("TO USE THIS SECTION:\n")
cat("1. Change relationship_type_to_explore above\n")
cat("2. See all types with: unique(relationships$relationship_type)\n")
cat("3. Select all of SECTION 5 and run it\n")
cat("================================================\n\n")


# ============================================
# SECTION 6: FIND ENTITIES WITH SPECIFIC AFFILIATIONS
# ============================================

affiliation_search <- "New York Times"

cat(paste0("\nPEOPLE AFFILIATED WITH: '", affiliation_search, "'\n\n"))

affiliated_people <- entities %>%
  filter(entity_type == "Person",
         grepl(affiliation_search, affiliation, ignore.case = TRUE)) %>%
  select(entity_name, affiliation, role_or_description, total_mentions) %>%
  arrange(desc(total_mentions))

print(affiliated_people)

cat("\n\n================================================\n")
cat("TO USE THIS SECTION:\n")
cat("1. Change affiliation_search variable above\n")
cat("2. Select all of SECTION 6 and run it\n")
cat("================================================\n\n")


# ============================================
# SECTION 7: CUSTOM SEARCH WITH FILTERS
# ============================================

# Find entities matching multiple criteria

cat("\nCUSTOM FILTERED SEARCH:\n\n")

# Example: High prominence concepts
custom_results <- entities %>%
  filter(
    entity_type == "Concept",           # Change this
    prominence_score >= 8,              # Change this
    total_mentions >= 1                 # Change this
  ) %>%
  arrange(desc(prominence_score), desc(total_mentions)) %>%
  select(entity_name, prominence_score, total_mentions, role_or_description)

print(custom_results)

cat("\n\n================================================\n")
cat("TO USE THIS SECTION:\n")
cat("1. Modify the filter conditions above\n")
cat("2. Select all of SECTION 7 and run it\n")
cat("================================================\n\n")

cat("\n=== END OF EXPLORER ===\n")
cat("Remember: You can modify any variable and re-run any section!\n")
