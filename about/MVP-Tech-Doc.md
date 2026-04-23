# SentinelMesh — MVP Tech Doc

> **Stack:** Python + LangGraph + FastAPI + Next.js + Redis + SQLite  
> **Cost:** ₹0 — 100% free tier / open source  
> **Deploy:** `docker-compose up` — one command

---

## 1. Repo Structure

```
sentinelmesh/
├── core/                        ← Python agents (LangGraph)
│   ├── detector.py              ← OAuth, credential, supply chain detection
│   ├── listener.py              ← Behavioral baseline + anomaly detection
│   ├── gatekeeper.py            ← Policy enforcement + ECDSA signing
│   ├── supervisor.py            ← Incident cards + notifications
│   ├── models.py                ← Pydantic models: ThreatEvent, AnomalySignal, etc.
│   └── graph.py                 ← LangGraph state machine wiring all 4 agents
├── backend/                     ← FastAPI
│   ├── main.py                  ← App entry, WebSocket hub
│   ├── routes/
│   │   ├── events.py            ← POST /api/v1/events
│   │   ├── alerts.py            ← GET/PATCH /api/v1/alerts
│   │   ├── verdicts.py          ← GET /api/v1/verdicts
│   │   └── admin.py             ← POST /api/v1/approve, /block
│   ├── services/
│   │   ├── event_bus.py         ← Redis pub/sub
│   │   ├── audit_logger.py      ← ECDSA signing + SQLite write
│   │   ├── notifier.py          ← Telegram + Resend
│   │   └── threat_intel.py      ← VirusTotal, HIBP, OSV.dev wrappers
│   └── db.py                    ← SQLite connection + schema
├── dashboard/                   ← Next.js admin panel
│   ├── app/
│   │   ├── page.tsx             ← /dashboard live feed
│   │   ├── incidents/page.tsx   ← /incidents table
│   │   ├── audit-trail/page.tsx ← /audit-trail signed log
│   │   ├── agents/page.tsx      ← /agents management
│   │   └── config/page.tsx      ← /config policy settings
│   └── components/
│       ├── AlertFeed.tsx        ← WebSocket live feed
│       ├── RiskGauge.tsx        ← Recharts gauge 0-100
│       ├── AgentCard.tsx        ← Status card per agent
│       └── IncidentTable.tsx    ← Sortable incidents table
├── integrations/
│   ├── mcp_server.py            ← MCP server (Cursor/Claude integration)
│   ├── n8n_node/                ← Custom n8n community node
│   └── chrome_ext/              ← OAuth consent screen interceptor
├── attacker_sim/                ← Demo attack simulators (safe, sandboxed)
│   ├── oauth_attack.py          ← Mimics Vercel OAuth attack vector
│   ├── cred_dump.py             ← Mimics bulk credential enumeration
│   └── supply_chain.py         ← Mimics npm package poisoning
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 2. Environment Variables

```bash
# core/.env
GEMINI_API_KEY=your_key_here          # Google AI Studio (free)
VT_API_KEY=your_key_here              # VirusTotal (free tier)
HIBP_API_KEY=your_key_here            # HaveIBeenPwned (free)

# backend/.env
REDIS_URL=redis://redis:6379
DATABASE_URL=sqlite:///./sentinel.db
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
RESEND_API_KEY=your_key_here
ECDSA_PRIVATE_KEY=auto_generated_on_first_run

# dashboard/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/live
```

---

## 3. Core Agent Code

### Detector Agent — `core/detector.py`

```python
from langgraph.graph import StateGraph
from langchain_google_genai import ChatGoogleGenerativeAI
import requests, os

RISKY_SCOPES = {
    "https://mail.google.com/": 40,
    "https://www.googleapis.com/auth/drive": 30,
    "https://www.googleapis.com/auth/calendar": 15,
    "https://www.googleapis.com/auth/contacts": 10,
}

def oauth_risk_scorer(scopes: list[str]) -> dict:
    score = sum(RISKY_SCOPES.get(s, 5) for s in scopes)
    return {
        "risk_score": score,
        "verdict": "BLOCK" if score > 70 else "WARN" if score > 30 else "ALLOW",
        "reason": f"OAuth grant requests {len(scopes)} scopes. High-risk: {[s for s in scopes if RISKY_SCOPES.get(s, 0) >= 15]}",
        "recommendation": "Reduce to read-only scopes or reject entirely." if score > 70 else "Monitor and log."
    }

def supply_chain_auditor(package_name: str, version: str) -> dict:
    npm_data = requests.get(f"https://registry.npmjs.org/{package_name}").json()
    risk_signals = []
    
    # Check maintainer age
    maintainer = list(npm_data.get("maintainers", [{}]))[0]
    # (Simplified — real impl checks account creation date via npm API)
    
    downloads_data = requests.get(
        f"https://api.npmjs.org/downloads/point/last-week/{package_name}"
    ).json()
    weekly_downloads = downloads_data.get("downloads", 0)
    
    if weekly_downloads < 100:
        risk_signals.append("LOW_ADOPTION")
    
    # Check if postinstall script exists
    pkg_version = npm_data.get("versions", {}).get(version, {})
    if pkg_version.get("scripts", {}).get("postinstall"):
        risk_signals.append("POSTINSTALL_SCRIPT")
    
    return {
        "package": package_name,
        "version": version,
        "risk_signals": risk_signals,
        "verdict": "BLOCK_INSTALL" if len(risk_signals) >= 2 else "WARN",
        "reason": f"Package matches supply chain attack fingerprint: {', '.join(risk_signals)}"
    }

