Regenerate JSON data files from CSV sources.

Run the data export script to update archive JSON files:

```bash
cd /home/user/rosen-frontend/data

# Check Node.js is available
node --version

# Run export script
node export-archive-data.js

# Show generated file sizes
echo ""
echo "Generated files:"
ls -lh archive-*.json
```

After running, validate the output using the validate-data command.

Note: Only run this after making changes to CSV files:
- data/archive_records-public.csv
- data/extracted_entities.csv
- data/extracted_relationships.csv
