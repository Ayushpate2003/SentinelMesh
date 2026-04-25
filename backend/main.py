import asyncio
import base64
import contextvars
import datetime
import json
import logging
import os
import resource
import secrets
import subprocess
import time
import urllib.parse
import urllib.request
import uuid
from contextlib import asynccontextmanager
from collections import deque
from typing import Any, Dict, List

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
import jwt
import bcrypt
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
INTEGRATION_RATE_LIMIT_PER_MIN = int(os.getenv("INTEGRATION_RATE_LIMIT_PER_MIN", "120"))
JWT_SECRET = os.getenv("JWT_SECRET", "sentinelmesh-dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_SECONDS = int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "900"))
REFRESH_TOKEN_TTL_SECONDS = int(os.getenv("REFRESH_TOKEN_TTL_SECONDS", str(7 * 24 * 3600)))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
CSRF_COOKIE_NAME = "csrf_token"
ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "10"))
LOGIN_RATE_LIMIT_PER_MIN = int(os.getenv("LOGIN_RATE_LIMIT_PER_MIN", "20"))
REGISTER_RATE_LIMIT_PER_MIN = int(os.getenv("REGISTER_RATE_LIMIT_PER_MIN", "10"))
BOOTSTRAP_ADMIN_SECRET = os.getenv("BOOTSTRAP_ADMIN_SECRET", "")
BOOTSTRAP_ADMIN_MAX_ATTEMPTS_PER_HOUR = int(os.getenv("BOOTSTRAP_ADMIN_MAX_ATTEMPTS_PER_HOUR", "3"))
GOOGLE_OAUTH_CLIENT_ID = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "").strip()
GOOGLE_OAUTH_CLIENT_SECRET = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
GOOGLE_OAUTH_REDIRECT_URI = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8002/api/v1/auth/google/callback").strip()
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8002").rstrip("/")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001").rstrip("/")
test_starts_in_window: List[float] = []


def _validate_auth_config() -> None:
    redirect = GOOGLE_OAUTH_REDIRECT_URI
    if "8003" in redirect:
        raise RuntimeError("Invalid OAuth redirect port: 8003 is not supported. Use backend port 8002.")
    if BACKEND_URL not in redirect:
        raise RuntimeError(
            f"OAuth redirect URI must include BACKEND_URL. BACKEND_URL={BACKEND_URL}, GOOGLE_OAUTH_REDIRECT_URI={redirect}"
        )
    if not FRONTEND_URL.startswith("http://localhost:3001"):
        logger.warning("FRONTEND_URL is '%s'; expected localhost:3001 for local OAuth consistency", FRONTEND_URL)

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


def _decode_jwt_payload(token: str) -> Dict[str, Any]:
    try:
        payload_part = token.split(".")[1]
        padding = "=" * (-len(payload_part) % 4)
        decoded = base64.urlsafe_b64decode(payload_part + padding).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return {}


def _create_jwt_token(user_id: str, token_type: str, ttl_seconds: int) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "type": token_type,
        "iat": now,
        "exp": now + ttl_seconds,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def _create_auth_response(user: Dict[str, Any], request: Request) -> JSONResponse:
    user_id = user["id"]
    access_token = _create_jwt_token(user_id, "access", ACCESS_TOKEN_TTL_SECONDS)
    refresh_token = _create_jwt_token(user_id, "refresh", REFRESH_TOKEN_TTL_SECONDS)
    csrf_token = secrets.token_urlsafe(32)

    if redis_client:
        refresh_payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        await redis_client.setex(f"refresh:{refresh_payload['jti']}", REFRESH_TOKEN_TTL_SECONDS, user_id)

    response = JSONResponse({"status": "ok", "role": user["role"], "csrf_token": csrf_token})
    response.set_cookie(ACCESS_COOKIE_NAME, access_token, httponly=True, secure=COOKIE_SECURE, samesite="strict", max_age=ACCESS_TOKEN_TTL_SECONDS)
    response.set_cookie(REFRESH_COOKIE_NAME, refresh_token, httponly=True, secure=COOKIE_SECURE, samesite="strict", max_age=REFRESH_TOKEN_TTL_SECONDS)
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, secure=COOKIE_SECURE, samesite="strict", max_age=REFRESH_TOKEN_TTL_SECONDS)
    return response


