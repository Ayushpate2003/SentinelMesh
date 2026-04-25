import type { LucideIcon } from "lucide-react"
import { Globe, Plug, Workflow, Wrench } from "lucide-react"

export type IntegrationServiceType = "n8n" | "api" | "chrome" | "mcp"

export type IntegrationServiceInfo = {
  type: IntegrationServiceType
  label: string
  shortLabel: string
  icon: LucideIcon
  /** One line for the dropdown. */
  summary: string
  /** How a typical user uses this with SentinelMesh. */
  howUsersUseIt: string
  /** What to paste in the endpoint field. */
  endpointHelp: string
  endpointPlaceholder: string
}

/** Order shown in the UI: n8n → API → MCP → Chrome. */
export const INTEGRATION_SERVICES: IntegrationServiceInfo[] = [
  {
    type: "n8n",
    label: "n8n",
    shortLabel: "n8n",
    icon: Workflow,
    summary: "Visual workflows & webhooks",
    howUsersUseIt:
      "Connect your self‑hosted or cloud n8n instance so SentinelMesh can see workflow runs, HTTP requests, and credential usage. Register the base URL or the specific workflow webhook you want monitored — same as pasting a webhook URL into an n8n “HTTP Request” node, but here it tells SentinelMesh where your automation lives.",
    endpointHelp: "Example: https://n8n.yourcompany.com/webhook/abc or your instance root if you use the SentinelMesh node.",
    endpointPlaceholder: "https://n8n.example.com/webhook/inbound-sales",
  },
  {
    type: "api",
    label: "API",
    shortLabel: "API",
    icon: Plug,
    summary: "Custom apps & backend services",
    howUsersUseIt:
      "Use this for your own REST or GraphQL services, microservices, or internal tools that emit events to SentinelMesh. Paste the base URL or the exact route that receives or forwards security events (for example the callback URL your backend posts to).",
    endpointHelp: "Example: https://api.yourproduct.com/v1/sentinelmesh/events",
    endpointPlaceholder: "https://api.mycompany.com/automation/callback",
  },
  {
    type: "mcp",
    label: "MCP",
    shortLabel: "MCP",
    icon: Wrench,
    summary: "Model Context Protocol (Cursor, Claude Desktop, …)",
    howUsersUseIt:
      "Register the MCP server endpoint your AI tools use (e.g. Cursor or Claude Desktop). SentinelMesh can then correlate tool calls, file reads, and outbound fetches with policy. Normal users add this once per workspace or per shared MCP server URL their team already uses.",
    endpointHelp: "Example: mcp://localhost:3847/sentinel or https://mcp.yourorg.dev/sse",
    endpointPlaceholder: "https://mcp.internal.example.com/sse",
  },
  {
    type: "chrome",
    label: "Chrome",
    shortLabel: "Chrome",
    icon: Globe,
    summary: "Browser extension & OAuth in the browser",
    howUsersUseIt:
      "Choose Chrome when the integration is the SentinelMesh browser extension or any Chrome‑based OAuth and browsing telemetry you want tied to your account. Paste the extension’s reported origin, dashboard link, or the redirect URL your security team configured.",
    endpointHelp: "Example: chrome-extension://<your-extension-id> or your OAuth redirect URI.",
    endpointPlaceholder: "https://chrome.sentinelmesh.io/callback",
  },
]

export function getIntegrationService(type: IntegrationServiceType): IntegrationServiceInfo {
  return INTEGRATION_SERVICES.find((s) => s.type === type) ?? INTEGRATION_SERVICES[0]
}
