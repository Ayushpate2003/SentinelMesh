import asyncio
import json
import os
import requests
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("SentinelMesh")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000/api/v1")

@mcp.tool()
def list_active_incidents() -> str:
    """Lists all active security incidents in SentinelMesh."""
    try:
        response = requests.get(f"{BACKEND_URL}/incidents")
        incidents = response.json()
        return json.dumps(incidents, indent=2)
    except Exception as e:
        return f"Error fetching incidents: {str(e)}"

@mcp.tool()
def approve_incident(incident_id: str) -> str:
    """Approves a queued security incident and signs the action."""
    try:
        response = requests.post(f"{BACKEND_URL}/approve/{incident_id}")
        return json.dumps(response.json(), indent=2)
    except Exception as e:
        return f"Error approving incident: {str(e)}"

@mcp.tool()
def block_incident(incident_id: str) -> str:
    """Blocks a suspicious activity and records it in the audit trail."""
    try:
        response = requests.post(f"{BACKEND_URL}/block/{incident_id}")
        return json.dumps(response.json(), indent=2)
    except Exception as e:
        return f"Error blocking incident: {str(e)}"

@mcp.tool()
def fetch_audit_log() -> str:
    """Retrieves the cryptographically signed audit trail of all security actions."""
    try:
        response = requests.get(f"{BACKEND_URL}/audit-trail")
        return json.dumps(response.json(), indent=2)
    except Exception as e:
        return f"Error fetching audit trail: {str(e)}"

if __name__ == "__main__":
    mcp.run()
