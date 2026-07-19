#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { MANIFEST, RECORDS } from './data.js';

const manifestPath = new URL('./source-manifest.json', import.meta.url);
const databasePath = new URL('./demo.sqlite', import.meta.url);

function createManifest() {
  return {
    title: MANIFEST.title,
    scope: MANIFEST.scope,
    frozenOn: MANIFEST.frozenOn,
    recordCount: RECORDS.length,
    sourcePolicy: MANIFEST.sourcePolicy,
    records: RECORDS.map((record) => ({
      id: record.id,
      date: record.date,
      sourceTitle: record.sourceTitle,
      recordTitle: record.title,
      creator: record.creator,
      source: record.source,
      sourceType: record.sourceType,
      canonicalUrl: record.url,
      verificationNote: record.evidence,
    })),
  };
}

async function createDatabase() {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  database.run(`
    CREATE TABLE records (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      year INTEGER NOT NULL,
      source_title TEXT NOT NULL,
      title TEXT NOT NULL,
      creator TEXT NOT NULL,
      source TEXT NOT NULL,
      source_type TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      summary TEXT NOT NULL,
      evidence TEXT NOT NULL
    );
    CREATE TABLE record_themes (
      record_id TEXT NOT NULL REFERENCES records(id),
      theme TEXT NOT NULL,
      PRIMARY KEY (record_id, theme)
    );
    CREATE INDEX record_date_idx ON records(date, id);
    CREATE INDEX record_theme_idx ON record_themes(theme, record_id);
  `);
  const recordStatement = database.prepare(`
    INSERT INTO records (
      id, date, year, source_title, title, creator, source, source_type, canonical_url, summary, evidence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const themeStatement = database.prepare('INSERT INTO record_themes (record_id, theme) VALUES (?, ?)');
  try {
    for (const record of RECORDS) {
      recordStatement.run([
        record.id, record.date, record.year, record.sourceTitle, record.title, record.creator,
        record.source, record.sourceType, record.url, record.summary, record.evidence,
      ]);
      for (const theme of record.themes) themeStatement.run([record.id, theme]);
    }
  } finally {
    recordStatement.free();
    themeStatement.free();
  }
  const bytes = Buffer.from(database.export());
  database.close();
  return bytes;
}

async function generate() {
  const manifest = `${JSON.stringify(createManifest(), null, 2)}\n`;
  const database = await createDatabase();
  await Promise.all([
    writeFile(manifestPath, manifest),
    writeFile(databasePath, database),
  ]);
  console.log(`Generated ${RECORDS.length} manifest and SQLite records`);
}

async function verify() {
  const [storedManifest, storedDatabase, generatedDatabase] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(databasePath),
    createDatabase(),
  ]);
  assert.deepEqual(JSON.parse(storedManifest), createManifest(), 'source-manifest.json drifted from data.js');
  assert.deepEqual(storedDatabase, generatedDatabase, 'demo.sqlite drifted from data.js');
  console.log(`Verified ${RECORDS.length} manifest and SQLite records`);
}

if (process.argv.includes('--verify')) await verify();
else await generate();
