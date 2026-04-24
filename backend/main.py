import asyncio
import contextvars
import datetime
import json
import logging
import os
import resource
import subprocess
import time
import urllib.request
import uuid
from contextlib import asynccontextmanager
from collections import deque
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from redis.asyncio import Redis

from core.supervisor import Supervisor
from integrations.notifications import NotificationService
from .database import get_db, init_db


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": int(time.time() * 1000),
            "level": record.levelname,
            "service": "backend",
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get() or "n/a",
        }
        return json.dumps(payload, default=str)


request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")

handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logger = logging.getLogger("backend")
logger.handlers = [handler]
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))
logger.propagate = False

LIGHT_MODE = os.getenv("LIGHT_MODE", "false").lower() == "true"
SIMULATION_ENABLED = os.getenv("SIMULATION_ENABLED", "false").lower() == "true"
MAX_TESTS_PER_MINUTE = int(os.getenv("MAX_TESTS_PER_MINUTE", "2"))
QUEUE_MAX_SIZE = int(os.getenv("QUEUE_MAX_SIZE", "1000"))
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
ALERTMANAGER_URL = os.getenv("ALERTMANAGER_URL", "http://alertmanager:9093")
REQUEST_TIMEOUT_MS = int(os.getenv("REQUEST_TIMEOUT_MS", "500"))
IP_RATE_LIMIT_PER_MIN = int(os.getenv("IP_RATE_LIMIT_PER_MIN", "120"))
EVENT_RATE_LIMIT_PER_MIN = int(os.getenv("EVENT_RATE_LIMIT_PER_MIN", "60"))
QUEUE_KEY = "sentinelmesh:event_queue"
DLQ_KEY = "sentinelmesh:event_dlq"
INCIDENT_CHANNEL = "sentinelmesh:incidents"
WORKER_HEARTBEAT_KEY_PREFIX = "sentinelmesh:worker:heartbeat:"
ALERT_COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_SECONDS", "120"))
SLO_QUEUE_DEPTH_WARN = int(os.getenv("SLO_QUEUE_DEPTH_WARN", "50"))
SLO_QUEUE_DEPTH_CRITICAL = int(os.getenv("SLO_QUEUE_DEPTH_CRITICAL", "100"))
SLO_DLQ_DEPTH_WARN = int(os.getenv("SLO_DLQ_DEPTH_WARN", "5"))
SLO_API_P95_MS_WARN = int(os.getenv("SLO_API_P95_MS_WARN", "200"))
test_starts_in_window: List[float] = []

REQUEST_COUNT = Counter("sentinelmesh_http_requests_total", "Total HTTP requests", ["method", "path", "status"])
REQUEST_LATENCY = Histogram("sentinelmesh_http_request_latency_seconds", "Request latency", ["method", "path"])
ERROR_COUNT = Counter("sentinelmesh_errors_total", "Errors by type", ["type"])
EVENTS_INGESTED = Counter("sentinelmesh_events_ingested_total", "Incoming events")
QUEUE_DEPTH = Gauge("sentinelmesh_event_queue_depth", "Event queue depth")
QUEUE_DEPTH_COMPAT = Gauge("sentinelmesh_queue_depth", "Event queue depth (compat)")
DLQ_DEPTH = Gauge("sentinelmesh_dlq_depth", "Dead letter queue depth")
WORKERS_HEALTHY = Gauge("sentinelmesh_workers_healthy", "Healthy worker count")
MEMORY_MB = Gauge("sentinelmesh_memory_mb", "Process memory usage MB")


def _memory_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0


app = FastAPI(title="SentinelMesh API")
supervisor = Supervisor()
redis_client: Redis | None = None
relay_task = None
metrics_task = None
alerts_task = None
recent_latencies_ms = deque(maxlen=300)
notification_service = NotificationService()
alert_last_sent: Dict[str, float] = {}

