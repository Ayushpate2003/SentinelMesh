import pytest
import os
import json
import time
from unittest.mock import patch, MagicMock

# Mock Redis BEFORE importing backend.main
mock_redis_patcher = patch("redis.from_url")
mock_redis = mock_redis_patcher.start()
mock_r = MagicMock()
mock_r.incr.return_value = 1
mock_r.scard.return_value = 1
mock_redis.return_value = mock_r

from fastapi.testclient import TestClient
from backend.main import app
from backend.database import DATABASE_PATH

# Set test database path before importing or running anything
os.environ["DATABASE_URL"] = "sqlite:///test_sentinel.db"

@pytest.fixture(scope="function", autouse=True)
def setup_test_db():
    # Ensure a fresh DB for each test
    db_file = "test_sentinel.db"
    if os.path.exists(db_file):
        try:
            os.remove(db_file)
        except:
            pass
    
    yield
    
    if os.path.exists(db_file):
        try:
            os.remove(db_file)
        except:
            pass

@pytest.fixture(scope="function")
def client():
    with TestClient(app) as c:
        yield c

import uuid

def test_ingest_event_no_threat(client):
    event_id = f"e_{uuid.uuid4()}"
    working_hour_ts = 1776945600.0 
    event_data = {
        "event_id": event_id,
        "timestamp": working_hour_ts,
        "source": "test_src",
        "event_type": "login",
        "metadata": {"user": "alice"}
    }
    response = client.post("/api/v1/events", json=event_data)
    assert response.status_code == 200
    assert response.json()["status"] == "processed"
    assert response.json()["incident_id"] is None

def test_ingest_event_with_threat(client):
    event_id = f"e_{uuid.uuid4()}"
    event_data = {
        "event_id": event_id,
        "timestamp": time.time(),
        "source": "test_src",
        "event_type": "oauth_request",
        "metadata": {"scopes": ["*"]}
    }
    response = client.post("/api/v1/events", json=event_data)
    assert response.status_code == 200
    incident_id = response.json()["incident_id"]
    assert incident_id is not None
    
    list_response = client.get("/api/v1/incidents")
    assert list_response.status_code == 200
    incidents = list_response.json()
    assert any(i["incident_id"] == incident_id for i in incidents)

def test_approve_incident(client):
    event_id = f"e_{uuid.uuid4()}"
    event_data = {
        "event_id": event_id,
        "timestamp": time.time(),
        "source": "test_src",
        "event_type": "oauth_request",
        "metadata": {"scopes": ["*"]}
    }
    resp = client.post("/api/v1/events", json=event_data)
    incident_id = resp.json()["incident_id"]
    
    approve_resp = client.post(f"/api/v1/approve/{incident_id}?actor=TestAdmin")
    assert approve_resp.status_code == 200
    assert "signature" in approve_resp.json()
    
    audit_resp = client.get("/api/v1/audit-trail")
    assert audit_resp.status_code == 200
    trail = audit_resp.json()
    assert any(a["actor"] == "TestAdmin" and incident_id in a["details"] for a in trail)
