Check frontend import version consistency across all JavaScript files.

Run version analysis:

```bash
cd /home/user/rosen-frontend/frontend

echo "=== Version Analysis ==="

# Find all versions in use
echo "Versions found:"
grep -roh "?v=[0-9.]*" --include="*.js" . | sort | uniq -c | sort -rn

# Check for mismatches
echo ""
echo "Files with version strings:"
grep -rn "?v=" --include="*.js" . | wc -l

# Find any mismatched versions
MAIN_VERSION=$(grep -oh "?v=[0-9.]*" App.js | head -1)
echo ""
echo "Expected version (from App.js): $MAIN_VERSION"

# Find files with different versions
echo ""
echo "Files with different versions (if any):"
grep -rln "?v=" --include="*.js" . | while read file; do
    file_versions=$(grep -oh "?v=[0-9.]*" "$file" | sort | uniq)
    if [ $(echo "$file_versions" | wc -l) -gt 1 ] || [ "$file_versions" != "$MAIN_VERSION" ]; then
        echo "  $file: $file_versions"
    fi
done
```

Report any version mismatches found and provide commands to fix them using the version-manager skill.
