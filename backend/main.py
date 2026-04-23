import json
import time
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from .database import init_db, get_db
from core.models import SecurityEvent, IncidentCard
from core.supervisor import Supervisor

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database
    await init_db()
    yield
    # Cleanup logic can go here

app = FastAPI(title="SentinelMesh API", lifespan=lifespan)
supervisor = Supervisor()

# In-memory store for connected WebSocket clients
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@app.get("/")
async def root():
    return {"status": "ok", "service": "SentinelMesh API"}

@app.post("/api/v1/events")
async def ingest_event(event_data: Dict[str, Any]):
    db = await get_db()
    
    # Load config for thresholds
    async with db.execute("SELECT key, value FROM config") as cursor:
        rows = await cursor.fetchall()
        config = {row["key"]: row["value"] for row in rows}
        
    # 1. Process with Supervisor
    try:
        incident = supervisor.process_event(
            event_data,
            threshold_block=float(config.get("threshold_block", 0.8)),
            threshold_queue=float(config.get("threshold_queue", 0.4))
        )
    except Exception as e:
        await db.close()
        raise HTTPException(status_code=500, detail=str(e))

    # 2. Store event in DB
    await db.execute(
        "INSERT INTO events (event_id, timestamp, source, event_type, metadata) VALUES (?, ?, ?, ?, ?)",
        (event_data["event_id"], event_data["timestamp"], event_data["source"], event_data["event_type"], json.dumps(event_data.get("metadata", {})))
    )
    
    if incident:
        # Store incident
        await db.execute(
            "INSERT INTO incidents (incident_id, summary, severity, status, created_at, signals, affected_components, timeline) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                incident.incident_id, 
                incident.summary, 
                incident.severity, 
                incident.status, 
                time.time(),
                json.dumps([s.model_dump() for s in incident.signals]),
                json.dumps(incident.affected_components),
                json.dumps(incident.timeline)
            )
        )
        # Broadcast to dashboard
        await manager.broadcast(json.dumps(incident.model_dump()))

    await db.commit()
    await db.close()

    return {"status": "processed", "incident_id": incident.incident_id if incident else None}

@app.get("/api/v1/incidents")
async def get_incidents():
    db = await get_db()
    async with db.execute("SELECT * FROM incidents ORDER BY created_at DESC") as cursor:
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            # Parse JSON fields
            if d.get("signals"): d["signals"] = json.loads(d["signals"])
            if d.get("affected_components"): d["affected_components"] = json.loads(d["affected_components"])
            if d.get("timeline"): d["timeline"] = json.loads(d["timeline"])
            result.append(d)
    await db.close()
    return result

@app.post("/api/v1/approve/{incident_id}")
async def approve_incident(incident_id: str, actor: str = "Admin"):
    db = await get_db()
    # 1. Update incident status
    await db.execute("UPDATE incidents SET status = 'approved' WHERE incident_id = ?", (incident_id,))
    
    # 2. Sign the action for audit trail
    action_text = f"Approved incident {incident_id} by {actor}"
    signature = supervisor.gatekeeper.sign_message(action_text).hex()
    
    # 3. Store in audit trail
    entry_id = f"aud_{int(time.time())}"
    await db.execute(
        "INSERT INTO audit_trail (entry_id, timestamp, action, actor, details, signature) VALUES (?, ?, ?, ?, ?, ?)",
        (entry_id, time.time(), "APPROVE", actor, action_text, signature)
    )
    
    await db.commit()
    await db.close()
    return {"status": "approved", "signature": signature}

@app.post("/api/v1/block/{incident_id}")
async def block_incident(incident_id: str, actor: str = "Admin"):
    db = await get_db()
    # 1. Update incident status
    await db.execute("UPDATE incidents SET status = 'blocked' WHERE incident_id = ?", (incident_id,))
    
    # 2. Sign the action for audit trail
    action_text = f"Blocked incident {incident_id} by {actor}"
    signature = supervisor.gatekeeper.sign_message(action_text).hex()
    
    # 3. Store in audit trail
    entry_id = f"aud_{int(time.time())}"
    await db.execute(
        "INSERT INTO audit_trail (entry_id, timestamp, action, actor, details, signature) VALUES (?, ?, ?, ?, ?, ?)",
        (entry_id, time.time(), "BLOCK", actor, action_text, signature)
    )
    
    await db.commit()
    await db.close()
    return {"status": "blocked", "signature": signature}

@app.get("/api/v1/audit-trail")
async def get_audit_trail():
    db = await get_db()
    async with db.execute("SELECT * FROM audit_trail ORDER BY timestamp DESC") as cursor:
        rows = await cursor.fetchall()
        result = [dict(row) for row in rows]
    await db.close()
    return result

@app.get("/api/v1/config")
async def get_config():
    db = await get_db()
    async with db.execute("SELECT * FROM config") as cursor:
        rows = await cursor.fetchall()
        config = {row["key"]: row["value"] for row in rows}
    await db.close()
    return config

@app.post("/api/v1/config")
async def update_config(config: Dict[str, str]):
    db = await get_db()
    for key, value in config.items():
        await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, value))
    await db.commit()
    await db.close()
    return {"status": "updated"}

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)
