# Data pipeline guide

A practical reference for contributors working on Jay Rosen's Internet Archive data pipeline. This covers environment setup, the AI enrichment system, known failure modes, and recommendations for improvement.

---

## Contributor quick start

### Environment setup

1. Install Python dependencies:
   ```bash
   cd backend
   poetry install
   playwright install
   ```

2. Configure environment variables:
   ```bash
   cp backend/.env.example backend/.env
   # Edit .env with:
   #   SPREADSHEET_NAME — Google Sheets spreadsheet name
   #   GEMINI_API_KEY   — Gemini API key for AI enrichment
   # Place Google Cloud credentials in backend/google_credentials.json
   ```

3. Verify your API key is set:
   ```bash
   echo $GEMINI_API_KEY
   ```

4. Confirm writable directories exist:
   - `logs/`
   - `data/processed_pdf_library/`
   - `data/processed_transcripts/`

### Key commands

| Command | Purpose |
|---------|---------|
| `poetry run python src/workflow.py` | Main pipeline (scrape, enrich, generate) |
| `poetry run python src/rosen_scraper/key_concepts_updater.py` | AI key concept tagging |
| `poetry run python src/rosen_scraper/key_concepts_updater.py --limit 50` | Process a specific batch size |
| `poetry run python src/rosen_scraper/key_concepts_updater.py --reset-progress` | Start from beginning |
| `poetry run python src/rosen_scraper/key_concepts_updater.py --force-reprocess` | Reprocess existing data |
| `poetry run python src/rosen_scraper/analyze_key_concepts.py` | Analyze concept distribution |
| `poetry run python scripts/backfill/bulk_reprocessor.py` | Bulk reprocess URLs |
| `poetry run python scripts/diagnostics/data_deduper.py` | Normalize multi-value fields |
| `poetry run python scripts/diagnostics/data_improver.py` | Refresh metadata from raw text |
| `poetry run python scripts/backfill/backfill_worker.py` | Fill missing `pull_quote`/`raw_text` |
| `poetry run pytest tests/test_analyze_key_concepts_syntax.py` | Syntax guard for analyzer |

### Project layout

- **`src/rosen_scraper/`** — Production pipeline code. `workflow.py` orchestrates scraping, Gemini enrichment, logging, and PDF/transcript generation.
- **`src/rosen_scraper/processors/`** — Content-type handlers (article, video, audio).
- **`scripts/`** — Maintenance scripts organized into `backfill/`, `pdf/`, `diagnostics/`, `manual_tests/`.
- **`narrative/`** — Project history and documentation.
- **`schema.json`** — Data schema including the 13 key concepts.

---

## Immediate priorities for new contributors

Work through these in order. Each step validates a layer of the pipeline before you move on.

### Priority A: validate Gemini enrichment

1. Run the syntax guard: `poetry run pytest tests/test_analyze_key_concepts_syntax.py`
2. Test a single article through the categorizer (craft a minimal harness or extend `src/rosen_scraper/categorizer.py` to process a known article).
3. Inspect `logs/ai_responses/` for dumps triggered by validation failures.
4. If Gemini returns uniform data (all rows getting identical categories), **stop** and investigate prompts/config before running any batch.

### Priority B: spot-test the pipeline

1. Run a limited ingest: `poetry run python src/rosen_scraper/workflow.py` with a small `urls_to_scrape` queue, or invoke the article processor manually.
2. For bulk reprocessing, use `poetry run python scripts/backfill/bulk_reprocessor.py` only after confirming validation logic works. Start with a handful of URLs.

### Priority C: resume key concepts processing

1. Continue batching: `poetry run python src/rosen_scraper/key_concepts_updater.py --limit 100` (auto-resumes from `key_concepts_progress.json`).
2. After clearing the backlog, run `poetry run python src/rosen_scraper/analyze_key_concepts.py` and check the report for taxonomy balance.

### Priority D: data hygiene

