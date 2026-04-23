# SentinelMesh — Build Phases & Steps

> Complete build plan with Cursor prompts + Antigravity workflow configs

---

## Phase 0 — Environment Setup (30 min)

### Step 0.1 — Repo Initialization

```bash
mkdir sentinelmesh && cd sentinelmesh
git init
mkdir -p core backend dashboard integrations attacker_sim tests

# Create .env.example
cat > .env.example << 'EOF'
GEMINI_API_KEY=
VT_API_KEY=
HIBP_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
RESEND_API_KEY=
REDIS_URL=redis://redis:6379
DATABASE_URL=sqlite:///./sentinel.db
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/live
EOF

cp .env.example .env
```

### Step 0.2 — Docker Compose Base

**Cursor Prompt:**
```
Create a docker-compose.yml for the SentinelMesh project with these services:
1. sentinel-core: Python 3.11 container, build from ./core, port 8001, depends on redis and db
2. sentinel-backend: Python 3.11 container, build from ./backend, port 8000, depends on sentinel-core, redis
3. sentinel-dashboard: Node 20 container, build from ./dashboard, port 3000, depends on sentinel-backend
4. redis: redis:alpine, no ports exposed externally
5. db: alpine with a volume mount at ./data:/data for SQLite

Add restart: always to all services. Add environment variable loading from .env file.
```

### Step 0.3 — Get API Keys

| Service | Action |
|---|---|
| Gemini Flash | Go to aistudio.google.com → Create API key |
| VirusTotal | Sign up at virustotal.com → Profile → API Key |
| Telegram Bot | Message @BotFather → /newbot → copy token |
| Telegram Chat ID | Message @userinfobot → copy your chat ID |

---

## Phase 1 — Core Engine (Day 1 Morning, ~3 hours)

### Step 1.1 — Pydantic Models

**Cursor Prompt:**
```
In sentinelmesh/core/models.py, create Pydantic v2 models:

1. RawEvent: event_id (uuid, auto), timestamp (float, auto), source (str), 
   attack_type (Literal enum), payload (dict), evidence (list[str]), 
   resources (list[str]), breach_fingerprint (str optional)

2. ThreatEvent: event_id, threat_type (str), score (int 0-100), 
   verdict (Literal["BLOCK","WARN","ALLOW"]), evidence (list[str]), 
   breach_match (str optional), detector_version (str default "1.0.0")

3. AnomalySignal: event_id, deviation_score (int 0-100), 
   context (dict), anomaly_type (str)

4. GatekeeperVerdict: incident_id (str), threat_score (int), 
   anomaly_score (int), combined_score (int), 
   decision (Literal["BLOCK","QUEUE","ALLOW"]),
   action_taken (str), timestamp (float), signature (str)

5. IncidentCard: id (str), type (str), score (int), verdict (str),
   evidence (list[str]), affected_resources (list[str]),
   recommended_action (str), signature (str), 
   timeline (list[dict]), breach_reference (str),
   status (str default "OPEN")

Use model_config = ConfigDict(arbitrary_types_allowed=True) where needed.
```

### Step 1.2 — Detector Agent

**Cursor Prompt:**
```
In sentinelmesh/core/detector.py, implement the DetectorAgent:

1. oauth_risk_scorer(scopes: list[str]) -> dict:
   RISKY_SCOPES dict maps scope URLs to point values:
   - gmail full: 40pts, drive full: 30pts, calendar: 15pts, contacts: 10pts, profile: 5pts
   Sum all scope points. Return risk_score, verdict (BLOCK if >70, WARN if >30, else ALLOW),
   reason string, and recommendation.

2. env_read_monitor(reads_per_min: int, unique_projects: int) -> dict:
   Baseline is 3 reads/min and 1 project.
   CRITICAL if reads_per_min > 15 OR unique_projects > 3.
   Return alert type, anomaly_factor (reads/baseline), severity, action.

3. supply_chain_auditor(package_name: str, version: str) -> dict:
   Call https://registry.npmjs.org/{package_name} and 
   https://api.npmjs.org/downloads/point/last-week/{package_name}
   Build risk_signals list: LOW_ADOPTION if downloads < 100,
   POSTINSTALL_SCRIPT if scripts.postinstall exists in package version data.
   BLOCK_INSTALL if len(signals) >= 2, else WARN.
   Handle HTTP errors gracefully with try/except.

4. threat_intel_lookup(ip: str) -> dict (optional, uses VirusTotal API):
   GET https://www.virustotal.com/api/v3/ip_addresses/{ip}
   Return malicious_votes count and flagged boolean (True if votes > 3).
   If VT_API_KEY not set, return {"skipped": True, "reason": "No API key"}.
```

