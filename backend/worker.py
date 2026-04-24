import asyncio
import json
import logging
import os
import signal
import time
import socket
from typing import Any, Dict

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from redis.asyncio import Redis

from backend.database import get_db, init_db
from core.supervisor import Supervisor


logger = logging.getLogger("worker")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
QUEUE_KEY = "sentinelmesh:event_queue"
DLQ_KEY = "sentinelmesh:event_dlq"
INCIDENT_CHANNEL = "sentinelmesh:incidents"
MAX_RETRIES = int(os.getenv("WORKER_MAX_RETRIES", "3"))
WORKER_METRICS_PORT = int(os.getenv("WORKER_METRICS_PORT", "9101"))
WORKER_ID = f"{socket.gethostname()}-{os.getpid()}"
WORKER_HEARTBEAT_KEY = f"sentinelmesh:worker:heartbeat:{WORKER_ID}"

WORKER_PROCESSED_TOTAL = Counter("sentinelmesh_worker_processed_total", "Worker processed events")
WORKER_RETRIES_TOTAL = Counter("sentinelmesh_worker_retries_total", "Worker retries")
WORKER_ERRORS_TOTAL = Counter("sentinelmesh_worker_errors_total", "Worker processing errors")
WORKER_PROCESSING_SECONDS = Histogram("sentinelmesh_worker_processing_seconds", "Worker event processing latency")
DLQ_TOTAL = Counter("sentinelmesh_dlq_total", "Total events sent to DLQ")
WORKER_UP = Gauge("sentinelmesh_worker_up", "Worker up state")

stop_event = asyncio.Event()


async def _process_event(supervisor: Supervisor, redis_client: Redis, payload: Dict[str, Any]):
    event_data = payload["event"]
    user_id = payload.get("user_id") or event_data.get("metadata", {}).get("user_id") or "anonymous"
    retry_count = int(payload.get("retry_count", 0))
    event_id = event_data.get("event_id", "unknown")
    started = time.perf_counter()

    db = await get_db()
    try:
        async with db.execute("SELECT key, value FROM config") as cursor:
            rows = await cursor.fetchall()
            config = {row["key"]: row["value"] for row in rows}

        incident = await asyncio.to_thread(
            supervisor.process_event,
            event_data,
            float(config.get("threshold_block", 0.8)),
            float(config.get("threshold_queue", 0.4)),
        )

        await db.execute(
            "INSERT INTO events (event_id, timestamp, source, event_type, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?)",
            (
                event_data["event_id"],
                event_data["timestamp"],
                event_data["source"],
                event_data["event_type"],
                user_id,
                json.dumps(event_data.get("metadata", {})),
            ),
        )

        if incident:
            await db.execute(
                "INSERT INTO incidents (incident_id, summary, severity, status, created_at, user_id, outcome, signals, affected_components, timeline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    incident.incident_id,
                    incident.summary,
                    incident.severity,
                    incident.status,
                    time.time(),
                    user_id,
                    "BLOCK" if incident.status == "blocked" else "QUEUE",
                    json.dumps([s.model_dump() for s in incident.signals]),
                    json.dumps(incident.affected_components),
                    json.dumps(incident.timeline),
                ),
            )
            await redis_client.publish(INCIDENT_CHANNEL, json.dumps(incident.model_dump()))
            await redis_client.publish(
                f"sentinelmesh:user:{user_id}:events",
                json.dumps(
                    {
                        "type": "incident",
                        "user_id": user_id,
                        "incident_id": incident.incident_id,
                        "summary": incident.summary,
                        "severity": incident.severity,
                        "status": incident.status,
                        "timestamp": time.time(),
                    }
                ),
            )

        await db.commit()
        WORKER_PROCESSED_TOTAL.inc()
        logger.info(
            "event_processed event_id=%s retry_count=%s latency_ms=%.2f",
            event_id,
            retry_count,
            (time.perf_counter() - started) * 1000,
        )
        WORKER_PROCESSING_SECONDS.observe(time.perf_counter() - started)
    finally:
        await db.close()


async def run_worker():
    await init_db()
    supervisor = Supervisor()
    redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    start_http_server(WORKER_METRICS_PORT)
    WORKER_UP.set(1)
    logger.info("worker_started queue=%s dlq=%s", QUEUE_KEY, DLQ_KEY)

    async def heartbeat_loop():
        while not stop_event.is_set():
            await redis_client.set(WORKER_HEARTBEAT_KEY, str(time.time()), ex=30)
            await asyncio.sleep(10)

    heartbeat_task = asyncio.create_task(heartbeat_loop())

    try:
        while not stop_event.is_set():
            item = await redis_client.brpop(QUEUE_KEY, timeout=1)
            if not item:
                continue
            _, raw = item
            payload = json.loads(raw)
            if "event" not in payload:
                payload = {"event": payload, "retry_count": 0}

            event_id = payload.get("event", {}).get("event_id", "unknown")
            retry_count = int(payload.get("retry_count", 0))

            try:
                await _process_event(supervisor, redis_client, payload)
            except Exception as exc:
                logger.error(
                    "event_processing_failed event_id=%s retry_count=%s error=%s",
                    event_id,
                    retry_count,
                    exc,
                )
                WORKER_ERRORS_TOTAL.inc()
                if retry_count + 1 >= MAX_RETRIES:
                    dlq_payload = {**payload, "failed_at": time.time(), "error": str(exc)}
                    await redis_client.lpush(DLQ_KEY, json.dumps(dlq_payload))
                    DLQ_TOTAL.inc()
                    logger.error("event_sent_to_dlq event_id=%s", event_id)
                else:
                    retry_payload = {**payload, "retry_count": retry_count + 1}
                    WORKER_RETRIES_TOTAL.inc()
                    await redis_client.lpush(QUEUE_KEY, json.dumps(retry_payload))
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except Exception:
            pass
        await redis_client.delete(WORKER_HEARTBEAT_KEY)
        WORKER_UP.set(0)
        await redis_client.aclose()
        logger.info("worker_stopped")


def _handle_shutdown(signum, frame):
    logger.info("worker_shutdown_signal signum=%s", signum)
    stop_event.set()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)
    asyncio.run(run_worker())
