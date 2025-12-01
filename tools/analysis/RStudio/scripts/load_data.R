# Simple data loader for Jay Rosen Archive
# Loads entities and relationships from Google Sheets

library(googlesheets4)
library(dplyr)

# Authenticate (will open browser first time)
gs4_auth()

# Sheet ID from environment configuration
sheet_id <- "1Q_Fik5KQXdkZ4dujEN8H_47K5oldLkv6-hxERuBAdpg"

# Load data
cat("Loading extracted_entities...\n")
entities <- read_sheet(sheet_id, sheet = "extracted_entities")

cat("Loading extracted_relationships...\n")
relationships <- read_sheet(sheet_id, sheet = "extracted_relationships")

# Display summary
cat("\n=== DATA LOADED ===\n")
cat("Entities:", nrow(entities), "rows x", ncol(entities), "columns\n")
cat("Relationships:", nrow(relationships), "rows x", ncol(relationships), "columns\n")

cat("\nEntity columns:", paste(names(entities), collapse = ", "), "\n")
cat("Relationship columns:", paste(names(relationships), collapse = ", "), "\n")

cat("\n=== QUICK PREVIEW ===\n")
cat("\nFirst few entities:\n")
print(head(entities, 5))

cat("\nFirst few relationships:\n")
print(head(relationships, 5))

cat("\n=== DATA READY ===\n")
cat("Use View(entities) or View(relationships) to browse the data\n")
