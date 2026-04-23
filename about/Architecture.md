# SentinelMesh — Architecture Document

> **Version:** 1.0  
> **Status:** MVP Draft  
> **Last Updated:** April 2026

---

## 1. System Overview

SentinelMesh is a **runtime security agent** that lives *inside* automation environments (n8n, CI/CD pipelines, MCP servers, AI agent stacks). Unlike perimeter tools (firewalls, WAFs) or post-incident tools (SIEMs), SentinelMesh intercepts threats **before execution** — in real time.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ENTERPRISE AUTOMATION ENV                        │
│                                                                     │
│   n8n / CI-CD Pipeline / MCP Server / Docker / AI Agent Stack      │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Workflow │  │  OAuth   │  │ npm/pip  │  │  AI Agent calls  │  │
│  │ Executor │  │  Grants  │  │  pkgs    │  │  (LLM + tools)   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       └─────────────┴─────────────┴──────────────────┘            │
│                              │                                      │
│         ┌────────────────────▼──────────────────────┐              │
│         │         SENTINEL INTERCEPTOR LAYER         │              │
│         │      (pluggable sidecar / MCP middleware)  │              │
│         └────────────────────┬──────────────────────┘              │
└──────────────────────────────│─────────────────────────────────────┘
                               │
              ┌────────────────▼──────────────────┐
              │         SENTINEL CORE ENGINE       │
              │                                    │
              │   ┌──────────┐  ┌───────────┐     │
              │   │ DETECTOR │  │ LISTENER  │     │
              │   └────┬─────┘  └─────┬─────┘     │
              │        └──────┬────────┘           │
              │          ┌────▼───────┐            │
              │          │ GATEKEEPER │            │
              │          └────┬───────┘            │
              │          ┌────▼───────┐            │
              │          │ SUPERVISOR │            │
              │          └────┬───────┘            │
              └───────────────│────────────────────┘
                              │
              ┌───────────────▼────────────────────┐
              │      BACKEND + ADMIN PANEL          │
              │   FastAPI (REST+WS) + Next.js       │
              └─────────────────────────────────────┘