### Step 1.3 — Listener Agent

**Cursor Prompt:**
```
In sentinelmesh/core/listener.py, implement behavioral baseline monitoring:

Class BehavioralBaseline:
- __init__: set baselines dict {env_reads_per_minute: 3, cross_project_reads: 1, 
  off_hours_start: 22, off_hours_end: 6}
- build_baseline(): return the baseline dict
- detect_velocity_anomaly(reads_per_min: int) -> dict: 
  compute factor = reads_per_min / baseline. 
  Return {is_anomaly: bool, factor: float, severity: str}
- track_off_hours_activity(timestamp: float) -> dict:
  Convert timestamp to hour. Return {is_off_hours: bool, hour: int}
- monitor_cross_project_access(unique_projects: int) -> dict:
  Return {is_anomaly: bool, projects: int, baseline: 1}
- compute_anomaly_score(reads_per_min, unique_projects, timestamp) -> int:
  Score 0-100 based on: velocity (0-50pts) + cross-project (0-30pts) + off-hours (0-20pts)
  Return integer score.
```

### Step 1.4 — Gatekeeper Agent

**Cursor Prompt:**
```
In sentinelmesh/core/gatekeeper.py, implement:

1. Key management:
   load_or_generate_key() -> ec.EllipticCurvePrivateKey:
   Try to load .ecdsa_key.pem. If not found, generate ec.SECP256R1() key,
   save to .ecdsa_key.pem, and return it. Import from cryptography.hazmat.primitives.

2. sign_action(verdict: dict) -> str:
   Serialize verdict to sorted JSON bytes.
   Sign with ECDSA + SHA256. Return hex string of signature.

3. make_verdict(threat_score: int, anomaly_score: int, action: str) -> dict:
   combined = max(threat_score, anomaly_score)
   BLOCK if combined > 70, QUEUE if combined > 30, else ALLOW.
   Build verdict dict with all fields + call sign_action() for signature.
   Return the complete signed verdict dict.

4. verify_verdict(verdict: dict, public_key_pem: bytes) -> bool:
   Re-serialize the verdict (excluding signature field), verify ECDSA signature.
   Return True if valid, False if tampered.
```

### Step 1.5 — Supervisor Agent

**Cursor Prompt:**
```
In sentinelmesh/core/supervisor.py, implement:

1. notify_telegram(incident: dict):
   Use TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from os.getenv().
   Build Markdown message with emoji severity indicator (🔴 CRITICAL, 🟠 HIGH, 🟡 MEDIUM).
   Include type, score, verdict, evidence list, and link to admin panel.
   POST to Telegram Bot API. Log any errors but don't crash.

2. generate_incident_card(verdict: dict, raw_event: dict) -> dict:
   Build IncidentCard-compatible dict with:
   - id: f"INC-{int(verdict['timestamp'])}"
   - type from raw_event.attack_type
   - score: verdict.combined_score
   - evidence: raw_event.evidence list
   - timeline: call reconstruct_timeline(raw_event)
   - recommended_action based on score threshold

3. reconstruct_timeline(event: dict) -> list[dict]:
   Return list of {t: "T-Xms/s", event: "description"} entries
   showing the full flow from interception to admin panel update.
   Use realistic timing values: 0ms, 80ms, 200ms, 270ms, 320ms, 400ms.

4. process_verdict(verdict: dict, raw_event: dict):
   Main entry point. Generate incident card, call notify_telegram, 
   return incident card dict.
```