cors_origins = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.middleware("http")
async def request_metrics_middleware(request: Request, call_next):
    req_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    request_id_ctx.set(req_id)
    request.state.request_id = req_id

    ip = request.client.host if request.client else "unknown"
    endpoint_key = f"ratelimit:endpoint:{ip}:{request.url.path}:{int(time.time() // 60)}"
    global_key = f"ratelimit:ip:{ip}:{int(time.time() // 60)}"

    if redis_client:
        global_count = await redis_client.incr(global_key)
        if global_count == 1:
            await redis_client.expire(global_key, 70)
        endpoint_count = await redis_client.incr(endpoint_key)
        if endpoint_count == 1:
            await redis_client.expire(endpoint_key, 70)
        if global_count > IP_RATE_LIMIT_PER_MIN:
            ERROR_COUNT.labels(type="rate_limit_ip").inc()
            return JSONResponse(status_code=429, content={"detail": "IP rate limit exceeded"})
        if request.url.path == "/api/v1/events" and endpoint_count > EVENT_RATE_LIMIT_PER_MIN:
            ERROR_COUNT.labels(type="rate_limit_endpoint").inc()
            return JSONResponse(status_code=429, content={"detail": "Endpoint rate limit exceeded"})

    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        ERROR_COUNT.labels(type="unhandled_exception").inc()
        logger.exception("Unhandled request failure")
        raise
    elapsed = time.perf_counter() - started
    REQUEST_COUNT.labels(method=request.method, path=request.url.path, status=str(status_code)).inc()
    REQUEST_LATENCY.labels(method=request.method, path=request.url.path).observe(elapsed)
    recent_latencies_ms.append(elapsed * 1000)
    MEMORY_MB.set(_memory_mb())
    logger.info(
        "request_complete method=%s path=%s status=%s latency_ms=%.2f ip=%s",
        request.method,
        request.url.path,
        status_code,
        elapsed * 1000,
        ip,
    )
    response.headers["x-request-id"] = req_id
    return response


@app.get("/")
async def root():
    return {"status": "ok", "service": "SentinelMesh API"}

@app.post("/api/v1/events")
async def ingest_event(event_data: Dict[str, Any]):
    if not redis_client:
        raise HTTPException(status_code=503, detail="Queue backend unavailable")

    queue_depth = await redis_client.llen(QUEUE_KEY)
    if queue_depth >= QUEUE_MAX_SIZE:
        ERROR_COUNT.labels(type="queue_backpressure").inc()
        raise HTTPException(status_code=503, detail="System under load, try again")

    payload = {
        "event": event_data,
        "retry_count": 0,
        "enqueued_at": time.time(),
        "request_id": request_id_ctx.get() or "",
    }
    await redis_client.lpush(QUEUE_KEY, json.dumps(payload))
    EVENTS_INGESTED.inc()
    QUEUE_DEPTH.set(queue_depth + 1)
    QUEUE_DEPTH_COMPAT.set(queue_depth + 1)
    return {"status": "queued", "queue_depth": queue_depth + 1}

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

running_tests = {}

