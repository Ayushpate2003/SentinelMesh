"""Simulates an AI agent bulk-reading memory / tool store (credential & PII sweep)."""
import os
import sys
import time
import uuid

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8002/api/v1/events")
LIGHT_MODE = os.getenv("LIGHT_MODE", "false").lower() == "true"
MAX_EVENTS = int(os.getenv("SIM_MAX_EVENTS", "5" if LIGHT_MODE else "20"))
DELAY = float(os.getenv("SIM_DELAY_SECONDS", "1.5" if LIGHT_MODE else "0.2"))

KEYS = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GITHUB_TOKEN",
    "SLACK_BOT_TOKEN",
    "STRIPE_SECRET_KEY",
    "DATABASE_URL",
    "JWT_SIGNING_SECRET",
]


def main():
    if LIGHT_MODE:
        print("LIGHT_MODE enabled: simulation disabled.")
        sys.exit(0)
    if os.getenv("SAFE_MODE", "false").lower() == "true" and not os.getenv("TRIGGERED_BY_API"):
        print("SAFE_MODE enabled: Cannot run directly. Please use the Admin Dashboard API.")
        sys.exit(1)

    print(f"Starting agent memory dump simulation. Max events: {MAX_EVENTS}")
    for i in range(MAX_EVENTS):
        # Escalate key count slightly each burst to mimic sweep
        n = min(40, 12 + (i % 8) * 3)
        keys = (KEYS * 6)[:n]
        event = {
            "event_id": f"evt_{uuid.uuid4().hex[:8]}",
            "timestamp": time.time(),
            "source": f"langchain-agent-{i:02d}",
            "event_type": "agent_memory_read",
            "metadata": {
                "keys_read": keys,
                "read_count_1m": 120 + i * 15,
                "store": "redis_agent_memory",
                "project_id": f"proj-agent-{i % 3}",
            },
        }
        print(f"Sending agent_memory_read event: {event['event_id']}")
        try:
            r = requests.post(BACKEND_URL, json=event, timeout=5)
            print(f"Response: {r.status_code} - {r.json()}")
        except Exception as e:
            print(f"Failed to send event: {e}")
        time.sleep(DELAY)


if __name__ == "__main__":
    main()
