# -*- coding: utf-8 -*-
"""
Extraction Database

SQLite-based progress tracking for entity extraction from social posts.
Provides resume capability and incremental saves for long-running extraction jobs.
"""

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Any
from contextlib import contextmanager


class ExtractionDB:
    """SQLite database for tracking extraction progress."""

    def __init__(self, db_path: Path):
        """
        Initialize the extraction database.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _init_schema(self):
        """Create database tables if they don't exist."""
        with self._get_connection() as conn:
            conn.executescript("""
                -- Track which records have been processed
                CREATE TABLE IF NOT EXISTS processed_records (
                    record_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL DEFAULT 'completed',
                    processed_at TEXT NOT NULL,
                    entity_count INTEGER DEFAULT 0,
                    relationship_count INTEGER DEFAULT 0,
                    error_msg TEXT
                );

                -- Store extracted entities
                CREATE TABLE IF NOT EXISTS entities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_name TEXT NOT NULL,
                    normalized_name TEXT,
                    role_or_description TEXT,
                    affiliation TEXT,
                    prominence_score INTEGER,
                    first_mention_record_id TEXT,
                    total_mentions INTEGER DEFAULT 1,
                    related_entities TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE(entity_id)
                );

                -- Store extracted relationships
                CREATE TABLE IF NOT EXISTS relationships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    relationship_id TEXT,
                    source_entity_id TEXT NOT NULL,
                    target_entity_id TEXT NOT NULL,
                    relationship_type TEXT NOT NULL,
                    description TEXT,
                    evidence TEXT,
                    source_record_id TEXT,
                    strength TEXT,
                    temporal_context TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL
                );

                -- Track session progress for resume capability
                CREATE TABLE IF NOT EXISTS session_progress (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_start TEXT NOT NULL,
                    session_end TEXT,
                    total_records INTEGER NOT NULL,
                    processed_count INTEGER DEFAULT 0,
                    entity_count INTEGER DEFAULT 0,
                    relationship_count INTEGER DEFAULT 0,
                    last_record_id TEXT,
                    status TEXT DEFAULT 'running',
                    notes TEXT
                );

                -- Create indexes for common queries
                CREATE INDEX IF NOT EXISTS idx_processed_status ON processed_records(status);
                CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
                CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(normalized_name);
                CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_entity_id);
                CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_entity_id);
            """)

    @contextmanager
    def _get_connection(self):
        """Get a database connection with context management."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ========== Record Processing Tracking ==========

    def mark_processed(
        self,
        record_id: str,
        entity_count: int = 0,
        relationship_count: int = 0,
        status: str = 'completed',
        error_msg: Optional[str] = None
    ):
        """
        Mark a record as processed.

        Args:
            record_id: The record ID that was processed
            entity_count: Number of entities extracted
            relationship_count: Number of relationships extracted
            status: 'completed', 'failed', or 'skipped'
            error_msg: Error message if status is 'failed'
        """
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO processed_records
                (record_id, status, processed_at, entity_count, relationship_count, error_msg)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                record_id,
                status,
                datetime.now().isoformat(),
                entity_count,
                relationship_count,
                error_msg
            ))

    def get_processed_ids(self) -> Set[str]:
        """
        Get all processed record IDs.

        Returns:
            Set of record ID strings that have been processed
        """
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT record_id FROM processed_records")
            return {row['record_id'] for row in cursor.fetchall()}

    def get_processed_count(self) -> int:
        """Get count of processed records."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) as cnt FROM processed_records")
            return cursor.fetchone()['cnt']

    def get_failed_records(self) -> List[Dict]:
        """Get all records that failed processing."""
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM processed_records WHERE status = 'failed'"
            )
            return [dict(row) for row in cursor.fetchall()]

    # ========== Entity Storage ==========

    @staticmethod
    def _insert_entity(conn, entity: Dict[str, Any]):
        """Insert (or replace) one entity row on an open connection.

        Shared by save_entity and save_entities so the column list, defaults,
        and per-row created_at timestamp live in one place.
        """
        conn.execute("""
            INSERT OR REPLACE INTO entities
            (entity_id, entity_type, entity_name, normalized_name,
             role_or_description, affiliation, prominence_score,
             first_mention_record_id, total_mentions, related_entities,
             notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            entity.get('entity_id'),
            entity.get('entity_type'),
            entity.get('entity_name'),
            entity.get('normalized_name'),
            entity.get('role_or_description', ''),
            entity.get('affiliation', ''),
            entity.get('prominence_score', 0),
            entity.get('first_mention_record_id', ''),
            entity.get('total_mentions', 1),
            entity.get('related_entities', ''),
            entity.get('notes', ''),
            datetime.now().isoformat()
        ))

    def save_entity(self, entity: Dict[str, Any]):
        """
        Save a single entity to the database.

        Args:
            entity: Entity dictionary with keys matching table columns
        """
        with self._get_connection() as conn:
            self._insert_entity(conn, entity)

    def save_entities(self, entities: List[Dict[str, Any]]):
        """Save multiple entities in a single transaction."""
        with self._get_connection() as conn:
            for entity in entities:
                self._insert_entity(conn, entity)

    def get_all_entities(self) -> List[Dict]:
        """Get all entities from the database."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM entities ORDER BY entity_id")
            return [dict(row) for row in cursor.fetchall()]

    def get_entity_count(self) -> int:
        """Get count of entities in database."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) as cnt FROM entities")
            return cursor.fetchone()['cnt']

    # ========== Relationship Storage ==========

    @staticmethod
    def _insert_relationship(conn, relationship: Dict[str, Any]):
        """Insert one relationship row on an open connection.

        Shared by save_relationship and save_relationships. Relationships have
        no unique constraint, so a repeated relationship_id appends a row.
        """
        conn.execute("""
            INSERT INTO relationships
            (relationship_id, source_entity_id, target_entity_id,
             relationship_type, description, evidence, source_record_id,
             strength, temporal_context, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            relationship.get('relationship_id'),
            relationship.get('source_entity_id'),
            relationship.get('target_entity_id'),
            relationship.get('relationship_type'),
            relationship.get('description', ''),
            relationship.get('evidence', ''),
            relationship.get('source_record_id', ''),
            relationship.get('strength', ''),
            relationship.get('temporal_context', ''),
            relationship.get('notes', ''),
            datetime.now().isoformat()
        ))

    def save_relationship(self, relationship: Dict[str, Any]):
        """
        Save a single relationship to the database.

        Args:
            relationship: Relationship dictionary
        """
        with self._get_connection() as conn:
            self._insert_relationship(conn, relationship)

    def save_relationships(self, relationships: List[Dict[str, Any]]):
        """Save multiple relationships in a single transaction."""
        with self._get_connection() as conn:
            for rel in relationships:
                self._insert_relationship(conn, rel)

    def get_all_relationships(self) -> List[Dict]:
        """Get all relationships from the database."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM relationships ORDER BY id")
            return [dict(row) for row in cursor.fetchall()]

    def get_relationship_count(self) -> int:
        """Get count of relationships in database."""
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) as cnt FROM relationships")
            return cursor.fetchone()['cnt']

    # ========== Session Progress ==========

    def start_session(self, total_records: int, notes: str = '') -> int:
        """
        Start a new extraction session.

        Args:
            total_records: Total number of records to process
            notes: Optional notes about the session

        Returns:
            Session ID
        """
        with self._get_connection() as conn:
            cursor = conn.execute("""
                INSERT INTO session_progress
                (session_start, total_records, status, notes)
                VALUES (?, ?, 'running', ?)
            """, (datetime.now().isoformat(), total_records, notes))
            return cursor.lastrowid

    def update_session_progress(
        self,
        session_id: int,
        processed_count: int,
        entity_count: int,
        relationship_count: int,
        last_record_id: str
    ):
        """Update progress for a running session."""
        with self._get_connection() as conn:
            conn.execute("""
                UPDATE session_progress
                SET processed_count = ?, entity_count = ?,
                    relationship_count = ?, last_record_id = ?
                WHERE id = ?
            """, (processed_count, entity_count, relationship_count,
                  last_record_id, session_id))

    def end_session(self, session_id: int, status: str = 'completed'):
        """Mark a session as completed."""
        with self._get_connection() as conn:
            conn.execute("""
                UPDATE session_progress
                SET session_end = ?, status = ?
                WHERE id = ?
            """, (datetime.now().isoformat(), status, session_id))

    def get_last_session(self) -> Optional[Dict]:
        """Get the most recent session."""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT * FROM session_progress
                ORDER BY id DESC LIMIT 1
            """)
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_session_stats(self) -> Dict:
        """Get aggregate stats across all sessions."""
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT
                    COUNT(*) as total_sessions,
                    SUM(processed_count) as total_processed,
                    SUM(entity_count) as total_entities,
                    SUM(relationship_count) as total_relationships
                FROM session_progress
            """)
            row = cursor.fetchone()
            return dict(row) if row else {}

    # ========== Utility Methods ==========

    def get_stats(self) -> Dict:
        """Get comprehensive database statistics."""
        with self._get_connection() as conn:
            stats = {}

            # Processed records
            cursor = conn.execute("""
                SELECT status, COUNT(*) as cnt
                FROM processed_records
                GROUP BY status
            """)
            stats['processed_by_status'] = {
                row['status']: row['cnt'] for row in cursor.fetchall()
            }

            # Entity counts by type
            cursor = conn.execute("""
                SELECT entity_type, COUNT(*) as cnt
                FROM entities
                GROUP BY entity_type
            """)
            stats['entities_by_type'] = {
                row['entity_type']: row['cnt'] for row in cursor.fetchall()
            }

            # Relationship counts by type
            cursor = conn.execute("""
                SELECT relationship_type, COUNT(*) as cnt
                FROM relationships
                GROUP BY relationship_type
            """)
            stats['relationships_by_type'] = {
                row['relationship_type']: row['cnt'] for row in cursor.fetchall()
            }

            # Totals
            stats['total_entities'] = sum(stats.get('entities_by_type', {}).values())
            stats['total_relationships'] = sum(stats.get('relationships_by_type', {}).values())
            stats['total_processed'] = sum(stats.get('processed_by_status', {}).values())

            return stats

    def clear_all(self):
        """Clear all data from the database. Use with caution!"""
        with self._get_connection() as conn:
            conn.executescript("""
                DELETE FROM processed_records;
                DELETE FROM entities;
                DELETE FROM relationships;
                DELETE FROM session_progress;
            """)

    def vacuum(self):
        """Reclaim space after deletions."""
        with self._get_connection() as conn:
            conn.execute("VACUUM")