```

---

## 2. Layer-by-Layer Breakdown

### Layer 1 — Integration / Entry Points

How SentinelMesh hooks into existing environments **without changing client code**:

| Integration | Method | What it intercepts |
|---|---|---|
| MCP Server | `mcp` Python SDK — exposes sentinel as tool calls | Claude/Cursor IDE tool calls |
| n8n / Antigravity Node | Custom community node wrapping each workflow step | Workflow execution events |
| Docker Sidecar | Network-level intercept container | All container API calls |
| Chrome Extension | `content_script` on `accounts.google.com/o/oauth2/*` | OAuth consent screen grants |
| REST Middleware | FastAPI/Express wrapper — 3 lines of code | Any backend HTTP service |

**Key principle:** Zero changes to client's existing code. Plugin wraps around it.

---

### Layer 2 — Sentinel Core Engine (4 Agents)

All agents are implemented in **Python using LangGraph** with **Gemini Flash 2.0** as the reasoning model.

#### DETECTOR Agent
- **Inputs:** OAuth scope list, env var read events, npm/pip package metadata, API call logs
- **Tools:**
  - `oauth_risk_scorer()` → score 0–100
  - `env_read_monitor()` → count + flag bulk reads
  - `supply_chain_auditor()` → npm/pip risk fingerprint
  - `threat_intel_lookup()` → VirusTotal / HIBP / CVE
- **Output:** `ThreatEvent { score, type, evidence }`

#### LISTENER Agent
- **Inputs:** Continuous event stream from env
- **Functions:**
  - `build_baseline()` → normal behavior per workflow
  - `detect_velocity_anomaly()` → AI-attacker speed flag
  - `track_off_hours_activity()`
  - `monitor_cross_project_access()`
- **Output:** `AnomalySignal { deviation_score, context }`

#### GATEKEEPER Agent
- **Inputs:** ThreatEvent + AnomalySignal + Action request
- **Decision Engine:**
  - Risk score < 30 → ✅ ALLOW (log only)
  - Risk score 30–70 → ⚠️ QUEUE (supervisor review)
  - Risk score > 70 → 🚫 BLOCK + QUARANTINE
- **Enforces:**
  - Least-privilege policy per agent role
  - Crypto-signed audit trail (ECDSA) per action
  - No privileged execution without supervisor token
- **Output:** `GatekeeperVerdict { allow/block, signature }`

#### SUPERVISOR Agent
- **Inputs:** Queued verdicts from Gatekeeper
- **Functions:**
  - `generate_incident_card()` → full context + evidence
  - `notify_human()` → Telegram / Email / Slack
  - `reconstruct_attack_timeline()` → forensic trace
  - `request_approval()` → push to admin panel
- **Output:** `IncidentRecord` pushed to Admin Panel DB

---

### Layer 3 — Backend API (FastAPI)

```
/api/v1/
├── events/          ← Ingest raw events from env
├── alerts/          ← CRUD for incident records
├── verdicts/        ← Gatekeeper decision log
├── approve/{id}     ← Human supervisor action
├── block/{id}       ← Emergency block endpoint
├── agents/status    ← Health of all 4 agents
├── audit-trail/     ← ECDSA-signed action history
└── config/          ← Policy rules, thresholds
```

**Services:**
- EventBus → Redis pub/sub
- PolicyEngine → JSON rules config
- AuditLogger → SQLite (local) / Supabase (cloud)
- Notifier → Telegram bot + email (Resend)
- ThreatIntel → VirusTotal + HIBP + OSV.dev

---

### Layer 4 — Admin Panel (Next.js)

| Page | Contents |
|---|---|
| `/dashboard` | Live alert feed (WebSocket), 4 agent status cards, risk score gauge 0–100 |
| `/incidents` | Table: ID, Type, Severity, Status, Actions → [Approve] [Block] [Investigate] |
| `/audit-trail` | ECDSA-signed log: Timestamp, Agent, Action, Verdict, Signature |
| `/config` | Risk threshold sliders, OAuth scope blocklist, trusted apps whitelist, notification settings |
| `/agents` | Card per agent: status, events processed today, controls: Pause/Restart/View logs |

---

### Layer 5 — Data & Storage

```
SQLite (local-first / Docker volume)
├── events          ← raw event stream
├── incidents       ← alert records
├── verdicts        ← gatekeeper log
├── audit_trail     ← signed action log
└── config          ← policy rules

Redis
└── event_bus       ← pub/sub between agents

Optional cloud upgrade:
└── Supabase        ← when going to production
```

---

### Layer 6 — Deployment (Docker Compose)

```yaml
services:
  sentinel-core:      # All 4 agents (Python / LangGraph)
    ports: ["8001:8001"]
  sentinel-backend:   # FastAPI REST + WebSocket
    ports: ["8000:8000"]
  sentinel-dashboard: # Next.js Admin Panel
    ports: ["3000:3000"]
  redis:
    image: redis:alpine
  db:
    image: alpine     # SQLite file on volume
```

---

## 3. Complete Data Flow (One Attack, End to End)

```
ATTACKER ACTION
│
▼
[OAuth grant requested with "Allow All" scopes]
│
▼
Chrome Extension intercepts the grant URL
│
▼
Event posted → Backend API /api/v1/events
│
▼
Redis EventBus publishes → DETECTOR AGENT picks up
│
▼
Detector: oauth_risk_scorer() → score = 85/100 → CRITICAL
│
▼
LISTENER checks behavioral baseline
(3 AM activity + cross-project reads = additional signal)
│
▼
Combined signal → GATEKEEPER
Risk = 85 > threshold 70 → verdict: BLOCK + QUARANTINE
│
▼
Gatekeeper signs action with ECDSA private key
Writes to audit_trail table
│
▼
SUPERVISOR AGENT triggered
Generates IncidentCard: {
  type: OAUTH_OVERPERMISSION,
  score: 85,
  evidence: [scope list, timestamp, account],
  recommended: "Block + notify security team"
}
│
▼
Notifier → Telegram message + Email to admin
Pushes IncidentRecord → Backend DB
│
▼
Admin Panel /dashboard → WebSocket pushes live alert
Admin Panel /incidents → New card appears
Human supervisor sees → [Approve] [Block] [Investigate]
│
▼
Human clicks BLOCK
POST /api/v1/block/{incident_id}
│
▼
Gatekeeper executes block, logs final verdict with human signature
OAuth grant permanently denied
│
▼
Audit trail: complete, tamper-proof, signed chain
from event → detection → decision → resolution
```

---

## 4. Key Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Deployment | Docker Compose, local-first | No cloud dependency for demo, easy 1-command install |
| Agent framework | LangGraph (Python) | Stateful multi-agent, open source |
| AI model | Gemini Flash 2.0 | Free tier, fast, team's existing stack |
| Inter-agent comms | Redis pub/sub | Decoupled, fast, no agent knows about others |
| Audit trail | ECDSA signing | Tamper-proof — critical for enterprise trust |
| Storage | SQLite → Supabase | Start simple, clear upgrade path |
| Admin panel | Next.js + shadcn/ui | Team's existing skills, fast to build |
| Plugin approach | MCP server + n8n node | Covers AI IDE users + automation users |

---

## 5. What Makes This Different

| Existing Tool | Gap | SentinelMesh Advantage |
|---|---|---|
| Snyk, Dependabot | Scan at commit-time — static, not runtime | Intercepts at install time, every time |
| Falco | Container syscall monitoring — no AI reasoning | AI-powered reasoning layer on top |
| Zscaler OAuth scanners | Periodic audits — not real-time grant interception | Intercepts before the grant is clicked |
| SIEM (Splunk, Wazuh) | Log analysis AFTER the fact — reactive | Blocks BEFORE execution |

**The key phrase:** *"Not a scanner. Not a logger. A security agent that thinks and acts in the same moment as the attack."*