---

## Phase 2 — Backend API (Day 1 Afternoon, ~2 hours)

### Step 2.1 — Database Setup

**Cursor Prompt:**
```
In sentinelmesh/backend/db.py, implement SQLite setup using aiosqlite:

1. get_db() async context manager returning aiosqlite connection
2. init_db() async function creating these tables if not exist:
   - events: id TEXT PK, timestamp REAL, source TEXT, attack_type TEXT, 
     payload TEXT (JSON), processed INTEGER DEFAULT 0
   - verdicts: id TEXT PK, event_id TEXT, threat_score INT, anomaly_score INT,
     combined_score INT, decision TEXT, action_taken TEXT, timestamp REAL, signature TEXT
   - incidents: id TEXT PK, verdict_id TEXT, type TEXT, score INT, 
     status TEXT DEFAULT 'OPEN', evidence TEXT (JSON), resources TEXT (JSON),
     breach_reference TEXT, recommended_action TEXT, created_at REAL
   - audit_trail: id INTEGER PK AUTOINCREMENT, timestamp REAL, agent TEXT,
     action TEXT, target_id TEXT, verdict TEXT, signature TEXT, is_human_action INT DEFAULT 0
   - config: key TEXT PK, value TEXT, updated_at REAL

Enable WAL mode for concurrent access: PRAGMA journal_mode=WAL
```

### Step 2.2 — FastAPI Main App

**Cursor Prompt:**
```
In sentinelmesh/backend/main.py, create FastAPI app with:

1. CORS middleware allowing all origins (for local development)
2. List of connected WebSocket clients: connected_clients = []
3. startup event: call init_db(), log "SentinelMesh backend started"
4. broadcast_alert(incident: dict) async: send JSON to all connected_clients,
   remove disconnected clients from the list
5. WebSocket endpoint at /ws/live: accept, append to clients, 
   loop receive_text() until WebSocketDisconnect, then remove
6. Include routers from routes/events.py, routes/alerts.py, routes/admin.py
7. GET /health endpoint returning {"status": "ok", "agents": ["detector","listener","gatekeeper","supervisor"]}

Import broadcast_alert and make it accessible to routes via app.state.broadcast
```

### Step 2.3 — Events Route

**Cursor Prompt:**
```
In sentinelmesh/backend/routes/events.py:

POST /api/v1/events endpoint:
- Accept raw dict body (no strict schema — be flexible)
- Save to events table in SQLite with uuid event_id and current timestamp
- Publish to Redis channel "sentinel:events" using aioredis
- Import core agents and run detection pipeline:
  1. If attack_type is OAUTH_OVERPERMISSION: call oauth_risk_scorer(payload.scopes)
  2. If CREDENTIAL_ENUMERATION: call env_read_monitor(reads_per_min, unique_projects)
  3. If SUPPLY_CHAIN: call supply_chain_auditor(package, version)
  4. Compute anomaly_score from BehavioralBaseline
  5. Call make_verdict(threat_score, anomaly_score, attack_type)
  6. Call process_verdict(verdict, raw_event) → incident_card
  7. Save verdict and incident to DB
  8. Call app.state.broadcast(incident_card) for WebSocket push
- Return {"status": "queued", "incident_id": incident_card.id, "verdict": verdict.decision}
```

### Step 2.4 — Alerts & Admin Routes

