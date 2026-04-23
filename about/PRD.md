# SentinelMesh — Product Requirements Document (PRD)

> **Version:** 1.0 — MVP  
> **Target:** Hackathon Demo + Investor-ready prototype  
> **Timeline:** 72-hour build sprint

---

## 1. Problem Statement

Automation environments are running blind. Every n8n workflow, CI/CD pipeline, MCP server, and AI agent executes with **zero runtime security observer**. Attackers don't break in — they walk in through trusted integrations, live undetected for months, and drain credentials that fund the next attack.

### Evidence (Real Breaches, 2026)

| Breach | Date | Root Cause | Damage | Detection Gap |
|---|---|---|---|---|
| Vercel | Apr 2026 | OAuth "Allow All" grant → Context.ai → env var dump | $2M data sale, 580 employees, customer secrets | 22 months undetected |
| Axios npm | Mar 2026 | Maintainer hijack → malicious dep → RAT on 83M installs | Cross-platform RAT (macOS/Windows/Linux) | 19-hour window, CI/CD blind |
| LiteLLM → Axios → Mercor | Mar 2026 | Incomplete credential rotation cascaded across 5 ecosystems in 8 days | Full SDLC supply chain compromise | No single point caught it |

### The Root Cause

Existing tools are either perimeter guards (firewalls, WAFs) or post-incident forensics (SIEMs, log analyzers). **Nobody has built a runtime security agent that lives inside the automation environment itself** — watching agents, intercepting actions, enforcing least-privilege, and escalating to humans in real-time.

---

## 2. Solution — SentinelMesh

SentinelMesh is a pluggable security agent layer that lives inside your automation stack.

**Core value:** Catches in 8 seconds what went undetected for 22 months.

### What It Does

1. **DETECT** — Scores every OAuth grant, package install, and credential access for risk
2. **LISTEN** — Monitors behavioral baselines and flags AI-speed anomalies
3. **GATE** — Blocks high-risk actions before execution using policy rules
4. **SUPERVISE** — Notifies humans and generates forensic timelines for review

---

## 3. Target Users (MVP)

### Primary: DevOps/Security Engineers at companies running automation stacks
- Using n8n, GitHub Actions, or similar CI/CD tools
- Running AI agent frameworks (LangChain, AutoGPT, custom MCP)
- Need compliance-ready audit logs (SOC 2, ISO 27001)

### Secondary: Platform/Infrastructure teams
- Responsible for supply chain integrity
- Need real-time visibility into what their automation is doing

### Hackathon Judge Persona
- Technical, skeptical, has seen 50 security pitches
- Wants to see a **live demo** with real-world attack fingerprints
- Responds to: "This is the exact pattern from the Vercel breach, watch us stop it in 8 seconds"

---

## 4. MVP Feature List

### P0 — Must Have (Demo-critical)

| Feature | Description | Acceptance Criteria |
|---|---|---|
| OAuth Risk Scorer | Score OAuth scope combinations 0–100 | Gmail Full + Drive Full = score 85 → BLOCK |
| Bulk Credential Detection | Detect anomalous env var read velocity | 750 reads/min vs baseline 3 → CRITICAL alert |
| Supply Chain Auditor | Flag npm/pip packages with risky signals | New maintainer + fresh release + low downloads → BLOCK |
| Live Dashboard | Real-time alert feed via WebSocket | Alert appears within 2 seconds of event |
| Block/Approve Actions | Human can block or approve queued actions | One-click in admin panel |
| ECDSA Audit Trail | Tamper-proof signed log of all actions | Every action has verifiable signature |
| Telegram Alerts | Push notifications to admin phone | Alert delivered within 5 seconds |

### P1 — Should Have (Week 1 post-hackathon)

| Feature | Description |
|---|---|
| n8n/Antigravity Node | Official community node for workflow integration |
| MCP Server | Expose SentinelMesh as tools in Cursor/Claude Desktop |
| Chrome Extension | OAuth consent screen risk banner overlay |
| Agent Role Matrix | Configurable permissions per agent type |
| Incident Timeline | Full forensic reconstruction of attack chain |

### P2 — Nice to Have (Month 1)

| Feature | Description |
|---|---|
| Supabase Cloud Backend | Production-grade cloud storage |
| Slack Integration | Alerts in team Slack channels |
| Custom Policy Rules | UI to define custom block/allow rules |
| Multi-tenant | Multiple organizations on one instance |
| API Rate Limiting | Protection for the backend endpoints themselves |

---

## 5. User Stories

### US-001 — Security Engineer Stops OAuth Attack
> **As a** security engineer,  
> **I want** to be alerted when an OAuth grant requests overly broad scopes,  
> **So that** I can block it before credentials are exposed.

**Acceptance criteria:**
- Alert fires within 2 seconds of grant request
- Score, scope list, and matched breach fingerprint shown
- One-click BLOCK available from dashboard

---

### US-002 — DevOps Engineer Catches Supply Chain Attack
> **As a** DevOps engineer,  
> **I want** SentinelMesh to flag risky npm packages before they install,  
> **So that** malicious postinstall scripts never execute on my CI runner.

**Acceptance criteria:**
- Package is intercepted before `postinstall` hook runs
- Risk signals listed: NEW_MAINTAINER, FRESH_RELEASE, LOW_ADOPTION
- Postinstall script content shown in alert

---

### US-003 — Admin Reviews and Approves Queued Action
> **As an** admin,  
> **I want** to see queued medium-risk actions with full context,  
> **So that** I can make an informed approve/block decision.

**Acceptance criteria:**
- Incident card shows: score, type, evidence chain, affected resources
- [Approve] and [Block] buttons both work and log the human decision
- Approved actions proceed; blocked actions are logged with permanent denial

---

### US-004 — Auditor Reviews Tamper-proof Log
> **As a** compliance auditor,  
> **I want** a cryptographically signed log of all security decisions,  
> **So that** I can verify no decisions were altered or deleted.

**Acceptance criteria:**
- Every entry has ECDSA signature
- UI shows "✅ Valid" or "❌ Tampered" for each log entry
- Export as JSON available

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Alert latency < 2 seconds from event ingestion to dashboard |
| Availability | 99.9% uptime for core engine (local Docker deployment) |
| Security | All inter-service comms over localhost; audit trail ECDSA-signed |
| Portability | Full stack runs with `docker-compose up` — no cloud account needed |
| Cost | Zero cost for MVP — all free tier and open source tools |
| Data | No sensitive data leaves the local environment by default |

---

## 7. Success Metrics (Hackathon)

- [ ] All 3 live test runs complete without failure on demo day
- [ ] Dashboard shows real-time alert within 2 seconds
- [ ] At least 1 judge asks "can we see the code?"
- [ ] Telegram alert fires during live demo
- [ ] Audit trail shows signed entry for every blocked action

---

## 8. Out of Scope (MVP)

- Multi-cloud deployment (AWS/GCP/Azure managed service)
- ML-based behavioral models (rule-based baseline for MVP)
- Mobile app
- Customer-facing SaaS onboarding
- Automated remediation (block only — no auto-fix)
