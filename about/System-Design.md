# SentinelMesh — System Design

> Focus: Data flow, component contracts, failure modes, scaling path

---

## 1. Component Contracts

### Event Schema (All inputs to SentinelMesh)

```json
{
  "event_id": "uuid-v4",
  "timestamp": 1714000000.0,
  "source": "chrome_extension | mcp_server | n8n_node | docker_sidecar | rest_api",
  "attack_type": "OAUTH_OVERPERMISSION | CREDENTIAL_ENUMERATION | SUPPLY_CHAIN | AI_AGENT_ABUSE",
  "payload": {
    "scopes": ["..."],              // For OAuth events
    "reads_per_min": 750,           // For credential events  
    "package": "name@version",      // For supply chain events
    "api_calls": ["..."]            // For AI agent events
  },
  "breach_fingerprint": "Vercel April 2026",
  "evidence": ["string array of human-readable evidence"],
  "resources": ["affected resource identifiers"],
  "metadata": {
    "user_agent": "...",
    "ip": "...",
    "project_id": "..."
  }
}
```

### ThreatEvent Schema (Detector output)

```json
{
  "event_id": "uuid-v4",
  "threat_type": "OAUTH_OVERPERMISSION",
  "score": 85,
  "verdict": "BLOCK | WARN | ALLOW",
  "evidence": ["scope Gmail Full (40pts)", "scope Drive Full (30pts)"],
  "breach_match": "Vercel April 2026",
  "detector_version": "1.0.0"
}
```

### GatekeeperVerdict Schema

```json
{
  "incident_id": "INC-1714000000",
  "threat_score": 85,
  "anomaly_score": 60,
  "combined_score": 85,
  "decision": "BLOCK | QUEUE | ALLOW",
  "action_taken": "QUARANTINE | PENDING_HUMAN_REVIEW | LOG_ONLY",
  "timestamp": 1714000000.0,
  "signature": "ecdsa_hex_signature",
  "policy_version": "1.0.0"
}
```

---

## 2. Redis Event Bus Design

```
Publishers:                         Subscribers:
─────────────────────────────────────────────────────────
Integration Layer                   Core Engine
  └─ POSTs to backend API             └─ sentinel-core service
       └─ backend publishes               ├─ Detector Agent (channel: sentinel:events)
            to Redis channel              ├─ Listener Agent (channel: sentinel:events)
                                          └─ Gatekeeper (channel: sentinel:verdicts)

Channels:
  sentinel:events    ← raw events from all integrations
  sentinel:verdicts  ← gatekeeper decisions
  sentinel:incidents ← supervisor incident cards → dashboard WebSocket
  sentinel:alerts    ← high-priority broadcast to all subscribers
```

**Why Redis pub/sub:** Agents are fully decoupled. Detector doesn't know Listener exists. If one agent crashes, others continue. Horizontal scaling = just add more subscribers.

---

## 3. SQLite Schema

```sql
-- Raw event stream
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    timestamp REAL NOT NULL,
    source TEXT NOT NULL,
    attack_type TEXT NOT NULL,
    payload TEXT NOT NULL,  -- JSON blob
    processed INTEGER DEFAULT 0
);

-- Gatekeeper decisions
CREATE TABLE verdicts (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id),
    threat_score INTEGER,
    anomaly_score INTEGER,
    combined_score INTEGER,
    decision TEXT NOT NULL,  -- BLOCK/QUEUE/ALLOW
    action_taken TEXT,
    timestamp REAL,
    signature TEXT NOT NULL  -- ECDSA hex
);

-- Incident records (human-facing)
CREATE TABLE incidents (
    id TEXT PRIMARY KEY,
    verdict_id TEXT REFERENCES verdicts(id),
    type TEXT NOT NULL,
    score INTEGER,
    status TEXT DEFAULT 'OPEN',  -- OPEN/APPROVED/BLOCKED/INVESTIGATING
    evidence TEXT,  -- JSON array
    resources TEXT, -- JSON array
    breach_reference TEXT,
    human_decision TEXT,  -- who acted + when
    created_at REAL,
    resolved_at REAL
);

-- Cryptographically signed audit trail
CREATE TABLE audit_trail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    agent TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    verdict TEXT,
    signature TEXT NOT NULL,
    is_human_action INTEGER DEFAULT 0
);

-- Policy configuration
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at REAL,
    updated_by TEXT
);
```

