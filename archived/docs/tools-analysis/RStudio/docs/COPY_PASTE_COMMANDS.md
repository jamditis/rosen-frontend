# Copy-Paste Commands for RStudio Console

These commands are ready to copy-paste directly into your RStudio console!

---

## 🚀 Quick Start Commands

### Load all the data:
```r
source("load_data.R")
```

### Run Jay Rosen deep dive analysis:
```r
source("jay_rosen_analysis.R")
```

### Run example queries:
```r
source("example_queries_fixed.R")
```

### Generate all visualizations:
```r
source("analyze_entities_fixed.R")
```

---

## 🔍 Quick Search Commands

### View data in spreadsheet style:
```r
View(entities)
View(relationships)
```

### Search for any entity:
```r
entities %>% filter(grepl("New York Times", entity_name, ignore.case = TRUE))
```

### Search for Jay Rosen concepts:
```r
entities %>% filter(grepl("Jay Rosen|View from Nowhere|Church of the Savvy|PressThink", entity_name, ignore.case = TRUE))
```

### Find all people:
```r
entities %>% filter(entity_type == "Person") %>% arrange(desc(total_mentions)) %>% head(20)
```

### Find all organizations:
```r
entities %>% filter(entity_type == "Organization") %>% arrange(desc(total_mentions)) %>% head(20)
```

### Find all concepts:
```r
entities %>% filter(entity_type == "Concept") %>% arrange(desc(prominence_score)) %>% head(20)
```

---

## 📊 Jay Rosen Specific Commands

### What does Jay Rosen mention most?
```r
relationships %>% filter(source_entity_name == "Jay Rosen") %>% count(target_entity_name, sort = TRUE) %>% head(20)
```

### What concepts did Jay Rosen pioneer?
```r
relationships %>% filter(source_entity_name == "Jay Rosen", relationship_type == "Pioneered") %>% select(target_entity_name, context_snippet)
```

### What organizations does Jay Rosen criticize?
```r
relationships %>% filter(source_entity_name == "Jay Rosen", relationship_type == "Criticizes") %>% select(target_entity_name, context_snippet)
```

### Who mentions Jay Rosen?
```r
relationships %>% filter(target_entity_name == "Jay Rosen") %>% count(source_entity_name, sort = TRUE) %>% head(20)
```

### Jay Rosen's affiliations:
```r
relationships %>% filter(source_entity_name == "Jay Rosen", relationship_type == "Affiliated With") %>% select(target_entity_name, context_snippet)
```

### All Jay Rosen relationships:
```r
relationships %>% filter(source_entity_name == "Jay Rosen" | target_entity_name == "Jay Rosen") %>% View()
```

---

## 🔗 Relationship Commands

### Most common relationship types:
```r
relationships %>% count(relationship_type, sort = TRUE)
```

### Find all "Criticizes" relationships:
```r
relationships %>% filter(relationship_type == "Criticizes") %>% select(source_entity_name, target_entity_name, context_snippet) %>% View()
```

### Find all "Pioneered" relationships:
```r
relationships %>% filter(relationship_type == "Pioneered") %>% select(source_entity_name, target_entity_name, context_snippet) %>% View()
```

### Most criticized organizations:
```r
relationships %>% filter(relationship_type == "Criticizes") %>% count(target_entity_name, sort = TRUE) %>% head(15)
```

### Find relationship between two entities:
```r
relationships %>% filter((source_entity_name == "Jay Rosen" & target_entity_name == "The New York Times") | (source_entity_name == "The New York Times" & target_entity_name == "Jay Rosen"))
```

---

## 🎯 Network Analysis Commands

### Most connected entities:
```r
relationships %>% count(source_entity_name, sort = TRUE) %>% head(20)
```

### Entities with most incoming connections:
```r
relationships %>% count(target_entity_name, sort = TRUE) %>% head(20)
```

### Jay Rosen's ego network (all direct connections):
```r
jay_network <- relationships %>% filter(source_entity_name == "Jay Rosen" | target_entity_name == "Jay Rosen")
jay_network %>% mutate(other = ifelse(source_entity_name == "Jay Rosen", target_entity_name, source_entity_name)) %>% count(other, sort = TRUE) %>% head(30)
```

---

## 📈 Statistics Commands

### Count entities by type:
```r
entities %>% count(entity_type, sort = TRUE)
```

