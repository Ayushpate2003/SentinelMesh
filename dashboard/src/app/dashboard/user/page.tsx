"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, AlertTriangle, Bot, Globe, Shield, Workflow } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { UserDashboardCharts } from "@/components/dashboard/UserDashboardCharts"
import { useRequireAuth } from "@/hooks/useRequireAuth"
import { apiFetch } from "@/lib/api"
import {
  MOCK_ALERT_DETAILS,
  MOCK_INTEGRATION_LABELS,
  MOCK_USER_ALERTS,
  MOCK_USER_AUTOMATIONS,
  MOCK_USER_INTEGRATIONS,
  MOCK_USER_RISK,
  MOCK_USER_SUMMARY,
  MOCK_USER_TIMELINE,
} from "@/lib/user-dashboard-mock-data"
import { getIntegrationService, INTEGRATION_SERVICES } from "@/lib/user-dashboard-integration-services"

type TimelineItem = {
  timestamp: number
  kind: "event" | "incident" | "audit"
  action: string
  system_response: string
  final_outcome: "ALLOW" | "BLOCK" | "QUEUE"
  reference_id: string
}

type Integration = {
  id: string
  name: string
  type: "n8n" | "api" | "chrome" | "mcp"
  endpoint: string
  enabled: boolean
  created_at: number
}

type UserAlert = {
  id: string
  severity: string
  severity_emoji: string
  status: string
  summary: string
  timestamp: number
  source?: string
}

type RiskData = { score: number; band: string; factors: Record<string, number> }
type Automation = {
  id: string
  name: string
  source: string
  timestamp: number
  status: "allowed" | "blocked" | "pending"
  ai_decision?: string
}
type Summary = { actions_today: number; blocked: number; warnings: number; safe: number }
type AlertPreferences = {
  email_enabled: boolean
  critical_only: boolean
  login_alerts: boolean
  automation_alerts: boolean
}
type AlertDetails = {
  id: string
  summary: string
  severity: string
  status: string
  timestamp: number
  risk_score: number
  reasons: Array<{ reason: string; risk_score: number }>
  evidence: Array<{ description: string; risk_score: number }>
  timeline: Array<{ timestamp: number; event: string }>
  recommended_action: string
}

function formatTime(ts: number) {
  return new Date((ts || 0) * 1000).toLocaleString()
}

function isSummaryEmpty(s: Summary) {
  return s.actions_today === 0 && s.blocked === 0 && s.warnings === 0 && s.safe === 0
}

function mockAlertsForFilter(severity: string): UserAlert[] {
  if (severity === "all") return MOCK_USER_ALERTS
  return MOCK_USER_ALERTS.filter((a) => a.severity === severity)
}

function mergeUserDashboardState(
  severityFilter: string,
  timelineData: { items?: TimelineItem[] },
  alertsData: { alerts?: UserAlert[] },
  riskData: { score?: number; band?: string; factors?: Record<string, number> },
  automationsData: {
    automations?: Automation[]
    summary?: Summary
    integrations?: string[]
  },
  integrationsData: { integrations?: Integration[] },
) {
  const apiTimeline = timelineData.items || []
  const apiAlerts = alertsData.alerts || []
  const apiAutomations = automationsData.automations || []
  const apiSummary = automationsData.summary || {
    actions_today: 0,
    blocked: 0,
    warnings: 0,
    safe: 0,
  }
  const apiIntegrationsList = automationsData.integrations || []
  const apiIntegrationsRows = integrationsData.integrations || []

  const timeline = apiTimeline.length > 0 ? apiTimeline : MOCK_USER_TIMELINE
  const alerts = apiAlerts.length > 0 ? apiAlerts : mockAlertsForFilter(severityFilter)
  const automations = apiAutomations.length > 0 ? apiAutomations : MOCK_USER_AUTOMATIONS
  const summary = isSummaryEmpty(apiSummary) ? MOCK_USER_SUMMARY : apiSummary
  const factors = riskData.factors || {}
  const risk: RiskData =
    (riskData.score ?? 0) > 0 || Object.keys(factors).length > 0
      ? { score: riskData.score ?? 0, band: riskData.band || "low", factors }
      : MOCK_USER_RISK
  const integrations = apiIntegrationsList.length > 0 ? apiIntegrationsList : MOCK_INTEGRATION_LABELS
  const integrationsRows = apiIntegrationsRows.length > 0 ? apiIntegrationsRows : MOCK_USER_INTEGRATIONS

  const usingMock =
    apiTimeline.length === 0 ||
    apiAlerts.length === 0 ||
    apiAutomations.length === 0 ||
    isSummaryEmpty(apiSummary) ||
    ((riskData.score ?? 0) === 0 && Object.keys(factors).length === 0) ||
    apiIntegrationsList.length === 0 ||
    apiIntegrationsRows.length === 0

  return {
    timeline,
    alerts,
    automations,
    summary,
    risk,
    integrations,
    integrationsRows,
    usingMock,
  }
}