---

## 4. WebSocket Protocol (Dashboard ↔ Backend)

```
Client connects to: ws://localhost:8000/ws/live

Server → Client messages:
{
  "type": "ALERT",
  "incident": { ...IncidentCard },
  "timestamp": 1714000000.0
}

{
  "type": "AGENT_STATUS",
  "agents": {
    "detector": "running",
    "listener": "running",
    "gatekeeper": "running",
    "supervisor": "running"
  }
}

{
  "type": "METRIC_UPDATE",
  "events_last_minute": 12,
  "blocks_today": 3,
  "risk_score_avg": 45
}

Client → Server messages:
{ "type": "PING" }
{ "type": "SUBSCRIBE", "channel": "incidents_only" }
```

---

## 5. ECDSA Audit Trail — How It Works

```
Every action taken by any agent is signed:

1. Agent creates verdict dict (sorted keys, deterministic)
2. Serialize to JSON bytes
3. Sign with ECDSA private key (secp256r1 curve, SHA-256 hash)
4. Store signature hex alongside the record

Verification (anyone with public key):
1. Fetch record from audit_trail
2. Re-serialize the action fields (same sort order)
3. ECDSA verify signature against public key
4. If ANY field was changed → signature fails → "TAMPERED" shown in UI

Public key exposed at: GET /api/v1/audit-trail/public-key
Verification endpoint: POST /api/v1/audit-trail/verify { record_id, signature }
```

---

## 6. Failure Modes & Handling

| Failure | Impact | Recovery |
|---|---|---|
| Redis down | Events not routed to agents | Backend queues events in memory (max 1000), retries Redis every 5s |
| Core engine crash | No new threat analysis | Docker restarts container (restart: always); existing incidents still in DB |
| VirusTotal rate limit | Threat intel lookup fails | Graceful degradation — score event without intel data, flag as "PARTIAL_ANALYSIS" |
| WebSocket disconnects | Dashboard stops updating | Client auto-reconnects with exponential backoff (1s, 2s, 4s, max 30s) |
| ECDSA key missing | No signing possible | Generate new key on startup, log warning to admin |
| SQLite locked | Write fails | Retry with WAL mode enabled (allows concurrent reads) |

---

## 7. Request Flow Timing

```
Integration Event → Dashboard Alert: Target < 2 seconds

T+0ms    Integration plugin fires event
T+50ms   Backend API receives POST /events
T+60ms   Redis publishes to sentinel:events
T+80ms   Detector agent picks up event
T+200ms  Detector scores risk (Gemini Flash inference)
T+250ms  Listener cross-checks behavioral baseline
T+270ms  Gatekeeper makes verdict + signs
T+300ms  Gatekeeper publishes to sentinel:incidents
T+320ms  Supervisor generates incident card
T+350ms  Supervisor notifies Telegram
T+400ms  Backend broadcasts via WebSocket
T+450ms  Dashboard renders alert card   ← User sees alert
T+3000ms Telegram delivers to admin phone
```

---

## 8. Scaling Path (Post-MVP)

```
MVP (Local Docker)          →    Production SaaS
─────────────────────────────────────────────────────────────
SQLite                      →    Supabase (PostgreSQL)
Redis single node           →    Redis Cluster / Upstash
LangGraph in-process        →    Separate microservices per agent
Docker Compose              →    Kubernetes (k3s → EKS)
Single admin panel          →    Multi-tenant with org isolation
Gemini Flash (free)         →    Gemini Pro / Claude Opus (paid)
Single ECDSA key            →    HSM-backed key management (AWS KMS)
Manual policy config        →    ML-trained adaptive policies
```

---

## 9. Security Considerations

| Concern | Mitigation |
|---|---|
| Backend API exposed | Bind to localhost only; auth via JWT for admin panel |
| Audit trail tampering | ECDSA signatures — any modification detectable |
| Agent spoofing | Events tagged with source; webhook shared secret validation |
| Sensitive data in logs | Events strip actual credential values — only metadata logged |
| Redis in-memory loss | Redis persistence (AOF) enabled; critical data also written to SQLite |
| SSRF via threat intel URLs | URL validation before fetching; allowlist of intel provider domains |
