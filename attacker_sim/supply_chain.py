import requests
import time
import uuid

BACKEND_URL = "http://localhost:8002/api/v1/events"

def simulate_supply_chain_attack():
    event = {
        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "timestamp": time.time(),
        "source": "developer-laptop-01",
        "event_type": "package_install",
        "metadata": {
            "package_name": "reqests", # Typosquat
            "version": "2.28.1",
            "project_id": "sentinel-dev"
        }
    }
    
    print(f"Sending supply chain attack event: {event['event_id']}")
    try:
        response = requests.post(BACKEND_URL, json=event)
        print(f"Response: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"Failed to send event: {e}")

if __name__ == "__main__":
    simulate_supply_chain_attack()