1. `poetry run python scripts/diagnostics/data_deduper.py` — normalize multi-value fields, update entity mentions.
2. `poetry run python scripts/diagnostics/data_improver.py` — refresh metadata from existing `raw_text`.
3. `poetry run python scripts/backfill/backfill_worker.py` — fill missing `pull_quote`/`raw_text`.

---

## Key concepts system

### The 13-concept schema

The pipeline uses Gemini 2.0 Flash Lite to tag each article with concepts from Jay Rosen's body of work. The schema has 13 fixed concepts, organized by origin.

**Original Jay Rosen concepts (8):**

| # | Concept | Description |
|---|---------|-------------|
| 1 | View from nowhere | Objectivity ideology in journalism |
| 2 | Church of the savvy | Political journalists focused on strategy over substance |
| 3 | The people formerly known as the audience | Empowered media consumers |
| 4 | Parity product | When news becomes commoditized and undifferentiated |
| 5 | Verification in reverse | Starting with a conclusion, then finding supporting facts |
| 6 | He said/she said journalism | False balance in reporting |
| 7 | Audience atomization overcome | Connected audiences via social media |
| 8 | The production of innocence | Press avoiding accountability |

**Added from data analysis (2):**

| # | Concept | Description |
|---|---------|-------------|
| 9 | Horse-race journalism | Campaign coverage focused on polls and strategy |
| 10 | False balance | Giving equal weight to unequal claims |

**Added from Jay's notes (3) — high authority:**

| # | Concept | Description |
|---|---------|-------------|
| 11 | The citizens' agenda | Election coverage prioritizing voter concerns |
| 12 | Not the odds but the stakes | Focusing on election consequences rather than polling |
| 13 | Mindcasting | Broadcasting one's thought process and knowledge-gathering |

### Authority weighting

Jay Rosen's identified concepts take precedence over patterns inferred from data analysis. The schema reflects Jay's actual body of work, not what the AI might infer on its own.

### How it works

**Processing modes:**
- **Empty `colQ` (key_concepts):** Fills with AI-identified concepts from the schema.
- **Existing `colQ` data:** Reviews current tags and writes recommendations to `colAK`.
- **No raw text available:** Adds a note to `colAJ` explaining why the row was skipped.

**Rate limiting and batching:**
- 5 seconds between each row update.
- 100 rows per batch by default.
- Progress saves automatically to `key_concepts_progress.json` and resumes on next run.

**Validation:**
- Only the 13 schema concepts are allowed (strict enforcement).
- Case-insensitive normalization.
- Comma-separated format in the sheet.
- Guardrails reject uniform Gemini responses (added after the October 2025 classification collapse). Raw payloads from rejected responses are saved to `logs/ai_responses/` for audit.

**Key files:**
- `schema.json` — the taxonomy definition including all 13 concepts.
- `src/rosen_scraper/key_concepts_updater.py` — AI-powered concept tagging script.
- `src/rosen_scraper/analyze_key_concepts.py` — analysis tool for reviewing concept distribution.
- `src/rosen_scraper/categorizer.py` — Gemini enrichment with validation guardrails.
- `key_concepts_progress.json` — auto-saved batch progress tracker.

---

## Cost and quality warnings

These document real incidents and their dollar costs. Read them before writing any script that calls an AI API.

### Warning: AI analysis without writing results

**Date:** 2025-10-22
**Script:** `scripts/run_smart_corrector_200.py` (initial version)
**Cost: $0.53 wasted**

The script called `summarize_and_classify()` to run AI analysis at $0.006 per row, stored the results in a variable called `analysis`, but never wrote the results to the Google Sheet.

**The broken code:**

```python
# WRONG - WASTES MONEY!
try:
    analysis = summarize_and_classify(existing_raw_text, SCHEMA)

    if analysis:
        note += f" | Updated AI analysis"  # Only updating note
        print(f"[OK] Re-analyzed with AI")   # Lying - nothing was written!

except Exception as e:
    note += f" | AI error: {str(e)[:50]}"
```

