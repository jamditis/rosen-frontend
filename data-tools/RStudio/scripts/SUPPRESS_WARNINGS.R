# Suppress Many-to-Many Join Warnings
#
# If you see warnings like "Detected an unexpected many-to-many relationship",
# this is normal and expected in this dataset because:
# - Entity names can appear multiple times (duplicates, variations)
# - Concepts can have multiple classifications
# - Organizations can match multiple criteria
#
# These warnings don't affect the analysis results - they're just informational.
#
# To suppress these warnings globally, run this before your analyses:

options(dplyr.summarise.inform = FALSE)
options(warn = -1)  # Suppress all warnings (use cautiously)

# Or to just acknowledge many-to-many relationships,
# the scripts have been updated to include relationship = "many-to-many"
# in the key join operations.

# To restore warnings:
# options(warn = 0)
