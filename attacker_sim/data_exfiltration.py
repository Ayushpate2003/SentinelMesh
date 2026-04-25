import os
import sys
import time
import uuid

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8002/api/v1/events")
LIGHT_MODE = os.getenv("LIGHT_MODE", "false").lower() == "true"
MAX_EVENTS = int(os.getenv("SIM_MAX_EVENTS", "5" if LIGHT_MODE else "20"))
DELAY = float(os.getenv("SIM_DELAY_SECONDS", "1.5" if LIGHT_MODE else "0.2"))


def main():
    if LIGHT_MODE:
        print("LIGHT_MODE enabled: simulation disabled.")
        sys.exit(0)
    if os.getenv("SAFE_MODE", "false").lower() == "true" and not os.getenv("TRIGGERED_BY_API"):
        print("SAFE_MODE enabled: Cannot run directly. Please use the Admin Dashboard API.")
        sys.exit(1)

    print(f"Starting data exfiltration simulation. Max events: {MAX_EVENTS}")
    for i in range(MAX_EVENTS):
        mb = 420 + i * 35
        event = {
            "event_id": f"evt_{uuid.uuid4().hex[:8]}",
            "timestamp": time.time(),
            "source": f"reporting-job-{i:02d}",
            "event_type": "data_exfiltration",
            "metadata": {
                "bytes_out_mb": mb,
                "contains_secrets": True,
                "external_destination": True,
                "destination": "https://drop-zone.evil-exfil.example/upload",
                "project_id": f"proj-data-{i % 2}",
            },
        }
        try:
            r = requests.post(BACKEND_URL, json=event, timeout=5)
            print(f"Response: {r.status_code} - {r.json()}")
        except Exception as e:
            print(f"Failed to send event: {e}")
        time.sleep(DELAY)


if __name__ == "__main__":
    main()
