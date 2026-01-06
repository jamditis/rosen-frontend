# Entity Relationship Fix Script - Quick Start

## Purpose
Fixes the 14 unfixable entity relationship issues identified in the validation report by creating proper entity IDs or mapping to existing entities.

## Files Created
- **Main Script:** `/home/user/rosen-frontend/backend/scripts/fix_entity_relationships.py`
- **Fix Plan:** `/home/user/rosen-frontend/backend/scripts/RELATIONSHIP_FIX_PLAN.md`
- **This Guide:** `/home/user/rosen-frontend/backend/scripts/README_FIX_RELATIONSHIPS.md`

## Quick Start

### Run the Script
```bash
cd /home/user/rosen-frontend
python3 backend/scripts/fix_entity_relationships.py
```

### What It Does
1. Loads all entities, relationships, and archive records
2. Applies 14 specific fixes to invalid relationship target IDs
3. Creates new entities where needed (8 new entities)
4. Maps to existing entities where they exist (6 mappings)
5. Backs up original files before making changes
6. Generates a detailed report of all fixes

### What Gets Fixed
| Issue | Invalid ID | Fixed To | Action |
|-------|------------|----------|--------|
| RECORD-00027_REL_006 | "New York University" | O0049 | Map to existing NYU |
| RECORD-00046_REL_006 | "O000" | New C-code | Create "The Media" concept |
| RECORD-00046_REL_010 | "O000" | Same C-code | Use "The Media" concept |
| RECORD-00046_REL_012 | "O000" | Same C-code | Use "The Media" concept |
| RECORD-00097_REL_005 | "Unspecified" | New P-code | Create "DiMaggio & Powell" |
| RECORD-00243_REL_002 | "O000" | New O-code | Create "The Press Corps" |
| RECORD-00272_REL_003 | "Concept" | New C-code | Create specific concept |
| RECORD-00350_REL_004 | "Creative Commons Foundation" | New O-code | Create org entity |
| RECORD-00350_REL_005 | "Northeastern University" | O1308 | Map to existing entity |
| RECORD-00413_REL_014 | "N/A" | O0426 | Map to CJR Daily |
| RECORD-00413_REL_015 | "N/A" | O0426 | Map to CJR Daily |
| RECORD-00414_REL_010 | "O000" | New O-code | Create "Routledge" |
| RECORD-00547_REL_008 | "O000" | New O-code | Create "The Press" |
| RECORD-00610_REL_009 | "New York University" | O0049 | Map to existing NYU |

### Output Files
- **Backups:** `extracted_entities.csv.backup_*` and `extracted_relationships.csv.backup_*`
- **Report:** `data/relationship_fixes_report_*.txt`
- **Updated:** `extracted_entities.csv` (new entities appended) and `extracted_relationships.csv` (all 14 fixes applied)

### Safety Features
- ✓ Creates timestamped backups before any changes
- ✓ Validates all data before processing
- ✓ Can be run multiple times safely (idempotent)
- ✓ Generates detailed audit trail

### After Running
1. Check the generated report in `data/relationship_fixes_report_*.txt`
2. Verify fixes look correct
3. Optionally re-run the validation script to confirm all issues are resolved
4. Commit changes if everything looks good

### Rollback (if needed)
```bash
# Restore from backups if something went wrong
cd /home/user/rosen-frontend/data
cp extracted_entities.csv.backup_* extracted_entities.csv
cp extracted_relationships.csv.backup_* extracted_relationships.csv
```

## Questions?
See the detailed fix plan in `RELATIONSHIP_FIX_PLAN.md` for full context on each fix.
