/**
 * SQLite Service for Jay Rosen Internet Archive
 *
 * Provides SQL querying capabilities using sql.js (SQLite compiled to WebAssembly)
 *
 * Features:
 * - In-browser SQLite database
 * - Full SQL query support
 * - Indexed tables for fast lookups
 * - Analytics and aggregation queries
 */

// sql.js is loaded dynamically to ensure JS and WASM are from the same source
// The import map version can have WASM binary mismatches

import { IS_LOCAL, BASE_PATH } from '../utils/pathResolver.js?v=3.4.1';

// Self-hosted sql.js WASM binary (#291). The loader JS below is pinned with
// SRI, but sql.js exposes no SRI hook for the .wasm it fetches via locateFile,
// so a cdnjs compromise could swap arbitrary WebAssembly. Serving the binary
// from our own pinned-deploy bundle removes that single-CDN trust. Path mirrors
// sw.js: locally the frontend dir is served at /frontend; on GH Pages and
// PressThink the archive is nested under BASE_PATH and frontend sits beneath it.
const SQL_WASM_PATH = IS_LOCAL
  ? '/frontend/vendor/sql-wasm-1.10.3.wasm'
  : `${BASE_PATH}/frontend/vendor/sql-wasm-1.10.3.wasm`;

// Database instance
let db = null;
let dbInitializing = false;
let dbInitPromise = null;

// Track if data has been loaded
let dataLoaded = false;

// sql.js module cache
let initSqlJs = null;

/**
 * Load sql.js dynamically from CDN
 * This ensures the JS and WASM binary are compatible
 */
const loadSqlJs = async () => {
  if (initSqlJs) return initSqlJs;

  // Use a script tag to load the UMD bundle which handles WASM loading properly
  return new Promise((resolve, reject) => {
    // Check if already loaded globally
    if (window.initSqlJs) {
      initSqlJs = window.initSqlJs;
      resolve(initSqlJs);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.min.js';
    // Subresource Integrity: pin the CDN payload so a hijacked or compromised
    // CDN cannot inject arbitrary JS into the main app. See issue #151.
    script.integrity = 'sha384-upXEZ8BUrRTJ5jBg9rLYXxwca56l9U3ymkbtFghF69ivmL1U7I9t07Hd1v7g/Pim';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      initSqlJs = window.initSqlJs;
      resolve(initSqlJs);
    };
    script.onerror = () => reject(new Error('Failed to load sql.js'));
    document.head.appendChild(script);
  });
};

/**
 * Initialize the SQLite database
 * Loads the WASM binary and creates an empty database
 */
export const initDatabase = async () => {
  if (db) return db;

  if (dbInitializing) {
    return dbInitPromise;
  }

  dbInitializing = true;
  dbInitPromise = (async () => {
    console.log('[SQLite] Initializing database...');

    try {
      // Load sql.js dynamically
      const sqlJsInit = await loadSqlJs();

      // Point sql.js at the self-hosted, version-pinned .wasm (#291) rather
      // than re-fetching it from cdnjs. The loader JS above is SRI-verified,
      // but locateFile has no integrity hook, so a CDN-served binary would be
      // unverified. The committed copy is part of the FTP-deployed bundle and
      // its bytes are pinned by a SHA-384 regression test.
      const SQL = await sqlJsInit({
        locateFile: () => SQL_WASM_PATH
      });

      db = new SQL.Database();
      console.log('[SQLite] Database initialized');

      // Create tables
      createTables();

      return db;
    } catch (error) {
      console.error('[SQLite] Failed to initialize:', error);
      dbInitializing = false;
      throw error;
    }
  })();

  return dbInitPromise;
};

/**
 * Create the database schema
 */
