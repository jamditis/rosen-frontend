/**
 * Placeholder search index that performs simple text matching across sample data.
 * This will be swapped for a proper index (e.g., FlexSearch) once real exports are wired up.
 */
export class SearchIndex {
    constructor(records) {
        this.records = records;
    }

    search(query = "") {
        const normalized = query.trim().toLowerCase();

        if (!normalized) {
            return this.records.slice(0, 5);
        }

        return this.records.filter((record) => {
            const fields = [
                record.title,
                record.summary,
                record.format,
                ...(record.categories || []),
                ...(record.key_concepts || []),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return fields.includes(normalized);
        });
    }
}
