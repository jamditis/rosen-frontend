# Quick script to show which scripts need updating
files <- c("jay_rosen_concept_map.R", "public_journalism_movement.R", "journalism_paradigm_comparison.R")
for (file in files) {
  cat("\n=== Checking", file, "===\n")
  content <- readLines(file)
  join_lines <- grep("(inner_join|left_join).*by.*=", content, value = TRUE)
  # Show joins that don't already have relationship parameter
  no_rel <- grep("relationship\s*=", join_lines, invert = TRUE, value = TRUE)
  if (length(no_rel) > 0) {
    cat("Joins without relationship parameter:\n")
    print(head(no_rel, 5))
  }
}
