# Quick Start - R Analysis (5 Minutes)

## 🚀 Fastest Way to Get Started

### 1. Open RStudio

### 2. Set Working Directory
Copy-paste this into the **Console** (bottom-left):
```r
setwd("C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper")
```

### 3. Install Packages (First Time Only)
Copy-paste this:
```r
install.packages(c("googlesheets4", "dplyr", "ggplot2", "tidyr"))
```
Wait 2-5 minutes for installation to complete.

### 4. Load the Data
```r
source("load_data.R")
```

**First time:** Your browser will open for Google login. Sign in and grant permissions.

### 5. Explore!

**View the data:**
```r
View(entities)
View(relationships)
```

**Run example analyses:**
```r
source("example_queries.R")
```

**Generate visualizations:**
```r
source("analyze_entities.R")
```

---

## 📊 What You Can Do Now

### Top 10 Most Mentioned Entities:
```r
entities %>%
  arrange(desc(mention_count)) %>%
  head(10)
```

### Count Entity Types:
```r
entities %>%
  count(entity_type, sort = TRUE)
```

### Top People:
```r
entities %>%
  filter(entity_type == "PERSON") %>%
  arrange(desc(mention_count)) %>%
  head(10)
```

### Find Specific Entity:
```r
entities %>%
  filter(grepl("Jay Rosen", entity_name, ignore.case = TRUE))
```

### Most Connected Entities:
```r
relationships %>%
  count(source_entity, sort = TRUE) %>%
  head(10)
```

---

## 💾 Save Your Results

**Export to CSV:**
```r
write.csv(entities, "entities_export.csv", row.names = FALSE)
write.csv(relationships, "relationships_export.csv", row.names = FALSE)
```

**Save filtered results:**
```r
top_people <- entities %>%
  filter(entity_type == "PERSON") %>%
  arrange(desc(mention_count)) %>%
  head(20)

write.csv(top_people, "top_20_people.csv", row.names = FALSE)
```

---

## 🆘 Common Issues

**Error: "object 'entities' not found"**
→ Run `source("load_data.R")` first

**Error: "no package called 'googlesheets4'"**
→ Install packages first (step 3)

**Nothing happens when I run a command**
→ Make sure you pressed Enter after typing

**Can't see my data**
→ Type `View(entities)` with capital V

---

## 📖 Full Documentation

For detailed explanations, see:
- `RSTUDIO_BEGINNER_GUIDE.md` - Complete beginner's guide
- `R_ANALYSIS_GUIDE.md` - Analysis examples and documentation
- `example_queries.R` - Pre-written queries you can run

---

## ✅ Success Checklist

- [ ] RStudio open
- [ ] Working directory set
- [ ] Packages installed
- [ ] Data loaded (ran `source("load_data.R")`)
- [ ] Can see `entities` and `relationships` in Environment pane (top-right)

**You're ready!** Start exploring your data.

---

**Pro Tip:** Use the **up arrow key** in the Console to recall previous commands!
