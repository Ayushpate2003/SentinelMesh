import aiosqlite
import os
import logging

DATABASE_PATH = os.getenv("DATABASE_URL", "sentinelmesh.db").replace("sqlite:///", "")

logger = logging.getLogger("Database")

async def init_db():
    async with aiosqlite.connect(DATABASE_PATH) as db:
        logger.info(f"Initializing database at {DATABASE_PATH}")
        
        # Events table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                event_id TEXT PRIMARY KEY,
                timestamp REAL,
                source TEXT,
                event_type TEXT,
                metadata TEXT,
                raw_data TEXT
            )
        """)
        
        # Incidents table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                incident_id TEXT PRIMARY KEY,
                summary TEXT,
                severity TEXT,
                status TEXT,
                created_at REAL,
                signals TEXT,
                affected_components TEXT,
                timeline TEXT
            )
        """)
        
        # Audit Trail table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS audit_trail (
                entry_id TEXT PRIMARY KEY,
                timestamp REAL,
                action TEXT,
                actor TEXT,
                details TEXT,
                signature TEXT
            )
        """)
        
        # Config table
        await db.execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        
        # Default Configs
        await db.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", ("threshold_block", "0.8"))
        await db.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", ("threshold_queue", "0.4"))
        await db.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", ("oauth_blocklist", "[]"))
        
        await db.commit()

async def get_db():
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    return db
