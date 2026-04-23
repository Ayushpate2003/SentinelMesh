# SentinelMesh Implementation Plan

SentinelMesh is a runtime security observer designed to intercept and block threats in automation environments. This plan outlines the local development roadmap from environment setup to a functional hackathon-ready demo.

## Required Tools & Tech Stack

### Core Reasoning Engine (Python)
- **Framework:** Python 3.11+ with **LangGraph** (Stateful multi-agent orchestration).
- **AI Model:** **Gemini 2.0 Flash** (via `langchain-google-genai`).
- **Data Models:** **Pydantic v2** for strict event/threat schema enforcement.
- **Security:** `cryptography` library for **ECDSA (secp256r1)** signing of the audit trail.

### Backend & Infrastructure
- **API Framework:** **FastAPI** (with `aiosqlite` for async DB operations).
- **Event Bus:** **Redis** (pub/sub for real-time inter-agent communication).
- **Storage:** **SQLite** (local-first) with WAL mode for concurrency.
- **Integrations:**
  - **Telegram Bot API** (Real-time push alerts).
  - **VirusTotal API** (Threat intelligence lookups).
  - **Resend** (Email notifications).
  - **npm/pip Registry APIs** (Supply chain auditing).

### Admin Dashboard (Next.js)
- **Core:** **Next.js 14** (App Router) + **TypeScript**.
- **UI Components:** **shadcn/ui** + **Tailwind CSS**.
- **State Management:** **Zustand**.
- **Visualization:** **Recharts** (for risk gauges and activity trends).
- **Icons:** **Lucide React**.

### Development & Demo
- **Orchestration:** **Docker** & **Docker Compose**.
- **Integrations:** **MCP (Model Context Protocol)** Python SDK, **n8n (Antigravity)** custom nodes.
- **Simulation:** Custom Python scripts in `attacker_sim/`.

## Phase 0: Environment & Foundation
**Goal:** Establish the project structure, container orchestration, and security baseline.

1. **Repository Setup**
    - Initialize project directories: `core`, `backend`, `dashboard`, `integrations`, `attacker_sim`, `tests`.
    - Configure `.env` with API keys (Gemini, VirusTotal, Telegram).
2. **Infrastructure (Docker)**
    - Create `docker-compose.yml` defining services for `backend`, `core-agents`, `dashboard`, `redis`, and `sqlite`.
    - Set up volumes for persistent database storage and ECDSA key storage.
3. **Security Baseline**
    - Implement the ECDSA key management system in the `Gatekeeper` module to ensure all subsequent actions are signed.

## Phase 1: Core Security Engine (The Agents)
**Goal:** Build the 4-agent reasoning system using Python and LangGraph.

1. **Detector Agent (`core/detector.py`)**
    - Implement logic for OAuth risk scoring, credential read monitoring, and supply chain auditing.
    - Integrate external threat intelligence (VirusTotal API).
2. **Listener Agent (`core/listener.py`)**
    - Build behavioral baseline tracking using Redis-cached patterns (velocity, off-hours activity, cross-project access).
3. **Gatekeeper Agent (`core/gatekeeper.py`)**
    - Develop the decision matrix (ALLOW/QUEUE/BLOCK) and the cryptographic signing logic (ECDSA).
4. **Supervisor Agent (`core/supervisor.py`)**
    - Implement incident card generation, forensic timeline reconstruction, and Telegram notifications.

## Phase 2: Backend API (FastAPI)
**Goal:** Create the event ingestion pipeline and management API.

1. **Database Layer**
    - Set up `aiosqlite` with tables for `events`, `verdicts`, `incidents`, `audit_trail`, and `config`.
2. **Event Ingestion**
    - Create `POST /api/v1/events` endpoint to ingest raw signals and route them to the Core Engine via Redis.
3. **Management Endpoints**
    - Implement endpoints for human approvals/blocks, audit trail retrieval, and agent health status.
4. **Real-time Communication**
    - Set up WebSocket server for live alert streaming to the dashboard.

## Phase 3: Admin Dashboard (Next.js)
**Goal:** Build a premium, real-time security operations center (SOC) interface.

1. **Live Alert Feed**
    - Develop the main dashboard with WebSocket integration, severity-coded cards, and action buttons.
2. **Incident Management**
    - Create detailed incident views with attack timelines, evidence lists, and forensic signatures.
3. **Audit & Compliance**
    - Implement a terminal-aesthetic audit trail page with signature verification tools.
4. **System Configuration**
    - Build sliders for risk thresholds and management tools for the OAuth blocklist.

## Phase 4: Integrations & Simulation
**Goal:** Connect to the outside world and validate the system with simulated attacks.

1. **MCP Server**
    - Expose SentinelMesh tools (OAuth scan, package audit) to AI IDEs like Cursor/Claude.
2. **Attack Simulators**
    - Script realistic attack scenarios: OAuth over-permissioning, credential dumping, and supply chain compromise.
3. **Antigravity (n8n) Integration**
    - Create workflows that use SentinelMesh as a security gate for automation steps.

## Phase 5: Testing & Polish
**Goal:** Ensure 99.9% reliability for the demo day.

1. **End-to-End Testing**
    - Run the attack simulators against the full stack and verify the E2E flow (Event -> Detection -> Block -> Notify).
2. **Performance Tuning**
    - Optimize the pipeline to ensure < 2s latency from ingestion to dashboard alert.
3. **Documentation**
    - Finalize README and "one-command" setup scripts.
