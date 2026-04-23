# SentinelMesh 🛡️

**SentinelMesh** is an enterprise-grade security orchestration and automated response (SOAR) engine designed to detect, analyze, and mitigate complex cyber attacks in real-time. It leverages a multi-agent architecture to provide high-fidelity detection and autonomous response with cryptographic audit trails.

## 🚀 Key Features

- **Multi-Agent Consensus**: Decision logic based on consensus between multiple detection signals (max risk, average risk, and signal frequency).
- **Ultra-Low Latency**: Asynchronous alert processing ensuring system response times under **5ms** (Average).
- **Cryptographic Audit Trail**: All administrative actions (Approve/Block) are cryptographically signed using ECDSA and stored in a verifiable audit log.
- **Real-time Monitoring**: WebSocket-powered dashboard for live event streaming and incident management.
- **Comprehensive Detection**:
  - OAuth Risk Scoring (Illicit Consent Grants)
  - Environment Variable Monitoring (Credential Theft)
  - Supply Chain Auditing (Malicious npm packages)
  - Threat Intel Integration (VirusTotal)

## 🏗️ Architecture

SentinelMesh operates using four specialized agents:
1. **Detector Agent**: Monitors streams for specific attack patterns and scores risk.
2. **Listener Agent**: Establishes behavioral baselines to detect anomalies.
3. **Gatekeeper Agent**: Consolidates scores and determines the final verdict (ALLOW/QUEUE/BLOCK) with cryptographic signing.
4. **Supervisor Agent**: Manages orchestration, reconstructs attack timelines, and handles notifications (Telegram/Email).

## 🛠️ Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+
- SQLite3

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd SentinelMesh
   ```

2. **Set up Environment Variables**:
   Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   # Add your API keys for Gemini, VirusTotal, Telegram, and Resend.
   ```

3. **Install Backend Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Install Dashboard Dependencies**:
   ```bash
   cd dashboard
   npm install
   ```

## 🏃 Running the System

### 1. Start the Backend
```bash
# From the root directory
python3 backend/main.py
```
The API will be available at `http://localhost:8002`.

### 2. Start the Dashboard
```bash
cd dashboard
npm run dev
```
The dashboard will be available at `http://localhost:3000`.

### 3. Run Attack Simulators
To test the detection engine, run any of the scripts in `attacker_sim/`:
```bash
python3 attacker_sim/oauth_attack.py
python3 attacker_sim/cred_dump.py
python3 attacker_sim/supply_chain.py
```

## 🧪 Testing

Run the full test suite to verify system integrity:
```bash
pytest tests/
```

Verify alert latency:
```bash
python3 tests/measure_latency.py
```

## 🛡️ Cryptographic Integrity
Human actions are signed using a private key stored locally. The `Gatekeeper` verifies these signatures before any critical state changes, ensuring that the audit trail is immutable and authentic.

## 📄 License
MIT License
