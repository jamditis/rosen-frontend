# Specialized Analyses for Jay Rosen Archive

**Created:** 2025-11-07
**Purpose:** Deep-dive analyses of Jay Rosen's intellectual contributions, media criticism, and the public journalism movement

---

## 📊 Available Specialized Analyses

### 1. **Jay Rosen's Concept Map** (`jay_rosen_concept_map.R`)

**What it analyzes:**
- Concepts Jay Rosen pioneered (144+ concepts)
- How others engage with and adopt his ideas
- Concept co-occurrence patterns
- Prominence and influence of his contributions

**Key Insights:**
- Maps Rosen's core concepts: "View from Nowhere", "Public Journalism", "Church of the Savvy", etc.
- Shows which entity types (people, organizations) engage with each concept
- Identifies concept adoption patterns across the journalism field
- Tracks how Rosen's ideas spread through the network

**Visualizations Generated:**
- `rosen_pioneered_concepts.png` - Top 15 concepts by prominence
- `rosen_concept_relationships.png` - How Rosen engages with concepts (Pioneered, Discusses, etc.)
- `concept_adoption_by_type.png` - Who adopts Rosen's concepts (by entity type)

**Sample Questions Answered:**
- What are Rosen's most influential concepts?
- Who cites and discusses his ideas?
- Which concepts appear together in discourse?
- How do different entity types engage with his work?

---

### 2. **Media Industry Analysis** (`media_industry_analysis.R`)

**What it analyzes:**
- Jay Rosen's relationship with media organizations
- Mainstream vs alternative media engagement
- Organizations he criticizes vs supports
- Projects and organizations he founded

**Key Insights:**
- Identifies 30+ organizations Rosen criticizes
- Compares his stance toward mainstream vs alternative media
- Maps the 151+ organizations/projects he founded
- Analyzes criticism patterns and media stance

**Visualizations Generated:**
- `rosen_media_engagement.png` - Mainstream vs alternative media relationships
- `rosen_criticized_orgs.png` - Top 15 organizations criticized
- `rosen_media_stance.png` - Critical vs supportive vs analytical engagement

**Sample Questions Answered:**
- Which media organizations does Rosen criticize most?
- How does he treat mainstream vs alternative media differently?
- What projects did he create?
- Who shares his critical perspective on media?

---

### 3. **Public Journalism Movement** (`public_journalism_movement.R`)

**What it analyzes:**
- The network around public/citizen journalism
- Key figures and organizations in the movement
- Rosen's role and contributions
- Evolution and influence of the movement

**Key Insights:**
- Identifies movement-related concepts and participants
- Maps Rosen's pioneering contributions
- Shows who was influenced by the movement
- Connects related concepts and ideas

**Visualizations Generated:**
- `public_journalism_figures.png` - Top 15 people in the movement
- `public_journalism_related_concepts.png` - Concepts that co-occur
- `public_journalism_overview.png` - Scale of movement in archive

**Sample Questions Answered:**
- Who are the key figures in public journalism?
- What organizations support the movement?
- How did Rosen contribute to its development?
- What concepts are connected to public journalism?

---

### 4. **Journalism Paradigm Comparison** (`journalism_paradigm_comparison.R`)

**What it analyzes:**
- Three journalism paradigms: Rosen's Alternative, Traditional, Digital Era
- Who engages with each paradigm
- Prominence and adoption patterns
- Cross-paradigm connections

**Key Insights:**
- Compares alternative vs traditional vs digital approaches
- Shows which paradigm gets more attention
- Identifies people and organizations aligned with each
- Tracks Rosen's engagement with different models

**Visualizations Generated:**
- `paradigm_concepts.png` - Concepts by paradigm
- `paradigm_engagement.png` - Who discusses each paradigm
- `paradigm_relationships.png` - Relationship types by paradigm
- `rosen_paradigm_stance.png` - Rosen's engagement with each model
- `paradigm_comparison_table.csv` - Comprehensive comparison data

**Sample Questions Answered:**
- How do different journalism models compare?
- Which paradigm is most discussed?
- Who champions each approach?
- How does Rosen position himself among these models?

---

## 🚀 How to Run

### Run Individual Analysis:

```r
# Set working directory
setwd("C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper/RStudio/scripts")

# Load data (first time)
source("load_data.R")

# Run specific analysis
source("jay_rosen_concept_map.R")
# OR
source("media_industry_analysis.R")
# OR
source("public_journalism_movement.R")
# OR
source("journalism_paradigm_comparison.R")
```

### Run All Analyses at Once:

```r
# Set working directory
setwd("C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper/RStudio/scripts")

# Run everything
source("run_all_analyses.R")
```

This will:
1. Load data from Google Sheets
2. Run all 4 specialized analyses
3. Generate 14 visualizations + 1 CSV
4. Show timing and summary

---

## 📈 Output Summary

### Total Output Generated:

**Visualizations:** 14 PNG files
**Data Export:** 1 CSV file
**Location:** `RStudio/output/`

