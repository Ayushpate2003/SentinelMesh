/** Demo fixtures for `/dashboard/user` when the API returns empty payloads (local dev). */

const now = () => Math.floor(Date.now() / 1000)

export const MOCK_USER_TIMELINE = [
  {
    timestamp: now() - 120,
    kind: "incident" as const,
    action: "oauth_request — wide Drive + wildcard scopes",
    system_response: "SentinelMesh scored grant 88/100 and queued for review.",
    final_outcome: "QUEUE" as const,
    reference_id: "mock_tl_1",
  },
  {
    timestamp: now() - 3600,
    kind: "event" as const,
    action: "package_install — reqests@2.28.1",
    system_response: "Typosquat signal matched; workflow halted before postinstall.",
    final_outcome: "BLOCK" as const,
    reference_id: "mock_tl_2",
  },
  {
    timestamp: now() - 7200,
    kind: "audit" as const,
    action: "env_access burst on ci-runner-07",
    system_response: "Listener flagged velocity; credentials ring-fenced.",
    final_outcome: "BLOCK" as const,
    reference_id: "mock_tl_3",
  },
]

export const MOCK_USER_ALERTS = [
  {
    id: "mock_alert_1",
    severity: "critical",
    severity_emoji: "🔴",
    status: "firing",
    summary: "Security Incident: oauth_request anomaly from ci-runner-exploit-12",
    timestamp: now() - 180,
    source: "ci-runner-exploit-12",
  },
  {
    id: "mock_alert_2",
    severity: "high",
    severity_emoji: "🟠",
    status: "firing",
    summary: "Webhook dispatch to unlisted host with secret-shaped payload",
    timestamp: now() - 900,
    source: "n8n-prod-webhooks",
  },
  {
    id: "mock_alert_3",
    severity: "medium",
    severity_emoji: "🟡",
    status: "acknowledged",
    summary: "Cross-project token reuse detected (3 projects / 10 min)",
    timestamp: now() - 5400,
    source: "listener",
  },
  {
    id: "mock_alert_4",
    severity: "low",
    severity_emoji: "🔵",
    status: "closed",
    summary: "Routine health check: webhook signature rotation due in 14 days",
    timestamp: now() - 86400,
    source: "policy-scheduler",
  },
]

export const MOCK_USER_AUTOMATIONS = [
  {
    id: "mock_auto_1",
    name: "oauth_request",
    source: "ci-runner-exploit-19 • n8n",
    timestamp: now() - 240,
    status: "blocked" as const,
    ai_decision: "BLOCK",
  },
  {
    id: "mock_auto_2",
    name: "package_install",
    source: "github-actions • supply-chain",
    timestamp: now() - 1100,
    status: "blocked" as const,
    ai_decision: "BLOCK",
  },
  {
    id: "mock_auto_3",
    name: "slack_post_message",
    source: "release-bot • approved integration",
    timestamp: now() - 4000,
    status: "allowed" as const,
    ai_decision: "ALLOW",
  },
]

export const MOCK_USER_SUMMARY = {
  actions_today: 142,
  blocked: 16,
  warnings: 9,
  safe: 117,
}

export const MOCK_USER_RISK = {
  score: 68,
  band: "elevated",
  factors: {
    "OAuth scope breadth": 22,
    "Credential touch rate": 18,
    "Supply-chain signals": 14,
    "Webhook destinations": 14,
  },
}

export const MOCK_USER_INTEGRATIONS = [
  {
    id: "mock_int_n8n",
    name: "Production n8n",
    type: "n8n" as const,
    endpoint: "https://n8n.sentinelmesh.internal/webhook/inbound",
    enabled: true,
    created_at: now() - 86400 * 30,
  },
  {
    id: "mock_int_mcp",
    name: "Cursor MCP bridge",
    type: "mcp" as const,
    endpoint: "mcp://workspace/sentinel-tools",
    enabled: true,
    created_at: now() - 86400 * 7,
  },
]

export const MOCK_INTEGRATION_LABELS = ["n8n", "github-actions", "cursor-mcp", "slack-bot"]

export const MOCK_ALERT_DETAILS = {
  id: "mock_alert_1",
  summary: "Security Incident: oauth_request anomaly from ci-runner-exploit-12",
  severity: "critical",
  status: "firing",
  timestamp: now() - 180,
  risk_score: 0.91,
  reasons: [
    { reason: "Wildcard scope (*) present in OAuth grant", risk_score: 0.35 },
    { reason: "Drive + Cloud Platform combined (blast radius)", risk_score: 0.32 },
    { reason: "New OAuth client ID not in allowlist", risk_score: 0.24 },
  ],
  evidence: [
    { description: "Grant payload mirrored Vercel-style over-permission pattern", risk_score: 0.4 },
    { description: "Source runner not in baseline inventory", risk_score: 0.28 },
  ],
  timeline: [
    { timestamp: now() - 200, event: "Event ingested" },
    { timestamp: now() - 195, event: "Detector: OAuth scope analysis" },
    { timestamp: now() - 190, event: "Gatekeeper: BLOCK verdict" },
  ],
  recommended_action: "Revoke grant, rotate tokens for affected project, add runner to inventory.",
}