function createTables() {
  // Records table
  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      title TEXT,
      author TEXT,
      date TEXT,
      year TEXT,
      era TEXT,
      pub TEXT,
      url TEXT,
      summary TEXT,
      quote TEXT,
      type TEXT,
      verified INTEGER
    )
  `);

  // Create indexes for common queries
  db.run('CREATE INDEX IF NOT EXISTS idx_records_year ON records(year)');
  db.run('CREATE INDEX IF NOT EXISTS idx_records_era ON records(era)');
  db.run('CREATE INDEX IF NOT EXISTS idx_records_type ON records(type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_records_date ON records(date)');
  db.run('CREATE INDEX IF NOT EXISTS idx_records_pub ON records(pub)');

  // Categories junction table (many-to-many)
  db.run(`
    CREATE TABLE IF NOT EXISTS record_categories (
      record_id TEXT,
      category TEXT,
      PRIMARY KEY (record_id, category)
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_rc_category ON record_categories(category)');

  // Concepts junction table
  db.run(`
    CREATE TABLE IF NOT EXISTS record_concepts (
      record_id TEXT,
      concept TEXT,
      PRIMARY KEY (record_id, concept)
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_rcon_concept ON record_concepts(concept)');

  // Tags junction table
  db.run(`
    CREATE TABLE IF NOT EXISTS record_tags (
      record_id TEXT,
      tag TEXT,
      PRIMARY KEY (record_id, tag)
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_rt_tag ON record_tags(tag)');

  // Entities table
  db.run(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT,
      normalized_name TEXT,
      type TEXT,
      role TEXT,
      affiliation TEXT,
      prominence INTEGER,
      total_mentions INTEGER
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type)');
  db.run('CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name)');

  // Record-Entity relationships
  db.run(`
    CREATE TABLE IF NOT EXISTS record_entities (
      record_id TEXT,
      entity_id TEXT,
      PRIMARY KEY (record_id, entity_id)
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_re_entity ON record_entities(entity_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_re_record ON record_entities(record_id)');

  console.log('[SQLite] Tables created');
}

/**
 * Load archive data into the database
 * @param {Object} data - Archive data object with records, entities, etc.
 */
export const loadArchiveData = async (data) => {
  if (!db) {
    await initDatabase();
  }

  if (dataLoaded) {
    console.log('[SQLite] Data already loaded');
    return;
  }

  console.log('[SQLite] Loading archive data...');
  const startTime = performance.now();

  // Use a transaction for faster inserts
  db.run('BEGIN TRANSACTION');

  try {
    // Prepare statements
    const insertRecord = db.prepare(`
      INSERT OR REPLACE INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertCategory = db.prepare(`
      INSERT OR IGNORE INTO record_categories VALUES (?, ?)
    `);

    const insertConcept = db.prepare(`
      INSERT OR IGNORE INTO record_concepts VALUES (?, ?)
    `);

    const insertTag = db.prepare(`
      INSERT OR IGNORE INTO record_tags VALUES (?, ?)
    `);

    // Insert records
    for (const record of (data.records || [])) {
      insertRecord.run([
        record.id,
        record.title || '',
        record.author || 'Jay Rosen',
        record.date || '',
        record.year || '',
        record.era || '',
        record.pub || '',
        record.url || '',
        record.summary || record.summaryPreview || '',
        record.quote || '',
        record.type || 'article',
        record.verified ? 1 : 0
      ]);

      // Insert categories
      for (const category of (record.categories || [])) {
        insertCategory.run([record.id, category]);
      }

      // Insert concepts
      for (const concept of (record.concepts || [])) {
        insertConcept.run([record.id, concept]);
      }

      // Insert tags
      for (const tag of (record.tags || [])) {
        insertTag.run([record.id, tag]);
      }
    }

    insertRecord.free();
    insertCategory.free();
    insertConcept.free();
    insertTag.free();

    // Insert entities if provided
    if (data.entities && data.entities.length > 0) {
      const insertEntity = db.prepare(`
        INSERT OR REPLACE INTO entities VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const entity of data.entities) {
        insertEntity.run([
          entity.id,
          entity.name || '',
          entity.normalizedName || '',
          entity.type || '',
          entity.role || '',
          entity.affiliation || '',
          entity.prominence || 0,
          entity.totalMentions || 1
        ]);
      }

      insertEntity.free();
    }

    // Insert record-entity relationships
    // Source 1: explicit recordEntityMap (from archive-entities.json format)
    // Source 2: relatedIds on each record (from archive-data.json format)
    const insertRelation = db.prepare(`
      INSERT OR IGNORE INTO record_entities VALUES (?, ?)
    `);

    let reCount = 0;

    if (data.recordEntityMap) {
      for (const [recordId, entityIds] of Object.entries(data.recordEntityMap)) {
        for (const entityId of entityIds) {
          insertRelation.run([recordId, entityId]);
          reCount++;
        }
      }
    } else {
      // Fall back to relatedIds embedded in each record
      for (const record of (data.records || [])) {
        for (const entityId of (record.relatedIds || [])) {
          insertRelation.run([record.id, entityId]);
          reCount++;
        }
      }
    }

    insertRelation.free();
    console.log(`[SQLite] Loaded ${reCount} record-entity relationships`);

    db.run('COMMIT');
    dataLoaded = true;

    const elapsed = performance.now() - startTime;
    console.log(`[SQLite] Loaded ${data.records?.length || 0} records in ${elapsed.toFixed(0)}ms`);

  } catch (error) {
    db.run('ROLLBACK');
    console.error('[SQLite] Failed to load data:', error);
    throw error;
  }
};

/**
 * Execute a raw SQL query
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Array} Query results
 */
export const query = (sql, params = []) => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db.exec(sql, params);
};

/**
 * Execute a query and return results as objects
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Array} Array of row objects
 */
export const queryAsObjects = (sql, params = []) => {
  const results = query(sql, params);
  if (results.length === 0) return [];

  const columns = results[0].columns;
  return results[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
};

// ============================================
// ANALYTICS QUERIES
// ============================================

/**
 * Get record count by year
 */
export const getRecordCountByYear = () => {
  return queryAsObjects(`
    SELECT year, COUNT(*) as count
    FROM records
    WHERE year != ''
    GROUP BY year
    ORDER BY year
  `);
};

/**
 * Get record count by category
 */
export const getRecordCountByCategory = () => {
  return queryAsObjects(`
    SELECT category, COUNT(*) as count
    FROM record_categories
    GROUP BY category
    ORDER BY count DESC
  `);
};

/**
 * Get record count by era
 */
export const getRecordCountByEra = () => {
  return queryAsObjects(`
    SELECT era, COUNT(*) as count
    FROM records
    WHERE era != ''
    GROUP BY era
    ORDER BY
      CASE era
        WHEN 'Public Journalism (90s)' THEN 1
        WHEN 'Web & Blogging (00s)' THEN 2
        WHEN 'View from Nowhere (10s)' THEN 3
        WHEN 'Democracy in Crisis (20s)' THEN 4
        ELSE 5
      END
  `);
};

/**
 * Get record count by publication
 */
export const getRecordCountByPublication = (limit = 20) => {
  return queryAsObjects(`
    SELECT pub, COUNT(*) as count
    FROM records
    WHERE pub != ''
    GROUP BY pub
    ORDER BY count DESC
    LIMIT ?
  `, [limit]);
};

/**
 * Get most mentioned entities
 */
export const getMostMentionedEntities = (entityType = null, limit = 20) => {
  // Use the greater of: junction table count or entity's own totalMentions field.
  // The totalMentions field is pre-computed from the full dataset and is more
  // complete than the junction table (which only covers records with relatedIds).
  let sql = `
    SELECT e.name, e.type,
      MAX(COALESCE(e.total_mentions, 0), COUNT(re.record_id)) as mentions
    FROM entities e
    LEFT JOIN record_entities re ON e.id = re.entity_id
  `;

  const params = [];
  if (entityType) {
    sql += ' WHERE e.type = ?';
    params.push(entityType);
  }

  sql += `
    GROUP BY e.id
    ORDER BY mentions DESC
    LIMIT ?
  `;
  params.push(limit);

  return queryAsObjects(sql, params);
};

/**
 * Get most common concepts
 */
export const getMostCommonConcepts = (limit = 20) => {
  return queryAsObjects(`
    SELECT concept, COUNT(*) as count
    FROM record_concepts
    GROUP BY concept
    ORDER BY count DESC
    LIMIT ?
  `, [limit]);
};

/**
 * Get category co-occurrence (which categories appear together)
 */
export const getCategoryCoOccurrence = (limit = 20) => {
  return queryAsObjects(`
    SELECT
      rc1.category as category1,
      rc2.category as category2,
      COUNT(*) as co_occurrences
    FROM record_categories rc1
    JOIN record_categories rc2 ON rc1.record_id = rc2.record_id
    WHERE rc1.category < rc2.category
    GROUP BY rc1.category, rc2.category
    ORDER BY co_occurrences DESC
    LIMIT ?
  `, [limit]);
};

/**
 * Search records with full-text matching
 */
export const searchRecords = (searchTerm, limit = 50) => {
  const term = `%${searchTerm}%`;
  return queryAsObjects(`
    SELECT *
    FROM records
    WHERE title LIKE ? OR summary LIKE ? OR quote LIKE ?
    ORDER BY date DESC
    LIMIT ?
  `, [term, term, term, limit]);
};

/**
 * Find records by category
 */
export const getRecordsByCategory = (category, limit = 100) => {
  return queryAsObjects(`
    SELECT r.*
    FROM records r
    JOIN record_categories rc ON r.id = rc.record_id
    WHERE rc.category = ?
    ORDER BY r.date DESC
    LIMIT ?
  `, [category, limit]);
};

/**
 * Find records mentioning an entity
 */
export const getRecordsByEntity = (entityName, limit = 50) => {
  return queryAsObjects(`
    SELECT DISTINCT r.*
    FROM records r
    JOIN record_entities re ON r.id = re.record_id
    JOIN entities e ON re.entity_id = e.id
    WHERE e.name LIKE ?
    ORDER BY r.date DESC
    LIMIT ?
  `, [`%${entityName}%`, limit]);
};

/**
 * Get yearly trends for a category
 */
export const getCategoryTrend = (category) => {
  return queryAsObjects(`
    SELECT r.year, COUNT(*) as count
    FROM records r
    JOIN record_categories rc ON r.id = rc.record_id
    WHERE rc.category = ? AND r.year != ''
    GROUP BY r.year
    ORDER BY r.year
  `, [category]);
};

/**
 * Get writing output over time
 */
export const getOutputByMonth = () => {
  return queryAsObjects(`
    SELECT
      substr(date, 1, 7) as month,
      COUNT(*) as count
    FROM records
    WHERE date != ''
    GROUP BY month
    ORDER BY month DESC
    LIMIT 60
  `);
};

/**
 * Check if database is initialized and loaded
 */
export const isReady = () => db !== null && dataLoaded;

/**
 * Get database statistics
 */
export const getStats = () => {
  if (!db) return null;

  const recordCount = queryAsObjects('SELECT COUNT(*) as count FROM records')[0]?.count || 0;
  const categoryCount = queryAsObjects('SELECT COUNT(DISTINCT category) as count FROM record_categories')[0]?.count || 0;
  const conceptCount = queryAsObjects('SELECT COUNT(DISTINCT concept) as count FROM record_concepts')[0]?.count || 0;
  const entityCount = queryAsObjects('SELECT COUNT(*) as count FROM entities')[0]?.count || 0;

  return {
    records: recordCount,
    categories: categoryCount,
    concepts: conceptCount,
    entities: entityCount
  };
};