BASELINE = {
    "env_reads_per_minute": 3,
    "cross_project_reads": 1,
}

def env_read_monitor(reads_per_min: int, unique_projects: int) -> dict:
    anomaly_factor = reads_per_min / BASELINE["env_reads_per_minute"]
    is_critical = anomaly_factor > 5 or unique_projects > 3
    return {
        "alert": "CREDENTIAL_ENUMERATION_DETECTED" if is_critical else "NORMAL",
        "reads_per_min": reads_per_min,
        "baseline": BASELINE["env_reads_per_minute"],
        "anomaly_factor": round(anomaly_factor, 1),
        "unique_projects": unique_projects,
        "severity": "CRITICAL" if is_critical else "OK",
        "action": "QUARANTINE_SESSION" if is_critical else "LOG"
    }
```

### Gatekeeper — `core/gatekeeper.py`

```python
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, serialization
import json, time, hashlib

def load_or_generate_key():
    try:
        with open(".ecdsa_key.pem", "rb") as f:
            return serialization.load_pem_private_key(f.read(), password=None)
    except FileNotFoundError:
        key = ec.generate_private_key(ec.SECP256R1())
        with open(".ecdsa_key.pem", "wb") as f:
            f.write(key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption()
            ))
        return key

PRIVATE_KEY = load_or_generate_key()

def sign_action(verdict: dict) -> str:
    payload = json.dumps(verdict, sort_keys=True).encode()
    signature = PRIVATE_KEY.sign(payload, ec.ECDSA(hashes.SHA256()))
    return signature.hex()

def make_verdict(threat_score: int, anomaly_score: int, action: str) -> dict:
    combined = max(threat_score, anomaly_score)
    
    if combined > 70:
        decision = "BLOCK"
        action_taken = "QUARANTINE"
    elif combined > 30:
        decision = "QUEUE"
        action_taken = "PENDING_HUMAN_REVIEW"
    else:
        decision = "ALLOW"
        action_taken = "LOG_ONLY"
    
    verdict = {
        "timestamp": time.time(),
        "threat_score": threat_score,
        "anomaly_score": anomaly_score,
        "combined_score": combined,
        "decision": decision,
        "action_taken": action_taken,
        "action_requested": action,
    }
    verdict["signature"] = sign_action(verdict)
    return verdict
```

### Supervisor — `core/supervisor.py`

```python
import requests, os

TELEGRAM_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

SEVERITY_EMOJI = {"CRITICAL": "🔴", "HIGH": "🟠", "MEDIUM": "🟡", "LOW": "🟢"}

def notify_telegram(incident: dict):
    score = incident.get("score", 0)
    severity = "CRITICAL" if score > 70 else "HIGH" if score > 50 else "MEDIUM"
    emoji = SEVERITY_EMOJI[severity]
    
    msg = (
        f"{emoji} *SENTINEL ALERT [{severity}]*\n\n"
        f"*Type:* {incident['type']}\n"
        f"*Score:* {score}/100\n"
        f"*Action:* {incident.get('action_requested', 'unknown')}\n"
        f"*Decision:* {incident['verdict']}\n\n"
        f"*Evidence:*\n{chr(10).join('• ' + e for e in incident.get('evidence', []))}\n\n"
        f"[Review in Admin Panel](http://localhost:3000/incidents/{incident['id']})"
    )
    
    requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
        json={"chat_id": CHAT_ID, "text": msg, "parse_mode": "Markdown"}
    )

def generate_incident_card(verdict: dict, raw_event: dict) -> dict:
    return {
        "id": f"INC-{int(verdict['timestamp'])}",
        "type": raw_event.get("attack_type", "UNKNOWN"),
        "score": verdict["combined_score"],
        "verdict": verdict["decision"],
        "evidence": raw_event.get("evidence", []),
        "affected_resources": raw_event.get("resources", []),
        "recommended_action": "Block and rotate credentials" if verdict["combined_score"] > 70 else "Review and approve if legitimate",
        "signature": verdict["signature"],
        "timeline": reconstruct_timeline(raw_event),
        "breach_reference": raw_event.get("breach_fingerprint", "")
    }

def reconstruct_timeline(event: dict) -> list:
    return [
        {"t": "T-0s", "event": "Attack action detected by interceptor"},
        {"t": "T-0.3s", "event": "Detector scored risk signal"},
        {"t": "T-0.5s", "event": "Listener checked behavioral baseline"},
        {"t": "T-1s", "event": "Gatekeeper made verdict + signed action"},
        {"t": "T-2s", "event": "Supervisor generated incident card"},
        {"t": "T-3s", "event": "Telegram alert sent to admin"},
        {"t": "T-4s", "event": "Admin panel updated via WebSocket"},
    ]
