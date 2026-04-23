import requests
import time
import uuid

BACKEND_URL = "http://localhost:8002/api/v1/events"

def simulate_oauth_attack():
    event = {
        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "timestamp": time.time(),
        "source": "ci-runner-exploit",
        "event_type": "oauth_request",
        "metadata": {
            "scopes": ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/cloud-platform", "*"],
            "project_id": "sentinel-internal",
            "client_id": "malicious-app-id"
        }
    }
    
    print(f"Sending malicious OAuth request event: {event['event_id']}")
    try:
        response = requests.post(BACKEND_URL, json=event)
        print(f"Response: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"Failed to send event: {e}")

if __name__ == "__main__":
    simulate_oauth_attack()
