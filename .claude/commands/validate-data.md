Validate the archive data for schema compliance and quality issues.

Run validation checks on CSV and JSON data files:

```bash
cd /home/user/rosen-frontend

# Check JSON files are valid
node -e "
const fs = require('fs');
const files = ['data/archive-core.json', 'data/archive-details.json', 'data/archive-entities.json'];
files.forEach(file => {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const size = (fs.statSync(file).size / 1024 / 1024).toFixed(2);
        console.log('✓ ' + file + ': ' + (Array.isArray(data) ? data.length + ' records' : Object.keys(data).length + ' keys') + ' (' + size + 'MB)');
    } catch (e) {
        console.log('✗ ' + file + ': ' + e.message);
    }
});
"
```

Report any validation errors found and suggest fixes based on the archive-validation skill.
