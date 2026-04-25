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

    print(f"Starting ransomware pattern simulation. Max events: {MAX_EVENTS}")
    for i in range(MAX_EVENTS):
        touched = 800 + i * 90
        event = {
            "event_id": f"evt_{uuid.uuid4().hex[:8]}",
            "timestamp": time.time(),
            "source": f"file-worker-{i:02d}",
            "event_type": "ransomware_pattern",
            "metadata": {
                "files_touched": touched,
                "encrypt_ops": 180 + i * 12,
                "delete_ops": 75 + i * 8,
                "project_id": "sentinel-files",
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
