"""Simulates automation webhooks posting secrets to untrusted endpoints (n8n / CI leak pattern)."""
import os
import sys
import time
import uuid

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8002/api/v1/events")
LIGHT_MODE = os.getenv("LIGHT_MODE", "false").lower() == "true"
MAX_EVENTS = int(os.getenv("SIM_MAX_EVENTS", "5" if LIGHT_MODE else "20"))
DELAY = float(os.getenv("SIM_DELAY_SECONDS", "1.5" if LIGHT_MODE else "0.2"))

TARGETS = [
    "https://evil-exfil.example/collect",
    "https://discord.com/api/webhooks/fake-token/exfil",
    "https://pastebin.com/raw/malicious-payload",
]


def main():
    if LIGHT_MODE:
        print("LIGHT_MODE enabled: simulation disabled.")
        sys.exit(0)
    if os.getenv("SAFE_MODE", "false").lower() == "true" and not os.getenv("TRIGGERED_BY_API"):
        print("SAFE_MODE enabled: Cannot run directly. Please use the Admin Dashboard API.")
        sys.exit(1)

    print(f"Starting webhook abuse simulation. Max events: {MAX_EVENTS}")
    for i in range(MAX_EVENTS):
        event = {
            "event_id": f"evt_{uuid.uuid4().hex[:8]}",
            "timestamp": time.time(),
            "source": f"n8n-workflow-{i:02d}",
            "event_type": "webhook_dispatch",
            "metadata": {
                "target_url": TARGETS[i % len(TARGETS)],
                "method": "POST",
                "payload_preview": '{"AWS_SECRET_ACCESS_KEY":"AKIA...redacted","stripe_sk":"sk_live_xxxx"}',
                "project_id": f"proj-webhook-{i % 5}",
            },
        }
        print(f"Sending webhook_dispatch event: {event['event_id']}")
        try:
            r = requests.post(BACKEND_URL, json=event, timeout=5)
            print(f"Response: {r.status_code} - {r.json()}")
        except Exception as e:
            print(f"Failed to send event: {e}")
        time.sleep(DELAY)


if __name__ == "__main__":
    main()
