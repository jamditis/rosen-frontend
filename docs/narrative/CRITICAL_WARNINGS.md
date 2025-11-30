# CRITICAL WARNINGS - COST-SAVING MISTAKES TO AVOID

## ⚠️ REQUIRED READING BEFORE ANY AI PROCESSING ⚠️

This document catalogs critical bugs and patterns that have **wasted money** in the past. Read this BEFORE writing any script that calls AI APIs or processes data.

---

## WARNING #1: AI Analysis Without Writing Results (COST: $0.53 wasted)

**Date Discovered:** 2025-10-22
**Script Affected:** `scripts/run_smart_corrector_200.py` (initial version)

### THE PROBLEM

The script called `summarize_and_classify()` to run AI analysis (costing $0.006 per row), stored the results in a variable called `analysis`, but **NEVER WROTE THE RESULTS TO THE GOOGLE SHEET**.

### THE CODE BUG

```python
# WRONG - WASTES MONEY!
try:
    analysis = summarize_and_classify(existing_raw_text, SCHEMA)

    if analysis:
        note += f" | Updated AI analysis"  # ❌ Only updating note
        print(f"[OK] Re-analyzed with AI")   # ❌ Lying - nothing was written!

except Exception as e:
    note += f" | AI error: {str(e)[:50]}"
```

**What happened:** AI analysis ran successfully, cost $0.006 per row, but the `summary`, `thematic_categories`, `key_concepts`, `tags`, and `pull_quote` fields were **NEVER UPDATED IN THE SHEET**.

### THE FIX

```python
# CORRECT - ACTUALLY WRITES RESULTS
try:
    analysis = summarize_and_classify(existing_raw_text, SCHEMA)

    if analysis:
        # CRITICAL: Actually write AI analysis results to the sheet!
        updates_made = []

        if analysis.get('summary'):
            worksheet.update_cell(row_num, col_summary_idx, analysis['summary'])
            updates_made.append('summary')

        if analysis.get('thematic_categories'):
            cats = ', '.join(analysis['thematic_categories']) if isinstance(analysis['thematic_categories'], list) else analysis['thematic_categories']
            worksheet.update_cell(row_num, col_categories_idx, cats)
            updates_made.append('categories')

        # ... repeat for key_concepts, tags, pull_quote

        note += f" | WROTE: {', '.join(updates_made)}"
        print(f"[OK] Wrote {len(updates_made)} AI fields to sheet")
```

### CHECKLIST BEFORE RUNNING ANY AI ANALYSIS SCRIPT

- [ ] Does the script call an AI API? (Gemini, OpenAI, etc.)
- [ ] Does the script actually **WRITE** the AI results to storage?
- [ ] Can you **VERIFY** in the output logs that fields were written?
- [ ] Is there a counter showing how many fields were updated?

### COST IMPACT

**First broken run (rows 1-200):**
- Rows processed: 80 (interrupted)
- Cost paid: $0.53
- Fields written: 0 (only notes column)
- **Money wasted: $0.53**

**Lesson:** Always verify that expensive API calls actually persist their results!

---

## WARNING #2: Running Unfixed Scripts in Background

**Date Discovered:** 2025-10-22

### THE PROBLEM

When testing fixes, the old BROKEN script continued running in the background, processing rows 1-80 with the bug still present while we were testing the fix.

### PREVENTION

1. **ALWAYS kill all Python processes before testing fixes:**
   ```bash
   taskkill //F //IM python.exe
   ```

2. **Check for background processes:**
   ```bash
   ps aux | grep python
   ```

3. **Use unique log files for testing:**
   - Don't reuse `logs/smart_corrector_200_progress.json`
   - Use test-specific names: `logs/test_fix_rows_201.json`

---

## WARNING #3: Not Validating Output Before Full Runs

### THE PROBLEM

Running a script on 200 rows without first testing on 5 rows to verify it actually works.

### PREVENTION

**ALWAYS follow this testing workflow:**

1. **Test on 5 rows first:**
   ```bash
   poetry run python scripts/script.py --limit=5 --start-row=201
   ```

2. **Manually verify in Google Sheets:**
   - Check that ALL expected columns were updated
   - Verify the data looks correct
   - Check notes column for success messages

3. **Test on 25 rows next:**
   ```bash
   poetry run python scripts/script.py --limit=25 --start-row=201
   ```

4. **Only then run full dataset**

**NEVER skip straight to large batches!**

---

## WARNING #4: Ambiguous Success Messages

### THE PROBLEM

Output saying `[OK] Re-analyzed with AI` when the analysis ran but results weren't written.

### PREVENTION

**Make success messages SPECIFIC:**

```python
# BAD - Ambiguous
print(f"[OK] Re-analyzed with AI")

# GOOD - Specific and verifiable
print(f"[OK] Wrote {len(updates_made)} AI fields to sheet: {', '.join(updates_made)}")
```

**Add counters to summary:**
```python
print(f"\nAI FIELDS WRITTEN: {stats['ai_fields_written']} total field updates")
```

If the counter is 0, you have a bug!

---

## REQUIRED PRE-FLIGHT CHECKLIST

Before running ANY script that costs money:

### 1. Code Review
- [ ] Read the entire script looking for API calls
- [ ] Verify each API result is actually WRITTEN somewhere
- [ ] Check that write operations have error handling

### 2. Small Test Run
- [ ] Test on 5 rows first
- [ ] Manually check Google Sheets to verify updates
- [ ] Review all output logs for success/failure

### 3. Background Process Check
- [ ] Kill all existing Python processes
- [ ] Clear any progress files from previous runs
- [ ] Use unique log filenames for testing

### 4. Output Validation
- [ ] Success messages are specific and verifiable
- [ ] Counters show actual work done (fields written, rows processed)
- [ ] Error messages are saved to logs

### 5. Cost Estimation
- [ ] Calculate cost per row
- [ ] Multiply by total rows
- [ ] Verify budget is sufficient

---

## EMERGENCY STOP PROCEDURE

If you realize a broken script is running:

```bash
# Windows
taskkill //F //IM python.exe

# Linux/Mac
pkill -9 python
```

Then immediately:
1. Check progress file to see how far it got
2. Check Google Sheets to see what was actually updated
3. Calculate money wasted
4. Document the bug in this file

---

## SUMMARY

**The #1 rule:** Never trust that a script is working correctly just because it doesn't crash. Always verify output in the actual data store (Google Sheets, database, files).

**The #2 rule:** Test on 5 rows. Then 25. Then 100. Never skip to full dataset.

**The #3 rule:** If it costs money, verify the money bought you something useful.

---

**Last Updated:** 2025-10-22
**Total Money Wasted So Far:** $0.53 (and counting if you don't read this!)
