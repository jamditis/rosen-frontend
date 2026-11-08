/**
 * Bring the two curator-maintained graph policy files back in step with the
 * relationship data after rows are removed.
 *
 * data/graph-validation-holds.json parks individual relationship ids that the
 * #737 audit has not ruled on yet. data/relationship-type-registry.json records,
 * per relationship type, how far current rows diverge from the type's declared
 * endpoints and direction. Both describe the relationship table, so both go
 * stale the moment a record drop removes rows from it. Nothing regenerated them
 * before, so a curator who followed a migration's steps ended up with a
 * different tree than the migration author had.
 *
 * The two halves are written differently on purpose.
 *
 * Holds are pruned by text surgery. The file carries hand-formatted entries --
 * short arrays are written inline -- and re-serializing it through
 * JSON.stringify reflows every one of them, burying the entries the migration
 * actually removed in unrelated diff noise. Keeping the bytes of every surviving
 * entry means the diff shows only the removals. The result is re-parsed and
 * compared against the intended object before it is handed back, so a bad splice
 * is reported rather than written.
 *
 * The registry census is recomputed from the relationship and entity rows and
 * written back through JSON.stringify, which reproduces that file byte for byte
 * already. Recomputing rather than hand-editing is what makes the numbers
 * trustworthy: they are a count of the current table, not a memory of an older
 * one.
 *
 * Neither half guesses at an open curator decision. One ruling is standing:
 * when a divergence backlog reaches zero rows, the refresh marks the type
 * "enforced" and drops the snapshot, and reports the change (curator ruling,
 * 2026-11-08), because the validator would then hold every row to the rule
 * anyway.
 */

const RECORD_ID_PATTERN = /^(.+?)_REL_\d+$/;

/** The record a relationship id was extracted from, or null if it is not one. */
export function recordIdOfRelationship(relationshipId) {
  const match = RECORD_ID_PATTERN.exec(String(relationshipId || ''));
  return match ? match[1] : null;
}

/** Find the `[` and `]` of the array held under a top-level key. */
function findArrayBounds(text, key) {
  const marker = `"${key}"`;
  const keyIndex = text.indexOf(marker);
  if (keyIndex === -1) return null;
  const open = text.indexOf('[', keyIndex + marker.length);
  if (open === -1) return null;

  let depth = 0;
  let inString = false;
  for (let index = open; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (character === '\\') index++;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '[' || character === '{') depth++;
    else if (character === ']' || character === '}') {
      depth--;
      if (depth === 0) return { open, close: index };
    }
  }
  return null;
}

/** The spans of the objects directly inside an array body. */
function objectSpans(text, from, to) {
  const spans = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let index = from; index < to; index++) {
    const character = text[index];
    if (inString) {
      if (character === '\\') index++;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') {
      if (depth === 0) start = index;
      depth++;
    } else if (character === '}') {
      depth--;
      if (depth === 0) spans.push({ start, end: index + 1 });
    }
  }
  return spans;
}

/** The whitespace that opens the line an offset sits on. */
function indentAt(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset) + 1;
  return text.slice(lineStart, offset).match(/^\s*/)[0];
}

/**
 * Remove entries from a JSON array of objects without re-serializing the file.
 *
 * Every entry that survives keeps its exact bytes, so the diff shows only the
 * removals. The rewritten text is re-parsed and compared against the intended
 * array before it is returned.
 *
 * @param {string} text the JSON file contents
 * @param {string} key the top-level key holding the array
 * @param {(entry: object) => boolean} shouldDrop true to remove the entry
 * @returns {{text: string, removed: object[], problems: string[]}}
 */