AI analysis ran, cost $0.006 per row, but the `summary`, `thematic_categories`, `key_concepts`, `tags`, and `pull_quote` fields were never updated in the sheet.

**The fix:**

```python
# CORRECT - ACTUALLY WRITES RESULTS
try:
    analysis = summarize_and_classify(existing_raw_text, SCHEMA)

    if analysis:
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

**What happened in production:** 80 rows processed, $0.53 spent, zero fields written. Only the notes column got updated.

**Checklist for any AI analysis script:**
- [ ] Does the script call an AI API? (Gemini, OpenAI, etc.)
- [ ] Does the script actually **write** the AI results to storage?
- [ ] Can you **verify** in the output logs that fields were written?
- [ ] Is there a counter showing how many fields were updated?

### Warning: background process management

**Date:** 2025-10-22

When testing a fix, the old broken script was still running in the background, processing rows 1-80 with the bug still present while the fix was being tested separately.

**Prevention:**

1. Kill all Python processes before testing fixes:
   ```bash
   pkill python          # Linux/Mac
   taskkill //F //IM python.exe  # Windows
   ```

2. Check for background processes:
   ```bash
   ps aux | grep python
   ```

3. Use unique log files for testing — don't reuse `logs/smart_corrector_200_progress.json`. Use test-specific names like `logs/test_fix_rows_201.json`.

### Warning: validate before full runs

Running a script on 200 rows without first testing on 5 rows to verify it works.

**Required testing workflow:**

1. Test on 5 rows first:
   ```bash
   poetry run python scripts/script.py --limit=5 --start-row=201
   ```

2. Manually verify in Google Sheets:
   - Check that all expected columns were updated
   - Verify the data looks correct
   - Check notes column for success messages

3. Test on 25 rows next:
   ```bash
   poetry run python scripts/script.py --limit=25 --start-row=201
   ```

4. Only then run the full dataset.

**Never skip straight to large batches.**

### Warning: ambiguous success messages

Output saying `[OK] Re-analyzed with AI` when the analysis ran but results were not written.

**Prevention — make success messages specific and verifiable:**

```python
# Bad - ambiguous
print(f"[OK] Re-analyzed with AI")

