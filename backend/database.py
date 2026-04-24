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
                user_id TEXT,
                integration_id TEXT,
                ai_decision TEXT,
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
                user_id TEXT,
                outcome TEXT,
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
                user_id TEXT,
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

        # Users table for RBAC auth.
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'USER',
                auth_provider TEXT NOT NULL DEFAULT 'local',
                google_id TEXT,
                telegram_chat_id TEXT,
                is_verified INTEGER NOT NULL DEFAULT 1,
                created_at REAL NOT NULL
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_integrations (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at REAL NOT NULL
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_alert_preferences (
                user_id TEXT PRIMARY KEY,
                email_enabled INTEGER NOT NULL DEFAULT 1,
                critical_only INTEGER NOT NULL DEFAULT 0,
                login_alerts INTEGER NOT NULL DEFAULT 1,
                automation_alerts INTEGER NOT NULL DEFAULT 1,
                updated_at REAL NOT NULL
            )
        """)
        
        # Default Configs
        await db.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", ("threshold_block", "0.8"))
        await db.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", ("threshold_queue", "0.4"))
        await db.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", ("oauth_blocklist", "[]"))

        # Backward-compatible schema migrations for existing DB files.
        migrations = [
            "ALTER TABLE events ADD COLUMN user_id TEXT",
            "ALTER TABLE incidents ADD COLUMN user_id TEXT",
            "ALTER TABLE incidents ADD COLUMN outcome TEXT",
            "ALTER TABLE audit_trail ADD COLUMN user_id TEXT",
            "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER'",
            "ALTER TABLE users ADD COLUMN telegram_chat_id TEXT",
            "ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 1",
            "ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'",
            "ALTER TABLE users ADD COLUMN google_id TEXT",
            "ALTER TABLE events ADD COLUMN integration_id TEXT",
            "ALTER TABLE events ADD COLUMN ai_decision TEXT",
        ]
        for stmt in migrations:
            try:
                await db.execute(stmt)
            except aiosqlite.OperationalError:
                # Column already exists in most cases.
                pass

        # Query acceleration for user-centric dashboard.
        await db.execute("CREATE INDEX IF NOT EXISTS idx_events_user_time ON events(user_id, timestamp DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_incidents_user_time ON incidents(user_id, created_at DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_trail(user_id, timestamp DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_integrations_user_time ON user_integrations(user_id, created_at DESC)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_events_integration_time ON events(integration_id, timestamp DESC)")
        
        await db.commit()

async def get_db():
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    return db