export function pruneJsonArrayEntries(text, key, shouldDrop) {
  const bounds = findArrayBounds(text, key);
  if (!bounds) {
    return { text, removed: [], problems: [`no array found under "${key}"`] };
  }

  const spans = objectSpans(text, bounds.open + 1, bounds.close);
  const kept = [];
  const keptEntries = [];
  const removed = [];
  const problems = [];

  for (const span of spans) {
    const slice = text.slice(span.start, span.end);
    let entry;
    try {
      entry = JSON.parse(slice);
    } catch (error) {
      problems.push(`entry at offset ${span.start} did not parse: ${error.message}`);
      return { text, removed: [], problems };
    }
    if (shouldDrop(entry)) {
      removed.push(entry);
      continue;
    }
    kept.push(slice);
    keptEntries.push(entry);
  }

  if (!removed.length) return { text, removed, problems };

  const entryIndent = spans.length ? indentAt(text, spans[0].start) : '';
  const closeIndent = indentAt(text, bounds.close);
  const body = kept.length
    ? `\n${kept.map((slice) => entryIndent + slice).join(',\n')}\n${closeIndent}`
    : '';
  const next = text.slice(0, bounds.open + 1) + body + text.slice(bounds.close);

  let reparsed;
  try {
    reparsed = JSON.parse(next);
  } catch (error) {
    problems.push(`the pruned file did not re-parse: ${error.message}`);
    return { text, removed: [], problems };
  }
  const expected = JSON.parse(text);
  expected[key] = keptEntries;
  if (JSON.stringify(reparsed) !== JSON.stringify(expected)) {
    problems.push(`the pruned "${key}" array does not match the intended entries`);
    return { text, removed: [], problems };
  }

  return { text: next, removed, problems };
}

/**
 * Drop the relationship-type holds that name a removed record.
 *
 * @param {string} text data/graph-validation-holds.json contents
 * @param {Iterable<string>} droppedRecordIds the records the migration removed
 * @returns {{text: string, removed: object[], problems: string[]}}
 */
export function pruneRelationshipTypeHolds(text, droppedRecordIds) {
  const dropped = new Set(droppedRecordIds);
  return pruneJsonArrayEntries(text, 'relationshipTypeHolds', (entry) =>
    dropped.has(recordIdOfRelationship(entry.relationshipId)),
  );
}

/** Group relationship rows by their declared type. */
function rowsByType(relationshipRows) {
  const grouped = new Map();
  for (const row of relationshipRows) {
    const type = row.relationship_type;
    if (!type) continue;
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(row);
  }
  return grouped;
}

/** The rows whose endpoints fall outside the type's declared allowlists. */
function violatingRows(typeRows, entry, entityTypeById) {
  return typeRows.filter(
    (row) =>
      !entry.allowedSourceTypes.includes(entityTypeById.get(row.source_entity_id)) ||
      !entry.allowedTargetTypes.includes(entityTypeById.get(row.target_entity_id)),
  );
}

/**
 * The entity pairs this type asserts in both directions.
 *
 * Returns one entry per unordered pair, with every row on both sides, ordered by
 * the first forward row's id so the output does not move between runs.
 */
function contradictionPairs(typeRows) {
  const directed = new Map();
  for (const row of typeRows) {
    const key = `${row.source_entity_id}\u0000${row.target_entity_id}`;
    if (!directed.has(key)) directed.set(key, []);
    directed.get(key).push(row);
  }

  const seen = new Set();
  const pairs = [];
  for (const [key, forwardRows] of directed) {
    const [source, target] = key.split('\u0000');
    if (!source || !target || source === target) continue;
    const backwardRows = directed.get(`${target}\u0000${source}`);
    if (!backwardRows) continue;
    const unordered = [source, target].sort().join('\u0000');
    if (seen.has(unordered)) continue;
    seen.add(unordered);
    pairs.push({ forwardRows, backwardRows });
  }

  return pairs.sort((a, b) =>
    a.forwardRows[0].relationship_id.localeCompare(b.forwardRows[0].relationship_id),
  );
}

/** Rewrite the leading count in a curator note, or report that it did not match. */
function restate(note, pattern, replacement, label, problems) {
  const text = String(note || '');
  if (!pattern.test(text)) {
    problems.push(`${label}: the note does not open with the count this refresh restates`);
    return text;
  }
  return text.replace(pattern, replacement);
}

/**
 * Recount the #737 census the relationship-type registry records.
 *
 * Mutates and returns the registry object. Every number, note count, and example
 * is derived from the rows passed in, so the census describes the table as it
 * stands rather than as it stood when a curator last looked.
 *
 * @param {object} registry the parsed relationship-type-registry.json
 * @param {object} options
 * @param {object[]} options.relationshipRows current extracted_relationships rows
 * @param {object[]} options.entityRows current extracted_entities rows
 * @param {string} options.asOfDate the date to stamp, as YYYY-MM-DD
 * @returns {{registry: object, changes: string[], problems: string[]}}
 */
