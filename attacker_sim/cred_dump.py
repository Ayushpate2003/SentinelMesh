import requests
import time
import uuid
import os
import sys

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:8002/api/v1/events")
LIGHT_MODE = os.getenv("LIGHT_MODE", "false").lower() == "true"
MAX_EVENTS = int(os.getenv("SIM_MAX_EVENTS", "5" if LIGHT_MODE else "20"))
DELAY = float(os.getenv("SIM_DELAY_SECONDS", "1.5" if LIGHT_MODE else "0.2"))

def simulate_cred_dump():
    if LIGHT_MODE:
        print("LIGHT_MODE enabled: simulation disabled.")
        sys.exit(0)

    if os.getenv("SAFE_MODE", "false").lower() == "true" and not os.getenv("TRIGGERED_BY_API"):
        print("SAFE_MODE enabled: Cannot run directly. Please use the Admin Dashboard API.")
        sys.exit(1)

    print(f"Starting credential dump simulation. Max events: {MAX_EVENTS}")
    for i in range(MAX_EVENTS):
        event = {
            "event_id": f"evt_{uuid.uuid4().hex[:8]}",
            "timestamp": time.time(),
            "source": f"prod-web-server-{i:02d}",
            "event_type": "env_access",
            "metadata": {
                "keys": ["AWS_SECRET_ACCESS_KEY", "DB_PASSWORD", "GOOGLE_API_KEY", "STRIPE_SECRET"],
                "process_id": 1234 + i,
                "project_id": "sentinel-prod"
            }
        }
        
        print(f"Sending credential dump event: {event['event_id']}")
        try:
            response = requests.post(BACKEND_URL, json=event, timeout=5)
            print(f"Response: {response.status_code} - {response.json()}")
        except Exception as e:
            print(f"Failed to send event: {e}")
            
        time.sleep(DELAY)

if __name__ == "__main__":
    simulate_cred_dump()