**Cursor Prompt:**
```
In sentinelmesh/backend/routes/alerts.py:
- GET /api/v1/alerts: return all incidents from SQLite ordered by created_at DESC, limit 50
- GET /api/v1/alerts/{id}: return single incident by ID
- GET /api/v1/audit-trail: return all audit_trail entries ordered by timestamp DESC
- GET /api/v1/audit-trail/public-key: return ECDSA public key as PEM string

In sentinelmesh/backend/routes/admin.py:
- POST /api/v1/approve/{incident_id}: 
  Update incident status to APPROVED in DB.
  Write to audit_trail with is_human_action=1.
  Return {"status": "approved", "incident_id": incident_id}
- POST /api/v1/block/{incident_id}:
  Update incident status to BLOCKED in DB.
  Write to audit_trail with is_human_action=1.
  Return {"status": "blocked", "incident_id": incident_id}
- GET /api/v1/agents/status:
  Return {"detector": "running", "listener": "running", 
          "gatekeeper": "running", "supervisor": "running"}
```

---

## Phase 3 — Admin Dashboard (Day 1 Evening, ~4 hours)

### Step 3.1 — Next.js Setup

```bash
cd dashboard
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false
npm install @shadcn/ui recharts socket.io-client zustand lucide-react
npx shadcn-ui@latest init
npx shadcn-ui@latest add card badge button table alert
```

### Step 3.2 — Live Dashboard Page

**Cursor Prompt:**
```
In sentinelmesh/dashboard/app/page.tsx, create the main dashboard:

Use shadcn/ui components. Dark theme. Color scheme: dark background (#0a0a0f), 
red accents (#ef4444) for CRITICAL, orange (#f97316) for HIGH, green (#22c55e) for safe.

Layout (grid):
- Top row: 4 stat cards — "Events Today", "Blocked Today", "Avg Risk Score", "Active Agents"
- Middle: Live Alert Feed (WebSocket) — scrollable list of incident cards
- Right sidebar: 4 Agent Status cards (Detector, Listener, Gatekeeper, Supervisor) each showing 
  status dot (green=running), events processed count

WebSocket connection:
useEffect → new WebSocket(process.env.NEXT_PUBLIC_WS_URL)
ws.onmessage → parse JSON → if type==="ALERT" add to alerts state (prepend, max 50)
Auto-reconnect with exponential backoff on close.

Each alert card shows:
- Severity badge (🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM)  
- Attack type, risk score as progress bar, evidence preview
- Time elapsed since alert
- [Block] [Approve] [Investigate] buttons calling POST /api/v1/block or approve
- Breach fingerprint reference if present

Use Zustand store for alerts state. Show "Waiting for events..." empty state with 
a pulsing radar icon when no alerts exist.
```

### Step 3.3 — Incidents Page

**Cursor Prompt:**
```
In sentinelmesh/dashboard/app/incidents/page.tsx:

Fetch GET /api/v1/alerts on load. Auto-refresh every 10 seconds.

Show a sortable table with columns:
ID | Type | Score (colored bar) | Status (badge) | Time | Actions

Status badges: OPEN=yellow, BLOCKED=red, APPROVED=green, INVESTIGATING=blue

Click row → expand incident detail panel showing:
- Full attack timeline (list of {t, event} entries with icons)
- Evidence list with bullet points  
- Affected resources
- Recommended action (highlighted box)
- Breach fingerprint reference
- Audit signature: show first 20 chars + "✅ Signed" badge

[Block] and [Approve] buttons update status optimistically then call API.
[Investigate] sets status to INVESTIGATING.

Add a filter bar: filter by Type, Status, Score range (slider).
```

### Step 3.4 — Audit Trail Page

**Cursor Prompt:**
```
In sentinelmesh/dashboard/app/audit-trail/page.tsx:

Fetch GET /api/v1/audit-trail. Display as timeline:

Each entry shows:
- Timestamp (formatted as "Apr 23, 2026 03:14:22")
- Agent name badge (Detector/Listener/Gatekeeper/Supervisor or HUMAN)
- Action description
- Verdict (BLOCK/ALLOW/QUEUE with color)
- Signature: show truncated hex + verify button

Verify button (calls POST /api/v1/audit-trail/verify):
- Shows "✅ Valid — signature matches" in green
- Shows "❌ TAMPERED — signature mismatch" in red with warning

Human actions have a special "👤 Human Decision" indicator.

Add export button: download all entries as JSON file.
Style as a dark terminal-aesthetic timeline — monospace font for signatures.
```