def _extract_user_id_from_request(request: Request, required: bool = False) -> str:
    cookie_token = request.cookies.get(ACCESS_COOKIE_NAME)
    if cookie_token:
        try:
            payload = jwt.decode(cookie_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            if user_id:
                return str(user_id)
        except Exception:
            pass

    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        payload = _decode_jwt_payload(token)
        user_id = payload.get("sub") or payload.get("user_id") or payload.get("email")
        if user_id:
            return str(user_id)
    header_user = request.headers.get("x-user-id")
    if header_user:
        return header_user
    if required:
        raise HTTPException(status_code=401, detail="Missing or invalid user identity")
    return "anonymous"


def _csrf_tokens_match(request: Request) -> bool:
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get("x-csrf-token")
    return bool(cookie_token and header_token and secrets.compare_digest(cookie_token, header_token))


def _validate_email(email: str) -> bool:
    return bool(email and "@" in email and "." in email.split("@")[-1])


async def _rate_limit_auth(request: Request, key_prefix: str, max_attempts: int, window_seconds: int = 60):
    if not redis_client:
        return
    ip = request.client.host if request.client else "unknown"
    key = f"{key_prefix}:{ip}:{int(time.time() // window_seconds)}"
    count = await redis_client.incr(key)
    if count == 1:
        await redis_client.expire(key, window_seconds + 10)
    if count > max_attempts:
        raise HTTPException(status_code=429, detail="Too many attempts, try later")


async def _get_current_user(request: Request, required: bool = True) -> Dict[str, Any] | None:
    user_id = _extract_user_id_from_request(request, required=required)
    if not user_id:
        return None
    db = await get_db()
    try:
        async with db.execute(
            "SELECT id, email, role, telegram_chat_id, is_verified, created_at FROM users WHERE id = ?",
            (user_id,),
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None
    finally:
        await db.close()


def require_role(role: str):
    async def _enforce(request: Request):
        user = await _get_current_user(request, required=True)
        if not user or user.get("role") != role:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return _enforce


async def _log_audit_event(action: str, actor: str, user_id: str, details: str):
    db = await get_db()
    try:
        entry_id = f"aud_{uuid.uuid4().hex[:12]}"
        signature = supervisor.gatekeeper.sign_message(details).hex()
        await db.execute(
            "INSERT INTO audit_trail (entry_id, timestamp, action, actor, user_id, details, signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entry_id, time.time(), action, actor, user_id, details, signature),
        )
        await db.commit()
    finally:
        await db.close()


def _sanitize_text(value: Any, max_len: int = 500) -> str:
    text = str(value or "").replace("\x00", "").strip()
    return text[:max_len]


def _safe_json_loads(raw: Any, default: Any) -> Any:
    """Parse JSON from SQLite/Redis text; never raise (avoids 500 on legacy or corrupt rows)."""
    if raw is None:
        return default
    if isinstance(raw, (dict, list)):
        return raw
    text = str(raw).strip()
    if not text:
        return default
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning("invalid_json_payload preview=%s", text[:200])
        return default


def _metrics_path_label(request: Request) -> str:
    """Use route template for Prometheus labels to avoid dynamic path cardinality."""
    route = request.scope.get("route")
    path = getattr(route, "path", None) if route is not None else None
    if isinstance(path, str) and path.startswith("/"):
        return path
    return request.url.path or "/"


def _normalize_integration_type(value: str) -> str:
    normalized = (value or "").strip().lower()
    if normalized not in {"n8n", "api", "chrome", "mcp"}:
        raise HTTPException(status_code=400, detail="Invalid integration type")
    return normalized


async def _get_alert_preferences(user_id: str) -> Dict[str, Any]:
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT email_enabled, critical_only, login_alerts, automation_alerts
            FROM user_alert_preferences
            WHERE user_id = ?
            """,
            (user_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return {
                    "email_enabled": bool(row["email_enabled"]),
                    "critical_only": bool(row["critical_only"]),
                    "login_alerts": bool(row["login_alerts"]),
                    "automation_alerts": bool(row["automation_alerts"]),
                }
            return {
                "email_enabled": True,
                "critical_only": False,
                "login_alerts": True,
                "automation_alerts": True,
            }
    finally:
        await db.close()


async def _publish_user_event(user_id: str, event_type: str, payload: Dict[str, Any]):
    if not redis_client:
        return
    message = {"type": event_type, "ts": time.time(), "payload": payload}
    await redis_client.publish(f"sentinelmesh:user:{user_id}:events", json.dumps(message))


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


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error path=%s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.middleware("http")
async def request_metrics_middleware(request: Request, call_next):
    csrf_exempt_paths = {"/api/v1/auth/login", "/api/v1/auth/csrf", "/api/v1/auth/refresh"}
    has_auth_cookie = bool(request.cookies.get(ACCESS_COOKIE_NAME))
    if has_auth_cookie and request.method in {"POST", "PATCH", "PUT", "DELETE"} and request.url.path not in csrf_exempt_paths:
        if not _csrf_tokens_match(request):
            ERROR_COUNT.labels(type="csrf_failed").inc()
            return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})

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
        response = await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECONDS)
        status_code = response.status_code
    except asyncio.TimeoutError:
        ERROR_COUNT.labels(type="request_timeout").inc()
        return JSONResponse(status_code=504, content={"detail": "Request timed out"})
    except Exception:
        ERROR_COUNT.labels(type="unhandled_exception").inc()
        logger.exception("Unhandled request failure")
        raise
    elapsed = time.perf_counter() - started
    path_label = _metrics_path_label(request)
    REQUEST_COUNT.labels(method=request.method, path=path_label, status=str(status_code)).inc()
    REQUEST_LATENCY.labels(method=request.method, path=path_label).observe(elapsed)
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


@app.post("/api/v1/auth/register")
async def auth_register(request: Request, payload: Dict[str, str]):
    await _rate_limit_auth(request, "auth:register", REGISTER_RATE_LIMIT_PER_MIN)
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    telegram_chat_id = (payload.get("telegram_chat_id") or "").strip()
    if "role" in payload:
        raise HTTPException(status_code=400, detail="Role cannot be set during public registration")
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Invalid email")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    db = await get_db()
    try:
        async with db.execute("SELECT id FROM users WHERE email = ?", (email,)) as cursor:
            existing = await cursor.fetchone()
            if existing:
                raise HTTPException(status_code=409, detail="Email already exists")
        user_id = uuid.uuid4().hex
        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        admin_email = os.getenv("ADMIN_EMAIL", "ayushpatel7869595243@gmail.com").strip().lower()
        role = "ADMIN" if email == admin_email else "USER"
        await db.execute(
            "INSERT INTO users (id, email, password_hash, role, telegram_chat_id, is_verified, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
            (user_id, email, password_hash, role, telegram_chat_id, time.time()),
        )
        await db.commit()
    finally:
        await db.close()

    notification_service.send_email(
        subject="Welcome to SentinelMesh",
        html_content=(
            "<p>Hello,</p><p>Your account has been successfully created.</p>"
            f"<p>Role: {role}</p><p>You will receive alerts and security notifications.</p>"
            "<p>Regards,<br/>SentinelMesh</p>"
        ),
        to_email=email,
    )
    if telegram_chat_id:
        notification_service.send_telegram(
            f"✅ Account Created\n\nWelcome to SentinelMesh!\n\nRole: {role}\n\nYou will receive security alerts here.",
            chat_id=telegram_chat_id,
        )
    await _log_audit_event("REGISTER", email, user_id, f"User registered with role {role} and telegram_chat_id={bool(telegram_chat_id)}")
    return {"status": "registered", "user_id": user_id}


@app.post("/api/v1/auth/bootstrap-admin")
async def auth_bootstrap_admin(request: Request, payload: Dict[str, str]):
    await _rate_limit_auth(request, "auth:bootstrap-admin", BOOTSTRAP_ADMIN_MAX_ATTEMPTS_PER_HOUR, window_seconds=3600)
    if not BOOTSTRAP_ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="Bootstrap secret not configured")
    if payload.get("bootstrap_secret") != BOOTSTRAP_ADMIN_SECRET:
        await _log_audit_event("BOOTSTRAP_ADMIN_FAIL", "bootstrap", "system", "Invalid bootstrap secret")
        raise HTTPException(status_code=401, detail="Invalid secret")

    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    telegram_chat_id = (payload.get("telegram_chat_id") or "").strip()
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Invalid email")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    db = await get_db()
    try:
        async with db.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN'") as cursor:
            admin_count = (await cursor.fetchone())["c"]
            if admin_count > 0:
                await _log_audit_event("BOOTSTRAP_ADMIN_FAIL", "bootstrap", "system", "Admin already exists")
                raise HTTPException(status_code=403, detail="Admin already exists")
        async with db.execute("SELECT id FROM users WHERE email = ?", (email,)) as cursor:
            if await cursor.fetchone():
                raise HTTPException(status_code=409, detail="Email already exists")

        user_id = uuid.uuid4().hex
        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        await db.execute(
            "INSERT INTO users (id, email, password_hash, role, telegram_chat_id, is_verified, created_at) VALUES (?, ?, ?, 'ADMIN', ?, 1, ?)",
            (user_id, email, password_hash, telegram_chat_id, time.time()),
        )
        await db.commit()
    finally:
        await db.close()

    notification_service.send_email(
        subject="Welcome to SentinelMesh",
        html_content=(
            "<p>Hello,</p><p>Your account has been successfully created.</p>"
            "<p>Role: ADMIN</p><p>You will receive alerts and security notifications.</p>"
            "<p>Regards,<br/>SentinelMesh</p>"
        ),
        to_email=email,
    )
    if telegram_chat_id:
        notification_service.send_telegram(
            "✅ Account Created\n\nWelcome to SentinelMesh!\n\nRole: ADMIN\n\nYou will receive security alerts here.",
            chat_id=telegram_chat_id,
        )
    await _log_audit_event("BOOTSTRAP_ADMIN_SUCCESS", email, user_id, "Initial admin bootstrap completed")
    return {"status": "bootstrap_complete", "user_id": user_id}


@app.post("/api/v1/auth/login")
async def auth_login(request: Request, payload: Dict[str, str]):
    await _rate_limit_auth(request, "auth:login", LOGIN_RATE_LIMIT_PER_MIN)
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password required")

    db = await get_db()
    user = None
    try:
        async with db.execute(
            "SELECT id, email, password_hash, role, telegram_chat_id, auth_provider FROM users WHERE email = ?",
            (email,),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                await _log_audit_event("LOGIN_FAIL", email or "unknown", "anonymous", "Unknown email")
                raise HTTPException(status_code=401, detail="Invalid credentials")
            
            user = dict(row)
            if user.get("auth_provider") == "google":
                raise HTTPException(status_code=400, detail="Use Google login")
            
            if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
                await _log_audit_event("LOGIN_FAIL", email, user["id"], "Invalid password")
                raise HTTPException(status_code=401, detail="Invalid credentials")
    finally:
        await db.close()

    user_id = user["id"]
    prefs = await _get_alert_preferences(user_id)

    login_time = datetime.datetime.utcnow().isoformat() + "Z"
    login_ip = request.client.host if request.client else "unknown"
    if prefs["email_enabled"] and prefs["login_alerts"]:
        notification_service.send_email(
            subject="New Login Detected",
            html_content=(
                "<p>Hello,</p>"
                "<p>A login was detected on your account.</p>"
                f"<p>Time: {login_time}<br/>IP: {login_ip}</p>"
                "<p>If this wasn't you, take action immediately.</p><p>SentinelMesh</p>"
            ),
            to_email=user["email"],
        )
    if user.get("telegram_chat_id"):
        notification_service.send_telegram(
            f"🔐 Login Detected\n\nTime: {login_time}\nIP: {login_ip}\n\nIf this wasn’t you, secure your account.",
            chat_id=user["telegram_chat_id"],
        )
    await _log_audit_event("LOGIN_SUCCESS", user["email"], user_id, f"Successful login from ip={login_ip}")
    await _publish_user_event(user_id, "login", {"provider": "password", "ip": login_ip})

    return await _create_auth_response(user, request)


@app.get("/api/v1/auth/google/start")
async def auth_google_start(next_path: str = "/dashboard/user"):
    if not GOOGLE_OAUTH_CLIENT_ID or not GOOGLE_OAUTH_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")
    state = secrets.token_urlsafe(32)
    query = urllib.parse.urlencode(
        {
            "client_id": GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": GOOGLE_OAUTH_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    response = RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{query}")
    response.set_cookie("google_oauth_state", state, httponly=True, secure=COOKIE_SECURE, samesite="lax", max_age=600)
    response.set_cookie("google_oauth_next", next_path if next_path.startswith("/") else "/dashboard/user", httponly=True, secure=COOKIE_SECURE, samesite="lax", max_age=600)
    return response


@app.get("/api/v1/auth/google/callback")
async def auth_google_callback(request: Request, code: str = "", state: str = ""):
    if not code:
        raise HTTPException(status_code=400, detail="Missing Google authorization code")
    cookie_state = request.cookies.get("google_oauth_state", "")
    next_path = request.cookies.get("google_oauth_next", "/dashboard/user")
    if not cookie_state or not state or not secrets.compare_digest(cookie_state, state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    if not GOOGLE_OAUTH_CLIENT_ID or not GOOGLE_OAUTH_CLIENT_SECRET:
        raise HTTPException(status_code=503, detail="Google OAuth not configured")

    token_req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode(
            {
                "code": code,
                "client_id": GOOGLE_OAUTH_CLIENT_ID,
                "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
                "redirect_uri": GOOGLE_OAUTH_REDIRECT_URI,
                "grant_type": "authorization_code",
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(token_req, timeout=10) as resp:
            token_data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Google token exchange failed") from exc

    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=401, detail="Google did not return id_token")

    try:
        tokeninfo_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(id_token)}"
        with urllib.request.urlopen(tokeninfo_url, timeout=10) as resp:
            profile = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Google token validation failed") from exc

    if profile.get("aud") != GOOGLE_OAUTH_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Google token audience mismatch")
    
    email_verified = profile.get("email_verified")
    if str(email_verified).lower() != "true":
        raise HTTPException(status_code=401, detail="Google email not verified")
        
    sub = profile.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Google profile missing sub")

    email = (profile.get("email") or "").strip().lower()
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Google account email missing")

    admin_email = os.getenv("ADMIN_EMAIL", "ayushpatel7869595243@gmail.com").strip().lower()

    db = await get_db()
    try:
        async with db.execute(
            "SELECT id, email, role, telegram_chat_id, auth_provider, google_id FROM users WHERE email = ?",
            (email,),
        ) as cursor:
            row = await cursor.fetchone()

        if row:
            user = dict(row)
            if user.get("auth_provider") == "local":
                # Link local account to Google
                await db.execute(
                    "UPDATE users SET auth_provider = 'google+local', google_id = ? WHERE id = ?",
                    (sub, user["id"]),
                )
                await db.commit()
                user["auth_provider"] = "google+local"
                user["google_id"] = sub
                await _log_audit_event("ACCOUNT_LINKED", email, user["id"], "Google account linked to local account")
            else:
                # Already linked or Google-only. Verify 'sub' matches.
                if user.get("google_id") != sub:
                    await _log_audit_event("ACCOUNT_TAKEOVER_ATTEMPT", email, user["id"], "Mismatched Google sub")
                    raise HTTPException(status_code=400, detail="Account conflict: Google ID mismatch")
        else:
            user_id = uuid.uuid4().hex
            role = "ADMIN" if email == admin_email else "USER"
            await db.execute(
                "INSERT INTO users (id, email, password_hash, role, telegram_chat_id, is_verified, created_at, auth_provider, google_id) VALUES (?, ?, ?, ?, '', 1, ?, 'google', ?)",
                (user_id, email, "GOOGLE_OAUTH", role, time.time(), sub),
            )
            await db.commit()
            user = {"id": user_id, "email": email, "role": role, "telegram_chat_id": "", "auth_provider": "google", "google_id": sub}
            await _log_audit_event("REGISTER_GOOGLE", email, user_id, f"User registered via Google OAuth with role {role}")
    finally:
        await db.close()

    login_time = datetime.datetime.utcnow().isoformat() + "Z"
    login_ip = request.client.host if request.client else "unknown"
    prefs = await _get_alert_preferences(user["id"])

    if prefs["email_enabled"] and prefs["login_alerts"]:
        notification_service.send_email(
            subject="New Login Detected (Google OAuth)",
            html_content=(
                "<p>Hello,</p>"
                "<p>A login via Google OAuth was detected on your account.</p>"
                f"<p>Time: {login_time}<br/>IP: {login_ip}</p>"
                "<p>If this wasn't you, take action immediately.</p><p>SentinelMesh</p>"
            ),
            to_email=user["email"],
        )
    if user.get("telegram_chat_id"):
        notification_service.send_telegram(
            f"🔐 Login Detected (Google)\n\nTime: {login_time}\nIP: {login_ip}\n\nIf this wasn’t you, secure your account.",
            chat_id=user["telegram_chat_id"],
        )

    await _log_audit_event("LOGIN_GOOGLE", email, user["id"], f"Successful Google login from ip={login_ip}")
    await _publish_user_event(user["id"], "login", {"provider": "google", "ip": login_ip})

    auth_response = await _create_auth_response(user, request)
    redirect_path = "/dashboard/user"
    if user.get("role") == "ADMIN":
        redirect_path = "/"
    elif next_path.startswith("/"):
        redirect_path = next_path
    auth_response.status_code = 302
    auth_response.headers["Location"] = f"{FRONTEND_URL}{redirect_path}"

    # Re-set auth cookies with samesite=lax so they survive the cross-site
    # redirect from accounts.google.com back to the frontend (strict cookies
    # are blocked by browsers on cross-site top-level navigations).
    # Rebuild the three auth cookies with lax policy
    for cookie_name, cookie_attr in [
        (ACCESS_COOKIE_NAME, {"max_age": ACCESS_TOKEN_TTL_SECONDS, "httponly": True}),
        (REFRESH_COOKIE_NAME, {"max_age": REFRESH_TOKEN_TTL_SECONDS, "httponly": True}),
        (CSRF_COOKIE_NAME, {"max_age": REFRESH_TOKEN_TTL_SECONDS, "httponly": False}),
    ]:
        # Extract the value from the already-set cookie in the response
        cookie_val = None
        for header_name, header_value in auth_response.raw_headers:
            if header_name == b"set-cookie" and header_value.startswith(f"{cookie_name}=".encode()):
                cookie_val = header_value.split(b"=", 1)[1].split(b";")[0].decode()
                break
        if cookie_val:
            auth_response.set_cookie(
                cookie_name,
                cookie_val,
                httponly=cookie_attr["httponly"],
                secure=COOKIE_SECURE,
                samesite="lax",
                max_age=cookie_attr["max_age"],
            )

    auth_response.delete_cookie("google_oauth_state")
    auth_response.delete_cookie("google_oauth_next")
    return auth_response


@app.post("/api/v1/auth/refresh")
async def auth_refresh(request: Request):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    try:
        payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        if redis_client:
            token_key = f"refresh:{payload.get('jti')}"
            active = await redis_client.get(token_key)
            if not active:
                raise HTTPException(status_code=401, detail="Refresh token expired")
        user_id = payload.get("sub")
        access_token = _create_jwt_token(user_id, "access", ACCESS_TOKEN_TTL_SECONDS)
        response = JSONResponse({"status": "ok", "expires_in": ACCESS_TOKEN_TTL_SECONDS})
        response.set_cookie(ACCESS_COOKIE_NAME, access_token, httponly=True, secure=COOKIE_SECURE, samesite="strict", max_age=ACCESS_TOKEN_TTL_SECONDS)
        return response
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@app.post("/api/v1/auth/logout")
async def auth_logout(request: Request):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_token and redis_client:
        try:
            payload = jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            await redis_client.delete(f"refresh:{payload.get('jti')}")
        except Exception:
            pass
    response = JSONResponse({"status": "logged_out"})
    response.delete_cookie(ACCESS_COOKIE_NAME)
    response.delete_cookie(REFRESH_COOKIE_NAME)
    response.delete_cookie(CSRF_COOKIE_NAME)
    return response


@app.get("/api/v1/auth/csrf")
async def auth_csrf():
    csrf_token = secrets.token_urlsafe(32)
    response = JSONResponse({"csrf_token": csrf_token})
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, secure=COOKIE_SECURE, samesite="strict", max_age=REFRESH_TOKEN_TTL_SECONDS)
    return response


@app.get("/api/v1/auth/me")
async def auth_me(request: Request):
    user = await _get_current_user(request, required=True)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


@app.post("/api/v1/auth/link-telegram")
async def auth_link_telegram(request: Request, payload: Dict[str, str]):
    user = await _get_current_user(request, required=True)
    chat_id = (payload.get("telegram_chat_id") or "").strip()
    if not chat_id:
        raise HTTPException(status_code=400, detail="telegram_chat_id is required")
    db = await get_db()
    try:
        await db.execute("UPDATE users SET telegram_chat_id = ? WHERE id = ?", (chat_id, user["id"]))
        await db.commit()
    finally:
        await db.close()
    return {"status": "linked"}


@app.post("/api/v1/user/integrations")
async def create_user_integration(request: Request, payload: Dict[str, Any]):
    user = await _get_current_user(request, required=True)
    name = _sanitize_text(payload.get("name"), max_len=120)
    endpoint = _sanitize_text(payload.get("endpoint"), max_len=500)
    integration_type = _normalize_integration_type(_sanitize_text(payload.get("type"), max_len=30))
    enabled = bool(payload.get("enabled", True))
    if not name:
        raise HTTPException(status_code=400, detail="Integration name is required")
    if not endpoint.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Integration endpoint must be a valid http(s) URL")

    integration_id = uuid.uuid4().hex
    created_at = time.time()
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO user_integrations (id, user_id, name, type, endpoint, enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (integration_id, user["id"], name, integration_type, endpoint, 1 if enabled else 0, created_at),
        )
        await db.commit()
    finally:
        await db.close()

    payload_out = {
        "id": integration_id,
        "user_id": user["id"],
        "name": name,
        "type": integration_type,
        "endpoint": endpoint,
        "enabled": enabled,
        "created_at": created_at,
    }
    await _publish_user_event(user["id"], "integration_created", payload_out)
    return payload_out


@app.get("/api/v1/user/integrations")
async def get_user_integrations(request: Request):
    user = await _get_current_user(request, required=True)
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT id, user_id, name, type, endpoint, enabled, created_at
            FROM user_integrations
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user["id"],),
        ) as cursor:
            rows = await cursor.fetchall()
            return {
                "integrations": [
                    {
                        "id": row["id"],
                        "user_id": row["user_id"],
                        "name": row["name"],
                        "type": row["type"],
                        "endpoint": row["endpoint"],
                        "enabled": bool(row["enabled"]),
                        "created_at": row["created_at"],
                    }
                    for row in rows
                ]
            }
    finally:
        await db.close()


@app.delete("/api/v1/user/integrations/{integration_id}")
async def delete_user_integration(integration_id: str, request: Request):
    user = await _get_current_user(request, required=True)
    db = await get_db()
    try:
        async with db.execute(
            "SELECT id FROM user_integrations WHERE id = ? AND user_id = ?",
            (integration_id, user["id"]),
        ) as cursor:
            if not await cursor.fetchone():
                raise HTTPException(status_code=404, detail="Integration not found")
        await db.execute("DELETE FROM user_integrations WHERE id = ? AND user_id = ?", (integration_id, user["id"]))
        await db.commit()
    finally:
        await db.close()
    await _publish_user_event(user["id"], "integration_deleted", {"integration_id": integration_id})
    return {"status": "deleted"}


@app.get("/api/v1/user/alert-preferences")
async def get_user_alert_preferences(request: Request):
    user = await _get_current_user(request, required=True)
    prefs = await _get_alert_preferences(user["id"])
    return {"user_id": user["id"], **prefs}


@app.post("/api/v1/user/alert-preferences")
async def set_user_alert_preferences(request: Request, payload: Dict[str, Any]):
    user = await _get_current_user(request, required=True)
    email_enabled = bool(payload.get("email_enabled", True))
    critical_only = bool(payload.get("critical_only", False))
    login_alerts = bool(payload.get("login_alerts", True))
    automation_alerts = bool(payload.get("automation_alerts", True))
    updated_at = time.time()
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT INTO user_alert_preferences (user_id, email_enabled, critical_only, login_alerts, automation_alerts, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                email_enabled = excluded.email_enabled,
                critical_only = excluded.critical_only,
                login_alerts = excluded.login_alerts,
                automation_alerts = excluded.automation_alerts,
                updated_at = excluded.updated_at
            """,
            (user["id"], 1 if email_enabled else 0, 1 if critical_only else 0, 1 if login_alerts else 0, 1 if automation_alerts else 0, updated_at),
        )
        await db.commit()
    finally:
        await db.close()
    prefs = {
        "user_id": user["id"],
        "email_enabled": email_enabled,
        "critical_only": critical_only,
        "login_alerts": login_alerts,
        "automation_alerts": automation_alerts,
    }
    await _publish_user_event(user["id"], "alert_preferences_updated", prefs)
    return prefs


@app.post("/api/v1/ai/analyze")
async def ai_analyze(request: Request, payload: Dict[str, Any]):
    user = await _get_current_user(request, required=True)
    query = _sanitize_text(payload.get("query"), max_len=2000)
    context = payload.get("context", {})
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    query_lower = query.lower()
    risk_score = 20
    if any(word in query_lower for word in ["token", "admin", "oauth", "scope", "secret", "key"]):
        risk_score += 30
    if any(word in query_lower for word in ["*", "full access", "delete", "bypass"]):
        risk_score += 30
    risk_score = min(100, risk_score)
    recommendation = "Proceed with caution and keep least-privilege scopes."
    if risk_score >= 70:
        recommendation = "Reduce permissions and require explicit approval before execution."
    elif risk_score >= 40:
        recommendation = "Review scopes and destination endpoint before running."
    response_text = (
        "Sentinel AI assessment: "
        + ("high risk detected. " if risk_score >= 70 else "moderate/low risk. ")
        + recommendation
    )
    result = {
        "response": response_text,
        "risk_score": risk_score,
        "recommendation": recommendation,
        "context_echo": context,
    }
    await _publish_user_event(user["id"], "ai_response", result)
    return result


@app.get("/api/v1/admin/users")
async def admin_users(admin_user: Dict[str, Any] = Depends(require_role("ADMIN"))):
    db = await get_db()
    try:
        async with db.execute(
            "SELECT id, email, role, telegram_chat_id, is_verified, created_at FROM users ORDER BY created_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return {"users": [dict(r) for r in rows]}
    finally:
        await db.close()


@app.post("/api/v1/admin/users/{user_id}/role")
async def admin_update_user_role(
    user_id: str,
    payload: Dict[str, str],
    admin_user: Dict[str, Any] = Depends(require_role("ADMIN")),
):
    new_role = (payload.get("role") or "").upper()
    if new_role not in {"ADMIN", "USER"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    if admin_user["id"] == user_id and new_role != "ADMIN":
        raise HTTPException(status_code=400, detail="Cannot downgrade your own admin role")
    db = await get_db()
    try:
        async with db.execute("SELECT id FROM users WHERE id = ?", (user_id,)) as cursor:
            if not await cursor.fetchone():
                raise HTTPException(status_code=404, detail="User not found")
        await db.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
        await db.commit()
    finally:
        await db.close()
    await _log_audit_event(
        "ROLE_CHANGE",
        admin_user["id"],
        user_id,
        json.dumps(
            {
                "action": "ROLE_CHANGE",
                "performed_by": admin_user["id"],
                "target_user": user_id,
                "new_role": new_role,
            }
        ),
    )
    return {"status": "updated", "role": new_role}

@app.post("/api/v1/events")
async def ingest_event(request: Request, event_data: Dict[str, Any]):
    if not redis_client:
        raise HTTPException(status_code=503, detail="Queue backend unavailable")

    queue_depth = await redis_client.llen(QUEUE_KEY)
    if queue_depth >= QUEUE_MAX_SIZE:
        ERROR_COUNT.labels(type="queue_backpressure").inc()
        raise HTTPException(status_code=503, detail="System under load, try again")

    auth_user_id = _extract_user_id_from_request(request, required=False)
    payload_user_id = _sanitize_text(event_data.get("user_id"), max_len=120)
    metadata_user_id = _sanitize_text((event_data.get("metadata") or {}).get("user_id"), max_len=120)
    user_id = auth_user_id if auth_user_id != "anonymous" else (payload_user_id or metadata_user_id or "anonymous")

    integration_id = _sanitize_text(event_data.get("integration_id"), max_len=120)
    integration = None
    if integration_id:
        if user_id == "anonymous":
            raise HTTPException(status_code=401, detail="Authenticated user required for integration events")
        db = await get_db()
        try:
            async with db.execute(
                """
                SELECT id, user_id, name, type, endpoint, enabled
                FROM user_integrations
                WHERE id = ? AND user_id = ?
                """,
                (integration_id, user_id),
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    raise HTTPException(status_code=403, detail="Integration does not belong to current user")
                integration = dict(row)
                if not integration["enabled"]:
                    raise HTTPException(status_code=403, detail="Integration is disabled")
        finally:
            await db.close()
        rate_key = f"ratelimit:integration:{integration_id}:{int(time.time() // 60)}"
        count = await redis_client.incr(rate_key)
        if count == 1:
            await redis_client.expire(rate_key, 70)
        if count > INTEGRATION_RATE_LIMIT_PER_MIN:
            raise HTTPException(status_code=429, detail="Integration rate limit exceeded")

    event_action = _sanitize_text(event_data.get("action") or event_data.get("event_type") or "automation_event", max_len=120)
    source_type = _sanitize_text(event_data.get("source") or ((integration or {}).get("type")) or "api", max_len=60)
    source_name = _sanitize_text(event_data.get("source_name") or ((integration or {}).get("name")) or source_type, max_len=120)
    raw_metadata = event_data.get("metadata")
    if not isinstance(raw_metadata, dict):
        raw_metadata = {}
    sanitized_metadata = {
        _sanitize_text(k, max_len=80): _sanitize_text(v, max_len=2000)
        for k, v in list(raw_metadata.items())[:40]
    }
    risk_terms = {"admin", "token", "secret", "delete", "oauth", "scope", "credential", "privilege"}
    combined_text = " ".join([event_action, json.dumps(sanitized_metadata)]).lower()
    risk_score = 85 if any(term in combined_text for term in risk_terms) else 20
    ai_decision = "BLOCK" if risk_score >= 70 else "ALLOW"
    if ai_decision == "BLOCK":
        ERROR_COUNT.labels(type="automation_blocked").inc()
        if user_id != "anonymous":
            prefs = await _get_alert_preferences(user_id)
            if prefs["email_enabled"] and prefs["automation_alerts"]:
                db = await get_db()
                try:
                    async with db.execute("SELECT email FROM users WHERE id = ?", (user_id,)) as cursor:
                        row = await cursor.fetchone()
                        if row:
                            notification_service.send_email(
                                subject="Automation blocked by SentinelMesh",
                                html_content=(
                                    "<p>Your automation execution was blocked.</p>"
                                    f"<p>Integration: {(integration or {}).get('name', 'unknown')}</p>"
                                    f"<p>Action: {event_action}</p>"
                                    f"<p>Risk score: {risk_score}</p>"
                                ),
                                to_email=row["email"],
                            )
                finally:
                    await db.close()
            await _publish_user_event(
                user_id,
                "automation_blocked",
                {"integration_id": integration_id, "action": event_action, "risk_score": risk_score, "decision": ai_decision},
            )
        raise HTTPException(status_code=403, detail="Automation blocked by SentinelMesh policy engine")

    event_id = event_data.get("event_id") or f"evt_{uuid.uuid4().hex[:16]}"
    timestamp = float(event_data.get("timestamp") or time.time())
    db = await get_db()
    try:
        await db.execute(
            """
            INSERT OR REPLACE INTO events (event_id, timestamp, source, event_type, user_id, integration_id, ai_decision, metadata, raw_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (event_id, timestamp, source_name, event_action, user_id, integration_id or None, ai_decision, json.dumps(sanitized_metadata), json.dumps(event_data)),
        )
        await db.commit()
    finally:
        await db.close()

    outbound_event = {
        "event_id": event_id,
        "timestamp": timestamp,
        "source": source_name,
        "event_type": event_action,
        "user_id": user_id,
        "metadata": {**sanitized_metadata, "risk_score": risk_score, "outcome": ai_decision},
    }
    payload = {
        "event": outbound_event,
        "user_id": user_id,
        "integration_id": integration_id,
        "ai_decision": ai_decision,
        "retry_count": 0,
        "enqueued_at": time.time(),
        "request_id": request_id_ctx.get() or "",
    }
    await redis_client.lpush(QUEUE_KEY, json.dumps(payload))
    EVENTS_INGESTED.inc()
    QUEUE_DEPTH.set(queue_depth + 1)
    QUEUE_DEPTH_COMPAT.set(queue_depth + 1)
    if user_id != "anonymous":
        await _publish_user_event(
            user_id,
            "automation_status",
            {
                "integration_id": integration_id,
                "action": event_action,
                "decision": ai_decision,
                "status": "queued",
                "source": source_name,
            },
        )
    return {"status": "queued", "queue_depth": queue_depth + 1, "decision": ai_decision, "event_id": event_id}

@app.get("/api/v1/incidents")
async def get_incidents():
    db = await get_db()
    async with db.execute("SELECT * FROM incidents ORDER BY created_at DESC") as cursor:
        rows = await cursor.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            # Parse JSON fields (legacy rows may contain non-JSON text)
            if d.get("signals") is not None and d.get("signals") != "":
                d["signals"] = _safe_json_loads(d["signals"], [])
            if d.get("affected_components") is not None and d.get("affected_components") != "":
                d["affected_components"] = _safe_json_loads(d["affected_components"], [])
            if d.get("timeline") is not None and d.get("timeline") != "":
                d["timeline"] = _safe_json_loads(d["timeline"], [])
            result.append(d)
    await db.close()
    return result

@app.post("/api/v1/approve/{incident_id}")
async def approve_incident(incident_id: str, request: Request, actor: str = "Admin"):
    user_id = _extract_user_id_from_request(request)
    db = await get_db()
    # 1. Update incident status
    await db.execute("UPDATE incidents SET status = 'approved' WHERE incident_id = ?", (incident_id,))
    
    # 2. Sign the action for audit trail
    action_text = f"Approved incident {incident_id} by {actor}"
    signature = supervisor.gatekeeper.sign_message(action_text).hex()
    
    # 3. Store in audit trail
    entry_id = f"aud_{int(time.time())}"
    await db.execute(
        "INSERT INTO audit_trail (entry_id, timestamp, action, actor, user_id, details, signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (entry_id, time.time(), "APPROVE", actor, user_id, action_text, signature)
    )
    
    await db.commit()
    await db.close()
    return {"status": "approved", "signature": signature}

@app.post("/api/v1/block/{incident_id}")
async def block_incident(incident_id: str, request: Request, actor: str = "Admin"):
    user_id = _extract_user_id_from_request(request)
    db = await get_db()
    # 1. Update incident status
    await db.execute("UPDATE incidents SET status = 'blocked' WHERE incident_id = ?", (incident_id,))
    
    # 2. Sign the action for audit trail
    action_text = f"Blocked incident {incident_id} by {actor}"
    signature = supervisor.gatekeeper.sign_message(action_text).hex()
    
    # 3. Store in audit trail
    entry_id = f"aud_{int(time.time())}"
    await db.execute(
        "INSERT INTO audit_trail (entry_id, timestamp, action, actor, user_id, details, signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (entry_id, time.time(), "BLOCK", actor, user_id, action_text, signature)
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
async def run_test(test_type: str, request: Request, actor: str = "Admin"):
    user_id = _extract_user_id_from_request(request)
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
        "INSERT INTO audit_trail (entry_id, timestamp, action, actor, user_id, details, signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (entry_id, time.time(), "RUN_TEST", actor, user_id, action_text, signature)
    )
    await db.commit()
    await db.close()

    return {"status": "started", "test_type": test_type}

@app.post("/api/v1/stop-tests")
async def stop_tests(request: Request, actor: str = "Admin"):
    user_id = _extract_user_id_from_request(request)
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
            "INSERT INTO audit_trail (entry_id, timestamp, action, actor, user_id, details, signature) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (entry_id, time.time(), "STOP_TESTS", actor, user_id, action_text, signature)
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


@app.get("/api/v1/user/timeline")
async def user_timeline(request: Request, page: int = 1, limit: int = 20):
    user_id = _extract_user_id_from_request(request, required=True)
    db = await get_db()
    timeline: List[Dict[str, Any]] = []
    page = max(1, page)
    limit = max(1, min(limit, 100))
    offset = (page - 1) * limit
    try:
        async with db.execute(
            """
            SELECT e.event_id, e.timestamp, e.source, e.event_type, e.metadata, e.ai_decision, ui.name AS integration_name
            FROM events e
            LEFT JOIN user_integrations ui ON ui.id = e.integration_id
            WHERE user_id = ?
            ORDER BY e.timestamp DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ) as cursor:
            for row in await cursor.fetchall():
                metadata = _safe_json_loads(row["metadata"] or "{}", {})
                if not isinstance(metadata, dict):
                    metadata = {}
                integration_name = row["integration_name"] or row["source"]
                ai_decision = row["ai_decision"] or metadata.get("outcome", "ALLOW")
                timeline.append(
                    {
                        "timestamp": row["timestamp"],
                        "kind": "event",
                        "action": f"You triggered {row['event_type']} via {integration_name}",
                        "system_response": metadata.get(
                            "system_response",
                            f"AI decision: {ai_decision}. Event evaluated by SentinelMesh policy engine.",
                        ),
                        "final_outcome": ai_decision,
                        "reference_id": row["event_id"],
                    }
                )

        async with db.execute(
            """
            SELECT incident_id, created_at, summary, severity, status, outcome
            FROM incidents
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ) as cursor:
            for row in await cursor.fetchall():
                timeline.append(
                    {
                        "timestamp": row["created_at"],
                        "kind": "incident",
                        "action": row["summary"],
                        "system_response": f"Risk scored as {str(row['severity']).upper()} by Supervisor/Gatekeeper",
                        "final_outcome": row["outcome"] or ("BLOCK" if row["status"] == "blocked" else "QUEUE"),
                        "reference_id": row["incident_id"],
                    }
                )

        async with db.execute(
            """
            SELECT entry_id, timestamp, action, details
            FROM audit_trail
            WHERE user_id = ?
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ) as cursor:
            for row in await cursor.fetchall():
                timeline.append(
                    {
                        "timestamp": row["timestamp"],
                        "kind": "audit",
                        "action": row["action"],
                        "system_response": row["details"],
                        "final_outcome": "ALLOW" if row["action"] == "APPROVE" else "BLOCK",
                        "reference_id": row["entry_id"],
                    }
                )

        timeline.sort(key=lambda x: x["timestamp"] or 0, reverse=True)
        total = len(timeline)
        pages = max(1, (total + limit - 1) // limit)
        return {"user_id": user_id, "items": timeline[:limit], "total": total, "page": page, "pages": pages}
    finally:
        await db.close()


@app.get("/api/v1/user/alerts")
async def user_alerts(request: Request, severity: str | None = None, page: int = 1, limit: int = 20):
    user_id = _extract_user_id_from_request(request, required=True)
    page = max(1, page)
    limit = max(1, min(limit, 100))
    offset = (page - 1) * limit
    cache_key = f"user:{user_id}:alerts:{severity or 'all'}:{page}:{limit}"
    if redis_client:
        cached = await redis_client.get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except (json.JSONDecodeError, TypeError):
                logger.warning("user_alerts invalid redis cache key=%s", cache_key)
    db = await get_db()
    try:
        query = """
            SELECT incident_id, created_at, summary, severity, status
            FROM incidents
            WHERE user_id = ?
        """
        params: List[Any] = [user_id]
        if severity:
            query += " AND LOWER(severity) = LOWER(?)"
            params.append(severity)
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        alerts = []
        async with db.execute(query, tuple(params)) as cursor:
            for row in await cursor.fetchall():
                sev = str(row["severity"]).lower()
                alerts.append(
                    {
                        "id": row["incident_id"],
                        "severity": sev,
                        "severity_emoji": "🔴" if sev == "critical" else "🟠" if sev == "high" else "🟡",
                        "status": "firing" if row["status"] in ("active", "blocked") else "resolved",
                        "summary": row["summary"],
                        "timestamp": row["created_at"],
                    }
                )
        total_query = "SELECT COUNT(*) AS c FROM incidents WHERE user_id = ?"
        total_params: List[Any] = [user_id]
        if severity:
            total_query += " AND LOWER(severity) = LOWER(?)"
            total_params.append(severity)
        async with db.execute(total_query, tuple(total_params)) as cursor:
            total = (await cursor.fetchone())["c"]
        payload = {"user_id": user_id, "alerts": alerts, "total": total, "page": page, "pages": max(1, (total + limit - 1) // limit)}
        if redis_client:
            await redis_client.setex(cache_key, 30, json.dumps(payload))
        return payload
    finally:
        await db.close()


@app.get("/api/v1/user/alerts/{incident_id}")
async def user_alert_details(incident_id: str, request: Request):
    user_id = _extract_user_id_from_request(request, required=True)
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT incident_id, summary, severity, status, created_at, signals, timeline
            FROM incidents
            WHERE incident_id = ? AND user_id = ?
            """,
            (incident_id, user_id),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Alert not found")
            signals = _safe_json_loads(row["signals"] or "[]", [])
            if not isinstance(signals, list):
                signals = []
            reasons = []
            for s in signals:
                if not isinstance(s, dict):
                    continue
                try:
                    reasons.append(
                        {
                            "reason": s.get("description", "Signal"),
                            "risk_score": int(float(s.get("risk_score", 0)) * 100),
                        }
                    )
                except (TypeError, ValueError):
                    continue
            timeline_parsed = _safe_json_loads(row["timeline"] or "[]", [])
            if not isinstance(timeline_parsed, list):
                timeline_parsed = []
            return {
                "id": row["incident_id"],
                "summary": row["summary"],
                "severity": row["severity"],
                "status": row["status"],
                "timestamp": row["created_at"],
                "risk_score": max([r["risk_score"] for r in reasons], default=0),
                "reasons": reasons,
                "evidence": signals,
                "timeline": timeline_parsed,
                "recommended_action": "Review source workflow and reduce granted scopes before retry.",
            }
    finally:
        await db.close()


@app.get("/api/v1/user/risk")
async def user_risk(request: Request):
    user_id = _extract_user_id_from_request(request, required=True)
    cache_key = f"user:{user_id}:risk"
    if redis_client:
        cached = await redis_client.get(cache_key)
        if cached:
            try:
                return json.loads(cached)
            except (json.JSONDecodeError, TypeError):
                logger.warning("user_risk invalid redis cache key=%s", cache_key)
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT severity, created_at
            FROM incidents
            WHERE user_id = ?
              AND created_at >= ?
            """,
            (user_id, time.time() - 86400),
        ) as cursor:
            rows = await cursor.fetchall()
        weights = {"low": 5, "medium": 12, "high": 25, "critical": 40}
        raw_score = sum(weights.get(str(r["severity"]).lower(), 0) for r in rows)
        anomalies = len(rows)
        score = min(100, raw_score)
        payload = {
            "user_id": user_id,
            "score": score,
            "factors": {
                "alerts_24h": anomalies,
                "recent_anomalies": anomalies,
            },
            "band": "high" if score >= 70 else "medium" if score >= 40 else "low",
        }
        if redis_client:
            await redis_client.setex(cache_key, 60, json.dumps(payload))
        return payload
    finally:
        await db.close()


@app.get("/api/v1/user/automations")
async def user_automations(request: Request, page: int = 1, limit: int = 20):
    user_id = _extract_user_id_from_request(request, required=True)
    page = max(1, page)
    limit = max(1, min(limit, 100))
    offset = (page - 1) * limit
    db = await get_db()
    try:
        async with db.execute(
            """
            SELECT e.event_id, e.timestamp, e.source, e.event_type, e.metadata, e.ai_decision, e.integration_id, ui.name AS integration_name
            FROM events e
            LEFT JOIN user_integrations ui ON ui.id = e.integration_id
            WHERE e.user_id = ?
            ORDER BY e.timestamp DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ) as cursor:
            rows = await cursor.fetchall()

        items = []
        integrations = set()
        for row in rows:
            metadata = _safe_json_loads(row["metadata"] or "{}", {})
            if not isinstance(metadata, dict):
                metadata = {}
            source = row["integration_name"] or row["source"] or "unknown"
            integrations.add(source)
            outcome = row["ai_decision"] or metadata.get("outcome", "ALLOW")
            items.append(
                {
                    "id": row["event_id"],
                    "name": row["event_type"],
                    "source": source,
                    "integration_id": row["integration_id"],
                    "timestamp": row["timestamp"],
                    "status": "blocked" if outcome == "BLOCK" else "pending" if outcome == "QUEUE" else "allowed",
                    "ai_decision": outcome,
                }
            )

        async with db.execute("SELECT COUNT(*) AS c FROM events WHERE user_id = ?", (user_id,)) as cursor:
            total = (await cursor.fetchone())["c"]
        return {
            "user_id": user_id,
            "automations": items,
            "integrations": sorted(integrations),
            "total": total,
            "page": page,
            "pages": max(1, (total + limit - 1) // limit),
            "summary": {
                "actions_today": len([i for i in items if i["timestamp"] >= time.time() - 86400]),
                "blocked": len([i for i in items if i["status"] == "blocked"]),
                "warnings": len([i for i in items if i["status"] == "pending"]),
                "safe": len([i for i in items if i["status"] == "allowed"]),
            },
        }
    finally:
        await db.close()

@app.websocket("/ws/alerts")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text() # Keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.websocket("/ws/user/{user_id}")
async def user_websocket_endpoint(websocket: WebSocket, user_id: str):
    token = websocket.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        token_user_id = str(payload.get("sub") or "")
    except Exception:
        await websocket.close(code=4401)
        return
    if token_user_id != user_id:
        await websocket.close(code=4403)
        return
    await websocket.accept()
    if not redis_client:
        await websocket.close()
        return
    pubsub = redis_client.pubsub()
    channel = f"sentinelmesh:user:{user_id}:events"
    await pubsub.subscribe(channel)
    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message and message.get("type") == "message":
                await websocket.send_text(message["data"])
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()


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
    _validate_auth_config()
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
