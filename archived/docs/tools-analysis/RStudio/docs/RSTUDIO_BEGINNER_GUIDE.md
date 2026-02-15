# RStudio Beginner's Guide - Running the Archive Analysis Scripts

## 📋 Prerequisites

Before you start, make sure you have:
- ✅ RStudio installed (you mentioned you have it open)
- ✅ R version 4.5.2 installed (confirmed)
- ✅ Internet connection (to install packages and access Google Sheets)
- ✅ Google account with access to the spreadsheet

---

## 🎯 Step-by-Step Instructions

### Step 1: Open RStudio and Set Working Directory

1. **Open RStudio** (if not already open)

2. **Set the working directory** to where the scripts are:
   - Click on **Session** menu → **Set Working Directory** → **Choose Directory...**
   - Navigate to: `C:\Users\amdit\OneDrive\Desktop\Crimes\playground\rosen-scraper`
   - Click **Select Folder**

   **OR** type this in the Console (bottom-left pane):
   ```r
   setwd("C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper")
   ```
   ⚠️ **Note:** Use forward slashes `/` not backslashes `\` in R paths!

3. **Verify you're in the right place:**
   ```r
   getwd()  # Should show the rosen-scraper directory
   list.files()  # Should show your R scripts
   ```

---

### Step 2: Install Required Packages (FIRST TIME ONLY)

**What are packages?** Think of them as add-ons that give R extra capabilities.

In the **Console** (bottom-left pane), run this command:

```r
install.packages(c("googlesheets4", "dplyr", "ggplot2", "tidyr"))
```

**What to expect:**
- This will take 2-5 minutes
- You'll see lots of text scrolling by - this is normal!
- You might be asked to choose a CRAN mirror - pick any USA location
- If asked about compiling from source, type `n` and press Enter
- Wait until you see the `>` prompt again

**Common issue:** If you get permission errors, try:
```r
install.packages(c("googlesheets4", "dplyr", "ggplot2", "tidyr"),
                 lib = Sys.getenv("R_LIBS_USER"))
```

---

### Step 3: Run Your First Script - Load the Data

Now let's load the data from Google Sheets!

#### Option A: Using the Console (Recommended for beginners)

In the **Console** (bottom-left pane), type:

```r
source("load_data.R")
```

Press **Enter**.

#### Option B: Using the Script Editor

1. Click **File** → **Open File...**
2. Select `load_data.R`
3. The script opens in the top-left pane
4. Click the **Source** button (top-right of that pane) or press `Ctrl+Shift+S`

---

### Step 4: Google Authentication (FIRST TIME ONLY)

**When you run the script for the first time, this will happen:**

1. **Your web browser will automatically open** to a Google login page
2. **Sign in** with your Google account (the one with access to the spreadsheet)
3. **You'll see a scary warning:** "Google hasn't verified this app"
   - Click **Advanced** → **Go to Tidyverse API Packages (unsafe)**
   - This is normal! The googlesheets4 package is safe, it just hasn't gone through Google's verification
4. **Grant permissions** when asked
5. **You'll see "Authentication complete. Please close this page and return to R."**
6. Go back to RStudio

**After first time:** Your credentials are saved, so you won't need to do this again!

---

### Step 5: Understanding What You See

After authentication, the script will run and you'll see output like:

```
Loading extracted_entities...
Loading extracted_relationships...

=== DATA LOADED ===
Entities: 1234 rows x 8 columns
Relationships: 5678 rows x 6 columns

Entity columns: entity_id, entity_name, entity_type, mention_count, ...
Relationship columns: relationship_id, source_entity, target_entity, ...

