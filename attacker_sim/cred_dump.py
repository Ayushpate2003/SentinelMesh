import requests
import time
import uuid

BACKEND_URL = "http://localhost:8002/api/v1/events"

def simulate_cred_dump():
    event = {
        "event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "timestamp": time.time(),
        "source": "prod-web-server-01",
        "event_type": "env_access",
        "metadata": {
            "keys": ["AWS_SECRET_ACCESS_KEY", "DB_PASSWORD", "GOOGLE_API_KEY", "STRIPE_SECRET"],
            "process_id": 1234,
            "project_id": "sentinel-prod"
        }
    }
    
    print(f"Sending credential dump event: {event['event_id']}")
    try:
        response = requests.post(BACKEND_URL, json=event)
        print(f"Response: {response.status_code} - {response.json()}")
    except Exception as e:
        print(f"Failed to send event: {e}")

if __name__ == "__main__":
    simulate_cred_dump()
