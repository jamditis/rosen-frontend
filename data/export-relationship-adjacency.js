#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { unescapeRow } from './lib/csv-unescape.js';
import {
  buildRelationshipAdjacencyArtifacts,
  relationshipAdjacencyArtifactFiles,
  validateRelationshipAdjacencyArtifacts,
} from './lib/relationship-adjacency.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function writeRelationshipAdjacencyArtifacts({
  dataDir,
  relationships,
  servedRecordIds,
  activeSchema,
  holdPolicy,
  relationshipCsv,
}) {
  const artifacts = buildRelationshipAdjacencyArtifacts({
    relationships,
    servedRecordIds,
    acceptedRelationshipTypes: Object.keys(activeSchema.relationship_types ?? {}),
    relationshipTypeHolds: holdPolicy.relationshipTypeHolds ?? [],
    relationshipCsv,
  });
  const summary = validateRelationshipAdjacencyArtifacts(artifacts);

  fs.writeFileSync(
    path.join(dataDir, 'relationship-adjacency-manifest.json'),
    artifacts.serializedManifest
  );
  for (const [shardId, serialized] of Object.entries(artifacts.serializedShards)) {
    fs.writeFileSync(path.join(dataDir, `relationship-adjacency-${shardId}.json`), serialized);
  }

  return { ...summary, files: relationshipAdjacencyArtifactFiles() };
}

export function exportRepositoryRelationshipAdjacency(repositoryRoot = path.join(__dirname, '..')) {
  const dataDir = path.join(repositoryRoot, 'data');
  const relationshipCsv = fs.readFileSync(path.join(dataDir, 'extracted_relationships.csv'), 'utf8');
  const relationships = parse(relationshipCsv, {
    columns: true,
    skip_empty_lines: true,
  }).map(unescapeRow);
  const archiveData = JSON.parse(fs.readFileSync(path.join(dataDir, 'archive-data.json'), 'utf8'));
  const activeSchema = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'backend', 'entity_extraction_schema_v3.json'), 'utf8')
  );
  const holdPolicy = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'graph-validation-holds.json'), 'utf8')
  );
  const servedRecordIds = new Set(
    Array.isArray(archiveData.records) ? archiveData.records.map(record => record.id) : []
  );

  return writeRelationshipAdjacencyArtifacts({
    dataDir,
    relationships,
    servedRecordIds,
    activeSchema,
    holdPolicy,
    relationshipCsv,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const summary = exportRepositoryRelationshipAdjacency();
    console.log(
      `Wrote ${summary.files.length} relationship adjacency files for ` +
      `${summary.records} records and ${summary.assertions} approved assertions.`
    );
  } catch (error) {
    console.error(`Relationship adjacency export failed: ${error.message}`);
    process.exitCode = 1;
  }
}