# Good - specific and verifiable
print(f"[OK] Wrote {len(updates_made)} AI fields to sheet: {', '.join(updates_made)}")
```

Add counters to the summary output:
```python
print(f"\nAI FIELDS WRITTEN: {stats['ai_fields_written']} total field updates")
```

If the counter is 0, you have a bug.

### Pre-flight checklist

Before running any script that costs money:

**1. Code review**
- [ ] Read the entire script looking for API calls
- [ ] Verify each API result is actually written somewhere
- [ ] Check that write operations have error handling

**2. Small test run**
- [ ] Test on 5 rows first
- [ ] Manually check Google Sheets to verify updates
- [ ] Review all output logs for success/failure

**3. Background process check**
- [ ] Kill all existing Python processes
- [ ] Clear any progress files from previous runs
- [ ] Use unique log filenames for testing

**4. Output validation**
- [ ] Success messages are specific and verifiable
- [ ] Counters show actual work done (fields written, rows processed)
- [ ] Error messages are saved to logs

**5. Cost estimation**
- [ ] Calculate cost per row
- [ ] Multiply by total rows
- [ ] Verify budget is sufficient

### Emergency stop

If you realize a broken script is running:

```bash
pkill -9 python          # Linux/Mac
taskkill //F //IM python.exe  # Windows
```

Then immediately:
1. Check progress file to see how far it got
2. Check Google Sheets to see what was actually updated
3. Calculate money wasted
4. Document the bug in this file

### Summary rules

1. Never trust that a script is working just because it doesn't crash. Verify output in the actual data store.
2. Test on 5 rows. Then 25. Then 100. Never skip to full dataset.
3. If it costs money, verify the money bought you something useful.

---

## Known issues and risks

These are from a code review conducted 2025-10-13. Some have been partially addressed; others remain open.

### Categorization regression

`frontend/README.md` documented that all 725 rows shared identical thematic values, eras, scopes, and tags — a systemic Gemini failure. The categorizer (`src/rosen_scraper/categorizer.py`) now rejects uniform responses and saves raw payloads to `logs/ai_responses/`, but you should verify that production runs generate diverse classifications before reprocessing the archive.

### API fragility

`categorizer.py` and `scraper.py` bail out when `GEMINI_API_KEY` is missing or when Gemini errors, causing silent skips. There is no retry/backoff strategy or local fallback. Transient Gemini issues can erase outputs.

### Analyzer syntax bug

`src/rosen_scraper/analyze_key_concepts.py:30` had a malformed default string for `SPREADSHEET_NAME`, breaking the script. A syntax guard test was added (`tests/test_analyze_key_concepts_syntax.py`), but watch for similar issues.

### Testing gap

The existing `test_*.py` files are interactive smoke scripts. There is no automated pytest coverage guarding core behaviors: ID generation, schema conformance, poison pill routing, Google Sheets I/O.

### Dependency friction

`pyproject.toml` has unpinned versions, mixes `google-generativeai` and `google-genai`, and references `playwright-stealth` without any imports. Playwright requires a post-install step (`playwright install`) that's easy to miss.

### Logic duplication

`scripts/backfill/bulk_reprocessor.py` re-implements ID generation, enrichment, and sheet-writing logic found in `src/workflow.py`. Changes to one path can drift from the other.

### Configuration surface

Sensitive settings come from `.env`, but defaults and validation are inconsistent (hard-coded credential filenames, global singleton loggers). This makes it difficult to run multiple workers or staging environments.

### Data safety

There is no checksum or schema validation before writing rows back to Sheets. Malformed Gemini JSON could silently corrupt production data.

---

## Recommendations

Actionable improvements, roughly prioritized:

1. **Repair and guard the analyzer.** Fix `analyze_key_concepts.py` and keep the syntax/unit test that prevents similar regressions.

2. **Investigate the classification collapse.** Log raw model responses, add guardrails that detect uniform outputs, and block writes when enrichment looks suspicious. Consider versioning prompts and config in git.

3. **Add a configuration layer.** Use pydantic settings or dynaconf to validate API keys, sheet IDs, and file paths at startup. Fail fast with actionable error messages.

4. **Wrap Gemini calls with retry/backoff.** Add explicit error classes and optional caching so transient outages don't wipe runs. Evaluate batching requests or using a local model fallback for taxonomy tagging.

5. **Consolidate shared helpers.** Extract ID generation, enrichment, and sheet writes into a dedicated module so the streaming workflow and `bulk_reprocessor.py` stay in sync.

6. **Pin dependency versions.** Document the `playwright install` step. Clarify whether both `google-generativeai` and `google-genai` are needed. Drop unused packages.

7. **Build a real pytest suite.** Use fixtures that mock Gemini and Google Sheets. Focus first on ID generation, poison pill classifications, data enrichment, and schema adherence.

8. **Add data validation before writes.** Enforce taxonomy membership, ensure arrays are serialized consistently, and check for required fields before posting results to Sheets or the frontend.

---

## References

- `narrative/PROJECT_LOG.md` — chronological project history and release notes
- `narrative/KEY_CONCEPTS_SYSTEM.md` — full AI taxonomy design and processing sessions
- `narrative/CRITICAL_WARNINGS.md` — original warning documentation with full incident detail
- `narrative/LLM_INSTRUCTIONS.md` — handoff guide for new contributors
- `narrative/codex_review_notes.md` — code review findings (2025-10-13)
- `CLAUDE.md` — operational runbook for the full project

---

*Last updated: 2026-04-06*
