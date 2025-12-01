# Quick data inspection to see what we're working with

cat("=== ENTITIES DATA STRUCTURE ===\n")
cat("\nColumn names:\n")
print(names(entities))

cat("\n\nData dimensions:\n")
cat("Rows:", nrow(entities), "\n")
cat("Columns:", ncol(entities), "\n")

cat("\n\nFirst few rows:\n")
print(head(entities, 3))

cat("\n\nData structure:\n")
str(entities)

cat("\n\n=== RELATIONSHIPS DATA STRUCTURE ===\n")
cat("\nColumn names:\n")
print(names(relationships))

cat("\n\nData dimensions:\n")
cat("Rows:", nrow(relationships), "\n")
cat("Columns:", ncol(relationships), "\n")

cat("\n\nFirst few rows:\n")
print(head(relationships, 3))

cat("\n\nData structure:\n")
str(relationships)