### Step 3.5 — Config Page

**Cursor Prompt:**
```
In sentinelmesh/dashboard/app/config/page.tsx:

Section 1 — Risk Thresholds:
Three labeled sliders (0-100):
- "Allow threshold" (default 30) — below this: log only
- "Queue threshold" (default 70) — between allow/queue: human review
- Block threshold is auto = above queue threshold
Show color zones on a gradient bar.

Section 2 — OAuth Scope Blocklist:
Editable list of scopes. Pre-populated with risky scopes.
[+ Add scope] button, [Remove] per item.

Section 3 — Notification Settings:
- Toggle: Telegram alerts (show masked token, [Test] button)
- Toggle: Email alerts (show masked address, [Test] button)
- Severity threshold for notifications (dropdown: ALL / HIGH+ / CRITICAL only)

Section 4 — Agent Permissions Matrix:
Simple table: rows = Agent, columns = Action types.
Checkboxes for which agents can perform which actions.

[Save Config] button → POST /api/v1/config. Show toast on success.
```

---

## Phase 4 — Integrations (Day 2 Morning, ~2 hours)

### Step 4.1 — MCP Server

**Cursor Prompt:**
```
In sentinelmesh/integrations/mcp_server.py, create an MCP server using the mcp Python SDK:

pip install mcp

Create Server("sentinelmesh") with 3 tools:

1. scan_oauth_grant(scopes: list[str]) -> dict
   Description: "Score the risk of an OAuth grant before approving. Use before clicking Allow on any OAuth consent screen."
   Calls oauth_risk_scorer from core.detector.

2. audit_package(package: str, version: str) -> dict
   Description: "Check npm or pip package for supply chain risk before installing."
   Calls supply_chain_auditor from core.detector.

3. check_env_access(project_id: str, reads_per_min: int, unique_projects: int) -> dict
   Description: "Flag bulk credential reads in real-time. Call when reading multiple environment variables."
   Calls env_read_monitor from core.detector.

Run with stdio_server for Cursor/Claude Desktop integration.
Add to README: how to configure in Cursor MCP settings.
```

### Step 4.2 — Attack Simulators

**Cursor Prompt:**
```
Create three attack simulator scripts in sentinelmesh/attacker_sim/:

1. oauth_attack.py:
   Send POST to http://localhost:8000/api/v1/events with attack_type OAUTH_OVERPERMISSION.
   Include realistic scopes: Gmail, Drive, Calendar.
   Print progress and wait for confirmation response.
   Add --delay flag (default 0) to slow down for demo.

2. cred_dump.py:
   Loop through 10 mock projects × 5 credential names = 50 reads.
   POST each read as separate event with attack_type CREDENTIAL_ENUMERATION.
   Include running stats: reads_per_min (calculated from timing), unique_projects.
   Sleep 0.08s between reads. Print "Reading project_X/VAR_NAME" for each.
   Show summary when complete.

3. supply_chain.py:
   Send POST with attack_type SUPPLY_CHAIN.
   Include risk_signals: NEW_MAINTAINER, FRESH_RELEASE, LOW_ADOPTION, POSTINSTALL_SCRIPT.
   Include postinstall script content in evidence.
   Print result from backend.

All scripts should work with: python attacker_sim/oauth_attack.py
```

---

## Phase 5 — Antigravity (n8n) Workflow

### Workflow 1 — OAuth Attack Demo Flow

**Antigravity Setup Steps:**

```
1. Open Antigravity/n8n
2. Create new workflow: "SentinelMesh OAuth Demo"
3. Add these nodes in sequence:
```

**Node 1 — Manual Trigger**
```
Type: Manual Trigger
Label: "Start OAuth Attack Demo"
```