=== QUICK PREVIEW ===
First few entities:
...
```

**This means it worked!** ✅

---

### Step 6: Explore Your Data

Now you have two data frames loaded: `entities` and `relationships`

#### View Data in Spreadsheet Style:

```r
View(entities)
```
This opens a new tab showing your data like Excel.

#### See First Few Rows:

```r
head(entities)
head(relationships)
```

#### Get Summary Statistics:

```r
summary(entities)
```

#### Count How Many Rows:

```r
nrow(entities)
nrow(relationships)
```

---

### Step 7: Run Example Queries

Once data is loaded, run the example queries:

```r
source("example_queries.R")
```

This will show you:
- Entity type breakdown
- Top 10 most mentioned entities
- Top people and organizations
- Relationship patterns
- And more!

---

### Step 8: Run Full Analysis (with visualizations)

If you want to generate charts and graphs:

```r
source("analyze_entities.R")
```

This creates:
- `entity_type_distribution.png`
- `top_entities.png`
- `relationship_type_distribution.png`

**Where are the images?** In your working directory. View them with:

```r
# Open file explorer in your working directory
shell.exec(getwd())
```

---

## 🎨 Understanding the RStudio Interface

```
┌─────────────────────────────────────────────┐
│  Top-Left: Script Editor                    │
│  (Where you edit .R files)                  │
├─────────────────────────────────────────────┤
│  Bottom-Left: Console                       │
│  (Where you type commands and see output)   │
├─────────────────────────────────────────────┤
│  Top-Right: Environment                     │
│  (Shows your loaded data: entities, etc.)   │
├─────────────────────────────────────────────┤
│  Bottom-Right: Files, Plots, Help           │
│  (Browse files, view graphs, read docs)     │
└─────────────────────────────────────────────┘
```

**Pro tip:** Click on `entities` or `relationships` in the **Environment pane** (top-right) to view them!

---

## 💡 Useful Commands for Beginners

### Basic Data Exploration:

```r
# View column names
names(entities)

# See data structure
str(entities)

# Get first 10 rows
head(entities, 10)

# Get last 5 rows
tail(entities, 5)

# Count rows and columns
dim(entities)

# Summary statistics
summary(entities$mention_count)
```

### Working with Data:

```r
# Load required packages (do this at start of each session)
library(dplyr)
library(ggplot2)

# Filter data
entities %>%
  filter(entity_type == "PERSON")

# Sort by mention_count
entities %>%
  arrange(desc(mention_count))

# Count by type
entities %>%
  count(entity_type)
```

### Getting Help:

```r
# Get help on a function
?filter
?ggplot

# Search help
??tidyverse
```

---

## ❓ Troubleshooting

### Problem: "Error: object 'entities' not found"
**Solution:** The data isn't loaded. Run `source("load_data.R")` first.

### Problem: "Error in library(googlesheets4) : there is no package called 'googlesheets4'"
**Solution:** Install packages first (see Step 2).

### Problem: "Error: The sheet 'extracted_entities' does not exist"
**Solution:**
- Check that the Google Sheet has tabs named `extracted_entities` and `extracted_relationships`
- Make sure you're authenticated with the correct Google account

### Problem: Script runs but I don't see any output
**Solution:** Check the **Console pane** (bottom-left) for output.

### Problem: Authentication browser window doesn't open
**Solution:** Copy the URL from the console and paste it into your browser manually.

### Problem: "Error in setwd(...) : cannot change working directory"
**Solution:** The path is wrong. Use forward slashes: `C:/Users/...` not backslashes.

---

## 🔄 Workflow Summary

**Every time you start RStudio:**

1. Set working directory (or open RStudio by double-clicking an .R file)
2. Run `source("load_data.R")` to load the data
3. Explore interactively or run other scripts

**First time only:**
- Install packages
- Authenticate with Google

---

## 📚 Next Steps

Once comfortable, try:

1. **Modify the example queries** - Change numbers, add filters
2. **Create your own queries** - Use the examples as templates
3. **Make custom visualizations** - Copy/paste ggplot code and modify it
4. **Export results** to CSV:
   ```r
   write.csv(entities, "my_entities_export.csv")
   ```

---

## 🆘 Quick Reference Card

```r
# === Session Start ===
setwd("C:/Users/amdit/OneDrive/Desktop/Crimes/playground/rosen-scraper")
source("load_data.R")

# === View Data ===
View(entities)           # Spreadsheet view
head(entities)           # First rows
names(entities)          # Column names
dim(entities)           # Rows x Columns

# === Run Scripts ===
source("example_queries.R")    # Run examples
source("analyze_entities.R")   # Generate visualizations

# === Get Help ===
?function_name          # Help on function
??search_term          # Search help
help.start()           # Open help in browser

# === Save Work ===
save.image("my_session.RData")  # Save everything
write.csv(entities, "export.csv")  # Export to CSV
```

---

## ✅ Checklist Before Running Scripts

- [ ] RStudio is open
- [ ] Working directory is set to `rosen-scraper` folder
- [ ] Packages are installed (`googlesheets4`, `dplyr`, `ggplot2`, `tidyr`)
- [ ] Internet connection is active
- [ ] You have Google account access to the spreadsheet

**Ready to go!** 🚀

Start with: `source("load_data.R")`

---

**Need help?** Error messages are your friend! They tell you exactly what went wrong. Copy the error and ask for help if stuck.