export default function UserDashboardPage() {
  const { user, loading: authLoading, authorized } = useRequireAuth()
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [alerts, setAlerts] = useState<UserAlert[]>([])
  const [risk, setRisk] = useState<RiskData>({ score: 0, band: "low", factors: {} })
  const [automations, setAutomations] = useState<Automation[]>([])
  const [integrations, setIntegrations] = useState<string[]>([])
  const [summary, setSummary] = useState<Summary>({ actions_today: 0, blocked: 0, warnings: 0, safe: 0 })
  const [severityFilter, setSeverityFilter] = useState("all")
  const [selectedAlert, setSelectedAlert] = useState<UserAlert | null>(null)
  const [selectedAlertDetails, setSelectedAlertDetails] = useState<AlertDetails | null>(null)
  const [integrationsData, setIntegrationsData] = useState<Integration[]>([])
  const [integrationForm, setIntegrationForm] = useState({
    name: "",
    type: "n8n" as "n8n" | "api" | "chrome" | "mcp",
    endpoint: "",
    enabled: true,
  })
  const [aiQuery, setAiQuery] = useState("")
  const [aiResult, setAiResult] = useState<{ response: string; risk_score: number; recommendation: string } | null>(null)
  const [prefs, setPrefs] = useState<AlertPreferences>({
    email_enabled: true,
    critical_only: false,
    login_alerts: true,
    automation_alerts: true,
  })
  const [loading, setLoading] = useState(true)
  const [usingMockData, setUsingMockData] = useState(false)

  const load = async () => {
    const userQuery = new URLSearchParams()
    if (severityFilter !== "all") userQuery.set("severity", severityFilter)

    const [timelineRes, alertsRes, riskRes, automationsRes, integrationsRes, prefsRes] = await Promise.all([
      apiFetch(`/api/v1/user/timeline?page=1&limit=20`),
      apiFetch(`/api/v1/user/alerts?page=1&limit=20&${userQuery.toString()}`),
      apiFetch(`/api/v1/user/risk`),
      apiFetch(`/api/v1/user/automations?page=1&limit=20`),
      apiFetch(`/api/v1/user/integrations`),
      apiFetch(`/api/v1/user/alert-preferences`),
    ])

    const timelineData = await timelineRes.json()
    const alertsData = await alertsRes.json()
    const riskData = await riskRes.json()
    const automationsData = await automationsRes.json()
    const integrationsData = await integrationsRes.json()
    const prefsData = await prefsRes.json()

    const merged = mergeUserDashboardState(
      severityFilter,
      timelineData,
      alertsData,
      riskData,
      automationsData,
      integrationsData,
    )
    setTimeline(merged.timeline)
    setAlerts(merged.alerts)
    setRisk(merged.risk)
    setAutomations(merged.automations)
    setIntegrations(merged.integrations)
    setSummary(merged.summary)
    setIntegrationsData(merged.integrationsRows)
    setUsingMockData(merged.usingMock)
    setPrefs({
      email_enabled: Boolean(prefsData.email_enabled),
      critical_only: Boolean(prefsData.critical_only),
      login_alerts: Boolean(prefsData.login_alerts),
      automation_alerts: Boolean(prefsData.automation_alerts),
    })
  }

  useEffect(() => {
    if (!authorized) return
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [severityFilter, authorized])

  useEffect(() => {
    if (!authorized) return
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [severityFilter, authorized])

  useEffect(() => {
    if (!authorized || !user?.id) return
    let ws: WebSocket | null = null
    ws = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8002/ws/user/${user.id}`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg?.type === "ai_response" && msg?.payload) {
          setAiResult(msg.payload)
        }
      } catch {
        // no-op
      }
      load()
    }
    return () => {
      if (ws) ws.close()
    }
  }, [severityFilter, authorized, user?.id])

  const riskColor = useMemo(() => {
    if (risk.score >= 70) return "bg-red-500"
    if (risk.score >= 40) return "bg-yellow-500"
    return "bg-green-500"
  }, [risk.score])

  const selectedIntegrationService = useMemo(
    () => getIntegrationService(integrationForm.type),
    [integrationForm.type],
  )
  const IntegrationServiceIcon = selectedIntegrationService.icon

  if (authLoading || !authorized) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 md:p-8">
        <div className="mb-6 h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="space-y-2 rounded-xl border border-border p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      </div>
    )
  }

  const openAlertDetails = async (alert: UserAlert) => {
    setSelectedAlert(alert)
    if (alert.id.startsWith("mock_")) {
      setSelectedAlertDetails({ ...MOCK_ALERT_DETAILS, id: alert.id, summary: alert.summary, timestamp: alert.timestamp })
      return
    }
    const res = await apiFetch(`/api/v1/user/alerts/${alert.id}`)
    if (res.ok) setSelectedAlertDetails(await res.json())
  }

  const createIntegration = async () => {
    const res = await apiFetch("/api/v1/user/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(integrationForm),
    })
    if (!res.ok) return
    setIntegrationForm({ name: "", type: "n8n", endpoint: "", enabled: true })
    await load()
  }

  const removeIntegration = async (id: string) => {
    if (id.startsWith("mock_")) return
    const res = await apiFetch(`/api/v1/user/integrations/${id}`, { method: "DELETE" })
    if (!res.ok) return
    await load()
  }

  const askAi = async () => {
    if (!aiQuery.trim()) return
    const res = await apiFetch("/api/v1/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: aiQuery, context: { integrations: integrationsData.length } }),
    })
    if (!res.ok) return
    setAiResult(await res.json())
  }

  const savePrefs = async (next: AlertPreferences) => {
    setPrefs(next)
    await apiFetch("/api/v1/user/alert-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Security Dashboard</h1>
          <p className="text-muted-foreground">What you did and what SentinelMesh did in response.</p>
          {usingMockData && (
            <p className="mt-2 max-w-2xl text-xs text-amber-600/90 dark:text-amber-400/90">
              Sample data is shown where the API returned empty values — your live metrics will replace this once events
              exist for your account.
            </p>
          )}
        </div>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Actions Today</div><div className="text-2xl font-bold">{summary.actions_today}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Blocked</div><div className="text-2xl font-bold text-red-500">{summary.blocked}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Warnings</div><div className="text-2xl font-bold text-yellow-500">{summary.warnings}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Safe</div><div className="text-2xl font-bold text-green-500">{summary.safe}</div></CardContent></Card>
      </section>

      <UserDashboardCharts summary={summary} />

      <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Activity Timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-muted-foreground">Loading timeline...</p> : timeline.length === 0 ? <p className="text-muted-foreground">No activity yet.</p> : timeline.map((item) => (
              <div key={`${item.kind}-${item.reference_id}`} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</div>
                <div className="font-medium">{item.action}</div>
                <div className="text-sm text-muted-foreground">{item.system_response}</div>
                <Badge variant="outline" className="mt-2">{item.final_outcome}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Personal Risk Score</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-3 text-4xl font-bold">{risk.score}</div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${riskColor}`} style={{ width: `${risk.score}%` }} />
            </div>
            <div className="mt-2 text-xs uppercase text-muted-foreground">{risk.band} risk</div>
          </CardContent>
        </Card>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> My Alerts</CardTitle>
            <div className="flex gap-2">
              {["all", "critical", "high", "medium", "low"].map((s) => (
                <Button key={s} variant={severityFilter === s ? "default" : "outline"} size="sm" onClick={() => setSeverityFilter(s)}>{s}</Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 ? <p className="text-muted-foreground">No alerts for your account.</p> : alerts.map((a) => (
              <button key={a.id} className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/50" onClick={() => openAlertDetails(a)}>
                <div className="flex items-center justify-between">
                  <span>{a.severity_emoji} {a.summary}</span>
                  <Badge variant="outline">{a.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{formatTime(a.timestamp)}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="h-5 w-5" /> My Automations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {automations.length === 0 ? <p className="text-muted-foreground">No automation runs yet.</p> : automations.slice(0, 20).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">{a.source} • AI: {a.ai_decision || "ALLOW"} • {formatTime(a.timestamp)}</div>
                </div>
                <Badge variant="outline">{a.status === "allowed" ? "✅ Allowed" : a.status === "blocked" ? "🚫 Blocked" : "⚠️ Pending"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>🔌 Connect Automation</CardTitle>
            <CardDescription>
              Pick the kind of system you are wiring to SentinelMesh. Each option expects a different URL or identifier in
              the endpoint field — see the note below for your current selection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="integration-name">Automation name</Label>
                <Input
                  id="integration-name"
                  placeholder="e.g. Sales webhook prod"
                  value={integrationForm.name}
                  onChange={(e) => setIntegrationForm((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Service type</Label>
                <Select
                  value={integrationForm.type}
                  onValueChange={(value) => {
                    if (value === "n8n" || value === "api" || value === "chrome" || value === "mcp") {
                      setIntegrationForm((s) => ({ ...s, type: value }))
                    }
                  }}
                >
                  <SelectTrigger size="default" className="h-10 w-full min-w-0 max-w-full">
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent align="start" className="min-w-[var(--anchor-width)]">
                    {INTEGRATION_SERVICES.map((svc) => (
                      <SelectItem key={svc.type} value={svc.type}>
                        {svc.label} — {svc.summary}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="integration-endpoint">Endpoint URL or identifier</Label>
                <Input
                  id="integration-endpoint"
                  placeholder={selectedIntegrationService.endpointPlaceholder}
                  value={integrationForm.endpoint}
                  onChange={(e) => setIntegrationForm((s) => ({ ...s, endpoint: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={integrationForm.enabled}
                  onChange={(e) => setIntegrationForm((s) => ({ ...s, enabled: e.target.checked }))}
                />
                Enabled
              </label>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/40 p-4 text-sm">
              <p className="flex items-center gap-2 font-medium text-foreground">
                <IntegrationServiceIcon className="size-4 shrink-0 text-primary" aria-hidden />
                Using <span className="text-primary">{selectedIntegrationService.label}</span>
              </p>
              <p className="mt-2 leading-relaxed text-muted-foreground">{selectedIntegrationService.howUsersUseIt}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground/90">Endpoint field: </span>
                {selectedIntegrationService.endpointHelp}
              </p>
            </div>
            <Button onClick={createIntegration}>Save Integration</Button>
            <div className="space-y-2">
              {integrationsData.map((integration) => (
                <div key={integration.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <div className="font-medium">{integration.name}</div>
                    <div className="text-xs text-muted-foreground">{integration.type} • {integration.endpoint}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{integration.enabled ? "Enabled" : "Disabled"}</Badge>
                    <Button variant="outline" size="sm" onClick={() => removeIntegration(integration.id)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>📧 Alert Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex items-center justify-between"><span>Email Alerts</span><input type="checkbox" checked={prefs.email_enabled} onChange={(e) => savePrefs({ ...prefs, email_enabled: e.target.checked })} /></label>
            <label className="flex items-center justify-between"><span>Critical Only</span><input type="checkbox" checked={prefs.critical_only} onChange={(e) => savePrefs({ ...prefs, critical_only: e.target.checked })} /></label>
            <label className="flex items-center justify-between"><span>Login Alerts</span><input type="checkbox" checked={prefs.login_alerts} onChange={(e) => savePrefs({ ...prefs, login_alerts: e.target.checked })} /></label>
            <label className="flex items-center justify-between"><span>Automation Block Alerts</span><input type="checkbox" checked={prefs.automation_alerts} onChange={(e) => savePrefs({ ...prefs, automation_alerts: e.target.checked })} /></label>
          </CardContent>
        </Card>
      </section>

      <section className="mb-6">
        <Card>
          <CardHeader><CardTitle>🧠 Ask Sentinel AI</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <textarea
              className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm"
              placeholder="Why was my automation blocked?"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
            />
            <Button onClick={askAi}>Analyze</Button>
            {aiResult && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <div><strong>Response:</strong> {aiResult.response}</div>
                <div className="mt-1"><strong>Risk score:</strong> {aiResult.risk_score}</div>
                <div className="mt-1"><strong>Recommendation:</strong> {aiResult.recommendation}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader><CardTitle>Integrations Used</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {integrations.length === 0 ? <p className="text-muted-foreground">No integrations detected yet.</p> : integrations.map((item) => (
              <Badge key={item} variant="outline" className="px-3 py-1 text-sm">
                {item.includes("bot") ? <Bot className="mr-1 h-4 w-4" /> : item.includes("chrome") ? <Globe className="mr-1 h-4 w-4" /> : <Workflow className="mr-1 h-4 w-4" />}
                {item}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </section>

      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5">
            <h3 className="mb-2 text-lg font-semibold">{selectedAlert.severity_emoji} Alert Details</h3>
            <p className="mb-2">{selectedAlert.summary}</p>
            <p className="text-sm text-muted-foreground">Severity: {selectedAlert.severity}</p>
            <p className="text-sm text-muted-foreground">Status: {selectedAlert.status}</p>
            <p className="text-sm text-muted-foreground">Time: {formatTime(selectedAlert.timestamp)}</p>
            {selectedAlertDetails && (
              <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
                <div className="font-medium">Risk Score: {selectedAlertDetails.risk_score}</div>
                <div className="text-sm font-medium">Reasons</div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {selectedAlertDetails.reasons.map((r, idx) => (
                    <li key={idx}>{r.reason} (+{r.risk_score})</li>
                  ))}
                </ul>
                <div className="text-sm text-muted-foreground">Recommended: {selectedAlertDetails.recommended_action}</div>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button onClick={() => { setSelectedAlert(null); setSelectedAlertDetails(null) }}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
