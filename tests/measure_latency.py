import requests
import time
import uuid
import statistics

BACKEND_URL = "http://localhost:8002/api/v1/events"

def measure_latency(iterations=10):
    latencies = []
    print(f"Measuring latency over {iterations} iterations...")
    
    for i in range(iterations):
        event = {
            "event_id": f"lat_{uuid.uuid4().hex[:8]}",
            "timestamp": time.time(),
            "source": f"latency-test-{i}",
            "event_type": "oauth_request",
            "metadata": {
                "scopes": ["*"],
                "project_id": "latency-check"
            }
        }
        
        start_time = time.time()
        try:
            response = requests.post(BACKEND_URL, json=event)
            end_time = time.time()
            
            if response.status_code == 200:
                latency = (end_time - start_time) * 1000 # in ms
                latencies.append(latency)
                print(f"Iteration {i+1}: {latency:.2f}ms")
            else:
                print(f"Iteration {i+1}: Failed with status {response.status_code}")
        except Exception as e:
            print(f"Iteration {i+1}: Error {e}")
            
    if latencies:
        avg = statistics.mean(latencies)
        print(f"\nAverage Latency: {avg:.2f}ms")
        print(f"Max Latency: {max(latencies):.2f}ms")
        print(f"Min Latency: {min(latencies):.2f}ms")
        return avg
    return None

if __name__ == "__main__":
    measure_latency()
