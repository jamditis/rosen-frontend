# Master Analysis Runner
# Runs all specialized Jay Rosen archive analyses

cat("===========================================\n")
cat("JAY ROSEN ARCHIVE - COMPREHENSIVE ANALYSIS\n")
cat("===========================================\n\n")

# Check if data is loaded
if (!exists("entities") || !exists("relationships")) {
  cat("Loading data from Google Sheets...\n")
  source("load_data.R")
  cat("\n")
}

# Track start time
start_time <- Sys.time()

# 1. JAY ROSEN CONCEPT MAP
cat("\n>>> ANALYSIS 1/4: Jay Rosen's Intellectual Contributions <<<\n")
cat("------------------------------------------------------------\n")
source("jay_rosen_concept_map.R")

# 2. MEDIA INDUSTRY ANALYSIS
cat("\n\n>>> ANALYSIS 2/4: Media Industry Relationships <<<\n")
cat("------------------------------------------------------------\n")
source("media_industry_analysis.R")

# 3. PUBLIC JOURNALISM MOVEMENT
cat("\n\n>>> ANALYSIS 3/4: Public Journalism Movement <<<\n")
cat("------------------------------------------------------------\n")
source("public_journalism_movement.R")

# 4. PARADIGM COMPARISON
cat("\n\n>>> ANALYSIS 4/4: Journalism Paradigm Comparison <<<\n")
cat("------------------------------------------------------------\n")
source("journalism_paradigm_comparison.R")

# Summary
end_time <- Sys.time()
duration <- round(difftime(end_time, start_time, units = "mins"), 2)

cat("\n\n===========================================\n")
cat("ALL ANALYSES COMPLETE!\n")
cat("===========================================\n\n")

cat("Time taken:", duration, "minutes\n\n")

cat("Generated visualizations:\n")
cat("  From Concept Map:\n")
cat("    - rosen_pioneered_concepts.png\n")
cat("    - rosen_concept_relationships.png\n")
cat("    - concept_adoption_by_type.png\n")
cat("  From Media Industry:\n")
cat("    - rosen_media_engagement.png\n")
cat("    - rosen_criticized_orgs.png\n")
cat("    - rosen_media_stance.png\n")
cat("  From Public Journalism:\n")
cat("    - public_journalism_figures.png\n")
cat("    - public_journalism_related_concepts.png\n")
cat("    - public_journalism_overview.png\n")
cat("  From Paradigm Comparison:\n")
cat("    - paradigm_concepts.png\n")
cat("    - paradigm_engagement.png\n")
cat("    - paradigm_relationships.png\n")
cat("    - rosen_paradigm_stance.png\n")
cat("    - paradigm_comparison_table.csv\n\n")

cat("Total: 14 visualizations + 1 CSV file\n\n")

cat("All files saved to: ../output/\n\n")

cat("To view results:\n")
cat("  shell.exec('../output')  # Opens output folder\n\n")

cat("===========================================\n")
