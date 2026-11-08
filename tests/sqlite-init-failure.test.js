/**
 * A failed schema build must not leave a half-built database behind.
 *
 * initDatabase used to assign the module-level `db` before createTables ran.
 * If createTables threw, the next initDatabase call returned that same broken
 * database through its `if (db) return db` fast path, so the query runtime
 * could never recover without a page reload (state machine map, follow-up 21).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const created = [];
let failSchema = true;

class FakeDatabase {
  constructor() {
    this.statements = [];
    this.closed = false;
    created.push(this);
  }
  run(sql) {
    if (failSchema) throw new Error('schema build failed');
    this.statements.push(sql);
  }
  close() {
    this.closed = true;
  }
}

globalThis.window = { initSqlJs: async () => ({ Database: FakeDatabase }) };

const sqlite = await import('../frontend/services/sqliteService.js');

describe('sqliteService initDatabase after a schema failure', () => {
  it('builds a fresh database on retry instead of returning the broken one', async () => {
    const originalError = console.error;
    const originalLog = console.log;
    console.error = () => {};
    console.log = () => {};
    try {
      await assert.rejects(sqlite.initDatabase(), /schema build failed/);

      failSchema = false;
      const db = await sqlite.initDatabase();

      assert.equal(created.length, 2, 'the retry must create a new database');
      assert.equal(db, created[1]);
      assert.notEqual(db, created[0]);
      assert.ok(
        db.statements.some(sql => /CREATE TABLE IF NOT EXISTS records/.test(sql)),
        'the returned database must have its schema',
      );
      assert.equal(created[0].closed, true, 'the half-built database should be closed');
    } finally {
      console.error = originalError;
      console.log = originalLog;
    }
  });
});