```

---

## 4. Backend API — `backend/main.py`

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio, json, redis.asyncio as aioredis

app = FastAPI(title="SentinelMesh API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

connected_clients: list[WebSocket] = []

@app.post("/api/v1/events")
async def ingest_event(event: dict):
    """Receive event from any integration plugin"""
    r = aioredis.from_url("redis://redis:6379")
    await r.publish("sentinel:events", json.dumps(event))
    return {"status": "queued"}

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    """Push live alerts to admin dashboard"""
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        connected_clients.remove(websocket)

async def broadcast_alert(incident: dict):
    for client in connected_clients:
        await client.send_json(incident)
```

---

## 5. Attack Simulators (Demo Scripts)

### `attacker_sim/oauth_attack.py`

```python
"""Simulates the Vercel/Context.ai OAuth attack vector — safe, no real credentials"""
import requests

RISKY_SCOPES = [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/contacts",
]

def simulate_oauth_attack():
    print("[ATTACKER] Requesting OAuth grant with all scopes...")
    response = requests.post("http://localhost:8000/api/v1/events", json={
        "attack_type": "OAUTH_OVERPERMISSION",
        "source": "chrome_extension",
        "scopes": RISKY_SCOPES,
        "app": "context-ai-office-suite@googleusercontent.com",
        "breach_fingerprint": "Vercel April 2026",
        "evidence": [
            "Requested Gmail Full Access",
            "Requested Drive Full Access",
            "Requested Calendar Full Access",
            "Grant at 03:14 AM — off-hours",
        ]
    })
    print(f"[ATTACKER] Event posted. Response: {response.json()}")

if __name__ == "__main__":
    simulate_oauth_attack()
```

### `attacker_sim/cred_dump.py`

```python
"""Simulates bulk credential enumeration (Stage 4 of Vercel attack)"""
import requests, time

def simulate_cred_dump():
    print("[ATTACKER] Starting bulk credential enumeration...")
    projects = [f"project_{i}" for i in range(10)]
    creds = ["DATABASE_URL", "STRIPE_SECRET_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN"]
    
    for p in projects:
        for var in creds:
            requests.post("http://localhost:8000/api/v1/events", json={
                "attack_type": "CREDENTIAL_ENUMERATION",
                "source": "env_monitor",
                "project": p,
                "variable": var,
                "reads_per_min": 750,
                "unique_projects": len(projects),
                "breach_fingerprint": "Vercel April 2026 — 9 days before breach",
                "evidence": [
                    f"750 env reads/min (baseline: 3/min) — 250x anomaly",
                    f"10 projects accessed in 4 seconds",
                    "50 unique secrets read",
                ]
            })
            time.sleep(0.08)
    print(f"[ATTACKER] Enumeration complete. {len(projects) * len(creds)} reads sent.")

if __name__ == "__main__":
    simulate_cred_dump()
```

---

## 6. MCP Server — `integrations/mcp_server.py`

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
import sys, asyncio
sys.path.insert(0, "../core")
from detector import oauth_risk_scorer, supply_chain_auditor, env_read_monitor

app = Server("sentinelmesh")

@app.tool()
async def scan_oauth_grant(scopes: list[str]) -> dict:
    """Score risk of an OAuth grant before approving. Use before clicking Allow."""
    return oauth_risk_scorer(scopes)

@app.tool()
async def audit_package(package: str, version: str) -> dict:
    """Check npm/pip package for supply chain risk before installing."""
    return supply_chain_auditor(package, version)

@app.tool()
async def check_env_access(project_id: str, reads_per_min: int, unique_projects: int) -> dict:
    """Flag bulk credential reads in real-time."""
    return env_read_monitor(reads_per_min, unique_projects)

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 7. Free API Keys — Setup Guide

| Service | URL | Limit | Get Key |
|---|---|---|---|
| Google Gemini Flash | aistudio.google.com | Free tier (generous) | Create project → API Keys |
| VirusTotal | virustotal.com | 500 req/day | Sign up → API Key in profile |
| HaveIBeenPwned | haveibeenpwned.com | Free | K API → Get API key |
| OSV.dev | osv.dev | Unlimited | No key needed |
| npm Audit | registry.npmjs.org | Unlimited | No key needed |
| Telegram Bot | t.me/BotFather | Free | /newbot command |
| Resend | resend.com | 3,000/month free | Sign up |

---

## 8. Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/your-org/sentinelmesh
cp .env.example .env
# Fill in your API keys

# 2. Start full stack
docker-compose up --build

# 3. Access
# Admin panel: http://localhost:3000
# Backend API: http://localhost:8000
# API docs:    http://localhost:8000/docs

# 4. Run a test attack
python attacker_sim/oauth_attack.py
# → Watch dashboard light up in real-time
```