@app.post("/api/v1/run-test/{test_type}")
async def run_test(test_type: str, actor: str = "Admin"):
    allowed_types = {
        "oauth": "attacker_sim/oauth_attack.py",
        "credential": "attacker_sim/cred_dump.py",
        "supply_chain": "attacker_sim/supply_chain.py"
    }
    
    if LIGHT_MODE:
        return JSONResponse(
            status_code=503,
            content={"detail": "LIGHT_MODE is enabled. Simulations are disabled."},
        )

    if not SIMULATION_ENABLED:
        return JSONResponse(
            status_code=403,
            content={"detail": "SIMULATION_ENABLED is false. Enable explicitly to run tests."},
        )

    if test_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid test type")
        
    # Optional: Add concurrency limit (only 1 test at a time)
    if any(p.poll() is None for p in running_tests.values()):
        raise HTTPException(status_code=429, detail="A test is already running. Please wait or stop it.")

    now = time.time()
    cutoff = now - 60
    while test_starts_in_window and test_starts_in_window[0] < cutoff:
        test_starts_in_window.pop(0)
    if len(test_starts_in_window) >= MAX_TESTS_PER_MINUTE:
        raise HTTPException(status_code=429, detail="Simulation rate limit reached. Try again later.")
    test_starts_in_window.append(now)

    script_path = allowed_types[test_type]
    
    # Run non-blocking
    env = os.environ.copy()
    env["TRIGGERED_BY_API"] = "1"
    env["SAFE_MODE"] = "true"  # Ensure safe mode is enforced
    env["BACKEND_URL"] = "http://localhost:8002/api/v1/events"
    
    # We use a path relative to the root where docker-compose runs
    # Assuming backend runs in /app and attacker_sim is mounted there.
    if not os.path.exists(script_path):
        # Fallback to absolute path just in case we are running outside docker
        script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), script_path)

    process = subprocess.Popen(
        ["python", script_path],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    
    running_tests[test_type] = process
    
    # Log execution in audit trail
    db = await get_db()
    action_text = f"Started manual simulation: {test_type}"
    signature = supervisor.gatekeeper.sign_message(action_text).hex()
    entry_id = f"aud_{int(time.time())}"
    await db.execute(
        "INSERT INTO audit_trail (entry_id, timestamp, action, actor, details, signature) VALUES (?, ?, ?, ?, ?, ?)",
        (entry_id, time.time(), "RUN_TEST", actor, action_text, signature)
    )
    await db.commit()
    await db.close()

    return {"status": "started", "test_type": test_type}

@app.post("/api/v1/stop-tests")
async def stop_tests(actor: str = "Admin"):
    stopped = []
    for test_type, process in running_tests.items():
        if process.poll() is None:  # Still running
            process.terminate()
            stopped.append(test_type)
            
    running_tests.clear()
    
    if stopped:
        db = await get_db()
        action_text = f"Stopped simulations: {', '.join(stopped)}"
        signature = supervisor.gatekeeper.sign_message(action_text).hex()
        entry_id = f"aud_{int(time.time())}"
        await db.execute(
            "INSERT INTO audit_trail (entry_id, timestamp, action, actor, details, signature) VALUES (?, ?, ?, ?, ?, ?)",
            (entry_id, time.time(), "STOP_TESTS", actor, action_text, signature)
        )
        await db.commit()
        await db.close()
    
    return {"status": "stopped", "stopped_tests": stopped}


@app.get("/api/v1/system/health")
async def system_health():
    running = [test_type for test_type, process in running_tests.items() if process.poll() is None]
    queue_depth = -1
    dlq_depth = -1
    workers_healthy = 0
    latency_p95_ms = 0.0
    redis_ok = False
    if redis_client:
        try:
            queue_depth = await redis_client.llen(QUEUE_KEY)
            dlq_depth = await redis_client.llen(DLQ_KEY)
            workers_healthy = len([k async for k in redis_client.scan_iter(match=f"{WORKER_HEARTBEAT_KEY_PREFIX}*")])
            redis_ok = (await redis_client.ping()) is True
        except Exception:
            redis_ok = False
    if recent_latencies_ms:
        ordered = sorted(recent_latencies_ms)
        idx = max(0, int(0.95 * (len(ordered) - 1)))
        latency_p95_ms = ordered[idx]
    return {
        "light_mode": LIGHT_MODE,
        "simulation_enabled": SIMULATION_ENABLED,
        "running_tests": running,
        "memory_mb": round(_memory_mb(), 2),
        "queue_depth": queue_depth,
        "dlq_depth": dlq_depth,
        "workers_healthy": workers_healthy,
        "latency_p95_ms": round(latency_p95_ms, 2),
        "redis_ok": redis_ok,
        "relay_running": bool(relay_task and not relay_task.done()),
        "slo": {
            "api_latency_ms_target": SLO_API_P95_MS_WARN,
            "queue_depth_warn": SLO_QUEUE_DEPTH_WARN,
            "queue_depth_critical": SLO_QUEUE_DEPTH_CRITICAL,
            "dlq_depth_warn": SLO_DLQ_DEPTH_WARN,
        },
    }


@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/system/alerts")
async def system_alerts():
    alerts: List[Dict[str, Any]] = []
    try:
        with urllib.request.urlopen(f"{ALERTMANAGER_URL}/api/v2/alerts", timeout=2) as response:
            payload = json.loads(response.read().decode("utf-8"))
            alerts = [
                {
                    "name": item.get("labels", {}).get("alertname", "unknown"),
                    "severity": item.get("labels", {}).get("severity", "unknown"),
                    "component": item.get("labels", {}).get("component", "unknown"),
                    "status": item.get("status", {}).get("state", "unknown"),
                    "starts_at": item.get("startsAt"),
                    "ends_at": item.get("endsAt"),
                    "summary": item.get("annotations", {}).get("summary", ""),
                    "description": item.get("annotations", {}).get("description", ""),
                    "source": "alertmanager",
                }
                for item in payload
            ]
            now = time.time()
            for alert in alerts:
                starts_at = alert.get("starts_at")
                duration_seconds = 0
                if starts_at:
                    try:
                        ts = starts_at.replace("Z", "+00:00")
                        duration_seconds = max(0, int(now - datetime.datetime.fromisoformat(ts).timestamp()))
                    except Exception:
                        duration_seconds = 0
                alert["duration_seconds"] = duration_seconds
    except Exception:
        ERROR_COUNT.labels(type="alertmanager_unavailable").inc()

    # Fallback: surface recent high-severity incidents (Telegram notifications originate here).
    if not alerts:
        db = await get_db()
        try:
            one_hour_ago = time.time() - 3600
            async with db.execute(
                """
                SELECT incident_id, summary, severity, status, created_at
                FROM incidents
                WHERE created_at >= ?
                  AND LOWER(severity) IN ('high', 'critical')
                ORDER BY created_at DESC
                LIMIT 10
                """,
                (one_hour_ago,),
            ) as cursor:
                rows = await cursor.fetchall()
                now = time.time()
                for row in rows:
                    created_at = row["created_at"] or now
                    alerts.append(
                        {
                            "name": f"Incident:{row['incident_id']}",
                            "severity": (row["severity"] or "high").lower(),
                            "component": "supervisor",
                            "status": row["status"] or "active",
                            "starts_at": datetime.datetime.fromtimestamp(created_at, datetime.timezone.utc).isoformat(),
                            "ends_at": None,
                            "summary": row["summary"] or "Security incident",
                            "description": "Recent high-severity incident from runtime pipeline.",
                            "duration_seconds": max(0, int(now - created_at)),
                            "source": "incident-fallback",
                        }
                    )
        finally:
            await db.close()

    return {"alerts": alerts}

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def _incident_relay():
    if not redis_client:
        return
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(INCIDENT_CHANNEL)
    logger.info("incident_relay_started channel=%s", INCIDENT_CHANNEL)
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("type") == "message":
                await manager.broadcast(message["data"])
    finally:
        await pubsub.unsubscribe(INCIDENT_CHANNEL)
        await pubsub.aclose()
        logger.info("incident_relay_stopped")


def _send_system_alert_once(key: str, severity: str, summary: str, description: str):
    now = time.time()
    if now - alert_last_sent.get(key, 0) < ALERT_COOLDOWN_SECONDS:
        return
    alert_last_sent[key] = now
    notification_service.send_telegram(
        f"SentinelMesh System Alert\n"
        f"Severity: {severity}\n"
        f"Alert: {summary}\n"
        f"Details: {description}"
    )


async def _metrics_refresh_loop():
    while True:
        try:
            if redis_client:
                queue_depth = await redis_client.llen(QUEUE_KEY)
                dlq_depth = await redis_client.llen(DLQ_KEY)
                workers_healthy = len([k async for k in redis_client.scan_iter(match=f"{WORKER_HEARTBEAT_KEY_PREFIX}*")])
                QUEUE_DEPTH.set(queue_depth)
                QUEUE_DEPTH_COMPAT.set(queue_depth)
                DLQ_DEPTH.set(dlq_depth)
                WORKERS_HEALTHY.set(workers_healthy)
            MEMORY_MB.set(_memory_mb())
        except Exception:
            ERROR_COUNT.labels(type="metrics_refresh_loop").inc()
        await asyncio.sleep(5)


async def _alerts_loop():
    while True:
        try:
            if redis_client:
                queue_depth = await redis_client.llen(QUEUE_KEY)
                dlq_depth = await redis_client.llen(DLQ_KEY)
                workers_healthy = len([k async for k in redis_client.scan_iter(match=f"{WORKER_HEARTBEAT_KEY_PREFIX}*")])

                if queue_depth > SLO_QUEUE_DEPTH_CRITICAL:
                    _send_system_alert_once(
                        "queue_critical",
                        "critical",
                        "Queue depth too high",
                        f"Event queue backlog is {queue_depth} (> {SLO_QUEUE_DEPTH_CRITICAL})",
                    )
                elif queue_depth > SLO_QUEUE_DEPTH_WARN:
                    _send_system_alert_once(
                        "queue_warn",
                        "warning",
                        "Queue depth elevated",
                        f"Event queue backlog is {queue_depth} (> {SLO_QUEUE_DEPTH_WARN})",
                    )

                if dlq_depth > SLO_DLQ_DEPTH_WARN:
                    _send_system_alert_once(
                        "dlq_warn",
                        "critical",
                        "DLQ growing",
                        f"DLQ depth is {dlq_depth} (> {SLO_DLQ_DEPTH_WARN})",
                    )

                if workers_healthy < 1:
                    _send_system_alert_once(
                        "worker_down",
                        "critical",
                        "No healthy workers",
                        "No worker heartbeat detected. Processing may be stopped.",
                    )

            if recent_latencies_ms:
                ordered = sorted(recent_latencies_ms)
                idx = max(0, int(0.95 * (len(ordered) - 1)))
                p95 = ordered[idx]
                if p95 > SLO_API_P95_MS_WARN:
                    _send_system_alert_once(
                        "latency_warn",
                        "warning",
                        "High API latency",
                        f"P95 latency is {p95:.1f}ms (> {SLO_API_P95_MS_WARN}ms)",
                    )
        except Exception:
            ERROR_COUNT.labels(type="alerts_loop").inc()
        await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, relay_task, metrics_task, alerts_task
    started_at = time.perf_counter()
    await init_db()
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    relay_task = asyncio.create_task(_incident_relay())
    metrics_task = asyncio.create_task(_metrics_refresh_loop())
    alerts_task = asyncio.create_task(_alerts_loop())
    logger.info(
        "startup_complete latency_s=%.2f light_mode=%s simulations_enabled=%s memory_mb=%.1f",
        time.perf_counter() - started_at,
        LIGHT_MODE,
        SIMULATION_ENABLED,
        _memory_mb(),
    )
    try:
        yield
    finally:
        if relay_task:
            relay_task.cancel()
            try:
                await relay_task
            except Exception:
                pass
        if metrics_task:
            metrics_task.cancel()
            try:
                await metrics_task
            except Exception:
                pass
        if alerts_task:
            alerts_task.cancel()
            try:
                await alerts_task
            except Exception:
                pass
        if redis_client:
            await redis_client.aclose()
        logger.info("shutdown_complete")


app.router.lifespan_context = lifespan