### Count relationships by type:
```r
relationships %>% count(relationship_type, sort = TRUE)
```

### Average prominence by entity type:
```r
entities %>% group_by(entity_type) %>% summarise(avg_prominence = mean(as.numeric(prominence_score), na.rm = TRUE), count = n())
```

### Records with most entities:
```r
entities %>% count(first_mention_record_id, sort = TRUE) %>% head(20)
```

### Overall statistics:
```r
cat("Total entities:", nrow(entities), "\n")
cat("Total relationships:", nrow(relationships), "\n")
cat("Total records:", n_distinct(entities$first_mention_record_id), "\n")
```

---

## 🔎 Concept Exploration Commands

### Find "View from Nowhere":
```r
entities %>% filter(grepl("View from Nowhere", entity_name, ignore.case = TRUE))
relationships %>% filter(grepl("View from Nowhere", target_entity_name, ignore.case = TRUE)) %>% select(source_entity_name, relationship_type, context_snippet)
```

### Find "Church of the Savvy":
```r
entities %>% filter(grepl("Church of the Savvy|Savvy", entity_name, ignore.case = TRUE))
relationships %>% filter(grepl("Savvy", target_entity_name, ignore.case = TRUE)) %>% select(source_entity_name, relationship_type, context_snippet)
```

### Find "Public Journalism":
```r
entities %>% filter(grepl("Public Journalism", entity_name, ignore.case = TRUE))
relationships %>% filter(grepl("Public Journalism", target_entity_name, ignore.case = TRUE)) %>% select(source_entity_name, relationship_type, context_snippet)
```

### All high-prominence concepts:
```r
entities %>% filter(entity_type == "Concept", as.numeric(prominence_score) >= 8) %>% arrange(desc(prominence_score)) %>% select(entity_name, prominence_score, role_or_description)
```

---

## 💾 Export Commands

### Export all entities to CSV:
```r
write.csv(entities, "entities_export.csv", row.names = FALSE)
```

### Export all relationships to CSV:
```r
write.csv(relationships, "relationships_export.csv", row.names = FALSE)
```

### Export Jay Rosen network to CSV:
```r
jay_network <- relationships %>% filter(source_entity_name == "Jay Rosen" | target_entity_name == "Jay Rosen")
write.csv(jay_network, "jay_rosen_network.csv", row.names = FALSE)
```

### Export top entities to CSV:
```r
top_entities <- entities %>% arrange(desc(total_mentions)) %>% head(100)
write.csv(top_entities, "top_100_entities.csv", row.names = FALSE)
```

### Export just concepts to CSV:
```r
concepts_only <- entities %>% filter(entity_type == "Concept")
write.csv(concepts_only, "all_concepts.csv", row.names = FALSE)
```

---

## 🛠️ Utility Commands

### Open working directory in file explorer:
```r
shell.exec(getwd())
```

### See what's loaded in memory:
```r
ls()
```

### Get column names:
```r
names(entities)
names(relationships)
```

### View first few rows:
```r
head(entities)
head(relationships)
```

### Get summary stats:
```r
summary(entities)
```

### Clear console (keep data):
```r
cat("\014")
```

---

## 🎨 Visualization Commands

### Create a simple bar chart:
```r
library(ggplot2)
top_10 <- entities %>% arrange(desc(total_mentions)) %>% head(10)
ggplot(top_10, aes(x = reorder(entity_name, total_mentions), y = total_mentions)) + geom_col() + coord_flip() + labs(title = "Top 10 Entities")
```

### Save the last plot:
```r
ggsave("my_plot.png", width = 10, height = 6)
```

---

## 🆘 Help Commands

### Get help on a function:
```r
?filter
?ggplot
```

### See all relationship types:
```r
unique(relationships$relationship_type)
```

### See all entity types:
```r
unique(entities$entity_type)
```

### Check if data is loaded:
```r
exists("entities")
exists("relationships")
```

---

## 💡 Pro Tips

1. **Use the up arrow** in the console to recall previous commands
2. **Use Tab** to auto-complete variable and function names
3. **Use Ctrl+L** to clear the console screen (keeps your data)
4. **Click on data in Environment pane** (top-right) to view it
5. **Press Esc** to cancel a running command

---

**Remember:** After running `source("load_data.R")`, the data is loaded and you can run any of these commands!