**Node 2 — HTTP Request (Simulate OAuth)**
```
Type: HTTP Request
Method: POST
URL: http://localhost:8000/api/v1/events
Body (JSON):
{
  "attack_type": "OAUTH_OVERPERMISSION",
  "source": "n8n_workflow",
  "scopes": [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/drive"
  ],
  "app": "test-oauth-app",
  "evidence": ["Workflow triggered OAuth grant", "Full mailbox + drive access"]
}
```

**Node 3 — IF (Check Verdict)**
```
Type: IF
Condition: {{ $json.verdict }} equals "BLOCK"
True branch → Node 4
False branch → Node 5
```

**Node 4 — Telegram (Alert on Block)**
```
Type: Telegram
Operation: Send Message
Chat ID: {{ $env.TELEGRAM_CHAT_ID }}
Text: "🔴 SentinelMesh BLOCKED an OAuth attack!\nScore: {{ $json.score }}/100"
```

**Node 5 — Continue Workflow**
```
Type: Set
Note: "OAuth approved — workflow continues"
```

### Workflow 2 — Supply Chain Audit Before npm Install

**Antigravity Setup:**

```
Node 1: Webhook (trigger from CI/CD)
  → Receives: {"package": "name", "version": "1.0.0"}

Node 2: HTTP Request
  → POST http://localhost:8000/api/v1/events
  → Body: {"attack_type": "SUPPLY_CHAIN", "package": "{{$json.package}}", ...}

Node 3: IF verdict === "BLOCK_INSTALL"
  → True: Send Telegram + Stop workflow
  → False: Continue with npm install step
```

---

## Phase 6 — Testing & Polish (Day 2 Afternoon)

### Step 6.1 — Run Full Test Suite

```bash
cd sentinelmesh
pip install pytest pytest-asyncio httpx aiosqlite
pytest tests/ -v
```

### Step 6.2 — End-to-End Demo Run

```bash
# Terminal 1
docker-compose up

# Terminal 2 — wait 30 seconds then run
python attacker_sim/oauth_attack.py
# Watch dashboard at localhost:3000

# Terminal 3
python attacker_sim/cred_dump.py

# Terminal 4
python attacker_sim/supply_chain.py
```

### Step 6.3 — Final Polish Checklist

```
□ Dashboard auto-scrolls to newest alert
□ All 3 test runs produce Telegram notifications
□ Audit trail shows entries for all blocked actions
□ [Block] and [Approve] buttons update status immediately
□ Agent status cards show "running" for all 4 agents
□ Empty state shows on fresh dashboard load
□ docker-compose up --build takes < 3 minutes
□ README has one-command setup instructions
□ All API keys in .env.example documented
```

---

## Cursor AI Tips — Work Faster

### Always give Cursor this context upfront:
```
Project: SentinelMesh — runtime security agent for automation environments
Stack: Python (LangGraph + FastAPI) backend, Next.js + shadcn/ui frontend
Goal: Intercept supply chain attacks, OAuth overpermission, and credential dumps in real-time
The 4 core agents are: Detector, Listener, Gatekeeper, Supervisor
All agents communicate via Redis pub/sub
Current file I'm working on: [filename]
```

### Useful Cursor Commands:
- `Cmd+K` → Inline edit with context
- `Cmd+L` → Chat with full repo context
- `@file` → Reference specific file in chat
- `@codebase` → Ask questions across entire project

### Debugging Prompts for Cursor:
```
# If WebSocket not connecting:
"Debug: WebSocket at ws://localhost:8000/ws/live not connecting from Next.js.
Show me the CORS config needed in FastAPI and the reconnection logic in the client."

# If Redis not working:
"The Redis pub/sub in backend/services/event_bus.py is not publishing.
I'm using aioredis with docker-compose service name 'redis'. Fix the connection."

# If LangGraph agent not running:
"My LangGraph Detector agent in core/detector.py never calls the Gemini model.
Debug the StateGraph setup and tool binding."
```