### Files Created:

**Concept Analysis (3 files):**
- rosen_pioneered_concepts.png
- rosen_concept_relationships.png
- concept_adoption_by_type.png

**Media Industry (3 files):**
- rosen_media_engagement.png
- rosen_criticized_orgs.png
- rosen_media_stance.png

**Public Journalism (3 files):**
- public_journalism_figures.png
- public_journalism_related_concepts.png
- public_journalism_overview.png

**Paradigm Comparison (4 files + 1 CSV):**
- paradigm_concepts.png
- paradigm_engagement.png
- paradigm_relationships.png
- rosen_paradigm_stance.png
- paradigm_comparison_table.csv

---

## 🔍 Research Questions These Analyses Answer

### About Jay Rosen's Work:
- What are his most influential intellectual contributions?
- How do his concepts spread through the journalism field?
- Which ideas resonate most with different audiences?

### About Media Criticism:
- Which organizations does he criticize and why?
- How does he treat mainstream vs alternative media?
- Who shares his critical perspective?

### About Public Journalism:
- What is the scope and influence of the movement?
- Who are the key participants?
- How did concepts evolve and spread?

### About Journalism Models:
- How do different paradigms compare?
- Which approach gets more traction?
- Where do traditional and alternative journalism clash or merge?

---

## 💡 Advanced Usage

### Customize Analysis Focus:

Each script includes variables you can modify:

**In `jay_rosen_concept_map.R`:**
```r
# Change which concepts to track
key_concepts <- c(
  "View from Nowhere",
  "Your custom concept here",
  # Add more...
)
```

**In `media_industry_analysis.R`:**
```r
# Add your own mainstream media keywords
mainstream_keywords <- c(
  "New York Times",
  "Your media org here",
  # Add more...
)
```

**In `journalism_paradigm_comparison.R`:**
```r
# Define custom paradigms
rosen_paradigm <- c("concept1", "concept2", ...)
traditional_paradigm <- c("concept1", "concept2", ...)
```

### Export Custom Results:

All analyses use standard dplyr operations, so you can easily export:

```r
# After running an analysis, export any result
write.csv(your_result_dataframe, "../output/custom_export.csv", row.names = FALSE)
```

---

## 📚 Integration with Other Analyses

These specialized analyses complement the general analyses:

- **`example_queries_fixed.R`** - General statistics
- **`analyze_entities_fixed.R`** - Full archive visualization
- **`jay_rosen_analysis.R`** - Rosen's network overview
- **`explore_entities.R`** - Interactive exploration

**Workflow suggestion:**
1. Start with `analyze_entities_fixed.R` for overview
2. Run `jay_rosen_analysis.R` to understand Rosen's network
3. Use specialized analyses for deep dives
4. Use `explore_entities.R` for follow-up questions

---

## 🎯 Key Findings Preview

Based on the data (5,160 entities, 7,499 relationships):

### Rosen's Contributions:
- **Key concepts pioneered** (view from nowhere, the people formerly known as the audience, etc.)
- **1,428 total connections** (most in archive)
- **Organizations founded** (Studio 20, PressThink, NewAssignment.net, etc.)
- **Note:** Run analysis to get current counts - "Founded By" and "Pioneered" are tracked separately

### Movement Scope:
- **Public/Citizen Journalism** concepts appear across multiple entity types
- **People, organizations, and works** all engage with movement ideas
- **Cross-paradigm dialogue** between traditional and alternative models

### Paradigm Patterns:
- **Three distinct approaches** to journalism identified
- **Different stakeholders** align with different models
- **Rosen bridges** multiple paradigms while championing alternatives

---

## 🔬 For Researchers

These analyses are designed for:
- **Academic research** on journalism history and theory
- **Journalism education** curriculum development
- **Media criticism** understanding Rosen's influence
- **Network analysis** of intellectual movements

### Citation-Ready Data:
All visualizations include:
- Clear titles and subtitles
- Proper axis labels
- Source attribution (from archive data)

### Reproducible Research:
- All code is open and documented
- Data source is clearly identified
- Methods are transparent (dplyr operations)

---

## 🆘 Troubleshooting

**Analysis takes too long:**
- Run individual analyses instead of `run_all_analyses.R`
- Results vary based on system and internet speed

**Missing concepts:**
- Check entity extraction in main archive
- Concept names must match exactly
- Use `grepl()` for partial matching

**Visualizations unclear:**
- Modify plot themes in scripts
- Adjust `width` and `height` in `ggsave()`
- Change colors with `fill` parameter

---

## 📖 Next Steps

1. **Run `run_all_analyses.R`** to generate all visualizations
2. **Browse output folder** to see results
3. **Customize scripts** for your research questions
4. **Export findings** to CSV for further analysis
5. **Combine with other tools** (network analysis, timeline visualization)

---

**For questions or custom analyses:** See main documentation in `../README.md` or project log in `../../narrative/PROJECT_LOG.md`