export function refreshRelationshipTypeCensus(registry, { relationshipRows, entityRows, asOfDate }) {
  const entityTypeById = new Map(entityRows.map((row) => [row.entity_id, row.entity_type]));
  const entityNameById = new Map(entityRows.map((row) => [row.entity_id, row.entity_name]));
  const grouped = rowsByType(relationshipRows);
  const changes = [];
  const problems = [];

  for (const [name, entry] of Object.entries(registry.types || {})) {
    const typeRows = grouped.get(name) || [];

    const divergence = entry.endpointDivergence;
    if (divergence) {
      if (!Array.isArray(entry.allowedSourceTypes) || !Array.isArray(entry.allowedTargetTypes)) {
        problems.push(`${name}: an endpointDivergence needs declared endpoint allowlists`);
      } else {
        const violating = violatingRows(typeRows, entry, entityTypeById);
        if (!violating.length) {
          // Every row now fits the declared endpoints, so the rule is enforced
          // and the snapshot goes (curator ruling, 2026-11-08). Leaving the
          // type deferred would fail every release on a stale snapshot.
          const before = entry.endpointEnforcement;
          entry.endpointEnforcement = 'enforced';
          delete entry.endpointDivergence;
          changes.push(`${name} endpointEnforcement ${before} -> enforced, no row diverges any more`);
        } else {
          const before = `${divergence.violatingRows}/${divergence.totalRows}`;
          divergence.violatingRows = violating.length;
          divergence.totalRows = typeRows.length;
          divergence.asOfDate = asOfDate;
          const stillViolating = new Set(violating.map((row) => row.relationship_id));
          const examples = (divergence.exampleRelationshipIds || []).filter((id) =>
            stillViolating.has(id),
          );
          if (!examples.length) {
            const candidates = [...stillViolating].sort();
            examples.push(
              ...candidates.slice(0, divergence.exampleRelationshipIds?.length || 5),
            );
          }
          divergence.exampleRelationshipIds = examples;
          divergence.note = restate(
            divergence.note,
            // Only the two numbers are rewritten; the noun that follows them is
            // the note author's ("current Mentions rows", "held Founded By
            // rows"), so it survives the restatement.
            /^\d+ of \d+ /,
            `${violating.length} of ${typeRows.length} `,
            `${name} endpointDivergence`,
            problems,
          );
          const after = `${divergence.violatingRows}/${divergence.totalRows}`;
          if (before !== after) changes.push(`${name} endpointDivergence ${before} -> ${after}`);
        }
      }
    }

    const contradictions = entry.directionalContradictions;
    if (contradictions) {
      const pairs = contradictionPairs(typeRows);
      if (!pairs.length) {
        delete entry.directionalContradictions;
        changes.push(`${name} directionalContradictions removed, no reversed pair is left`);
        continue;
      }
      const rowsInvolved = pairs.reduce(
        (total, pair) => total + pair.forwardRows.length + pair.backwardRows.length,
        0,
      );
      const before = `${contradictions.pairCount} pairs/${contradictions.rowsInvolved} rows`;
      contradictions.pairCount = pairs.length;
      contradictions.rowsInvolved = rowsInvolved;
      contradictions.asOfDate = asOfDate;

      const rowById = new Map(typeRows.map((row) => [row.relationship_id, row]));
      const examples = (contradictions.examplePairs || []).filter(
        (pair) => rowById.has(pair.forwardId) && rowById.has(pair.backwardId),
      );
      if (!examples.length) {
        const wanted = contradictions.examplePairs?.length || 3;
        for (const pair of pairs.slice(0, wanted)) {
          const forward = pair.forwardRows[0];
          const backward = pair.backwardRows[0];
          const describe = (row) =>
            `${entityNameById.get(row.source_entity_id)} -> ${entityNameById.get(row.target_entity_id)}`;
          examples.push({
            forwardId: forward.relationship_id,
            forwardAssertion: describe(forward),
            backwardId: backward.relationship_id,
            backwardAssertion: describe(backward),
          });
        }
      }
      contradictions.examplePairs = examples;
      contradictions.note = restate(
        contradictions.note,
        /^\d+ entity pairs \(\d+ rows\) /,
        `${pairs.length} entity pairs (${rowsInvolved} rows) `,
        `${name} directionalContradictions`,
        problems,
      );
      const after = `${contradictions.pairCount} pairs/${contradictions.rowsInvolved} rows`;
      if (before !== after) changes.push(`${name} directionalContradictions ${before} -> ${after}`);
    }
  }

  return { registry, changes, problems };
}

export default {
  recordIdOfRelationship,
  pruneJsonArrayEntries,
  pruneRelationshipTypeHolds,
  refreshRelationshipTypeCensus,
};
