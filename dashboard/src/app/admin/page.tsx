"use client"

import { useEffect, useMemo, useState } from "react"
import { useDashboardStore } from "@/lib/store"
import { AlertCard } from "@/components/dashboard/AlertCard"
import { Shield, Activity, Zap, Lock, List, Terminal, Settings, Play, Square, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getWsBaseUrl } from "@/lib/constants"
import { useRequireAuth } from "@/hooks/useRequireAuth"
import { apiFetch } from "@/lib/api"

export default function AdminConsolePage() {
  const { loading: authLoading, authorized } = useRequireAuth("ADMIN")
  const { incidents, addIncident, setIncidents } = useDashboardStore()
  /** null = not checked yet; REST health is the source of truth for “connected”. */
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null)
  const [wsLive, setWsLive] = useState(false)

  const systemStatus = useMemo(() => {
    if (apiHealthy === true || wsLive) return "connected"
    if (apiHealthy === false && !wsLive) return "disconnected"
    return "connecting"
  }, [apiHealthy, wsLive])
  const [runningTest, setRunningTest] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)
  const [systemHealth, setSystemHealth] = useState({
    queue_depth: 0,
    dlq_depth: 0,
    workers_healthy: 0,
    latency_p95_ms: 0,
  })
  const [activeAlerts, setActiveAlerts] = useState<
    Array<{
      name: string
      severity: string
      component: string
      status: string
      duration_seconds?: number
      summary?: string
    }>
  >([])

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleRunTest = async (type: string) => {
    try {
      setRunningTest(type)
      const res = await apiFetch(`/api/v1/run-test/${type}`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        showToast(`Started ${type} simulation`, "success")
      } else {
        showToast(data.detail || "Failed to start simulation", "error")
        setRunningTest(null)
      }
    } catch {
      showToast("Network error while starting simulation", "error")
      setRunningTest(null)
    }
  }

  const handleStopTests = async () => {
    try {
      const res = await apiFetch(`/api/v1/stop-tests`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        showToast(`Stopped simulations: ${data.stopped_tests.join(", ") || "None"}`, "success")
        setRunningTest(null)
      } else {
        showToast(data.detail || "Failed to stop simulations", "error")
      }
    } catch {
      showToast("Network error while stopping simulations", "error")
    }
  }

  useEffect(() => {
    if (!authorized) return

    apiFetch(`/api/v1/incidents`)
      .then((res) => res.json())
      .then((data) => setIncidents(data))
      .catch((err) => console.error("Failed to fetch incidents", err))

    let stopped = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleReconnect = () => {
      if (stopped) return
      clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(connect, 2500)
    }

    function connect() {
      if (stopped) return
      setWsLive(false)
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
      ws = new WebSocket(`${getWsBaseUrl()}/ws/alerts`)
      ws.onopen = () => setWsLive(true)
      ws.onmessage = (event) => {
        try {
          const incident = JSON.parse(event.data)
          addIncident(incident)
        } catch {
          /* ignore malformed payloads */
        }
      }
      ws.onclose = () => {
        if (stopped) return
        setWsLive(false)
        scheduleReconnect()
      }
      ws.onerror = () => {
        try {
          ws?.close()
        } catch {
          /* ignore */
        }
      }
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(reconnectTimer)
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
    }
  }, [authorized, addIncident, setIncidents])

  const severityEmoji = (severity: string) => {
    if (severity === "critical") return "🔴"
    if (severity === "warning") return "🟠"
    return "🔵"
  }

  const formatDuration = (seconds?: number) => {
    const s = seconds ?? 0
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${m}m ${rem}s`
  }

  useEffect(() => {
    if (!authorized) return
    const fetchAlerts = () => {
      apiFetch(`/api/v1/system/alerts`)
        .then((res) => res.json())
        .then((data) => setActiveAlerts(Array.isArray(data.alerts) ? data.alerts : []))
        .catch(() => setActiveAlerts([]))
    }
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 10000)
    return () => clearInterval(interval)
  }, [authorized])

  useEffect(() => {
    if (!authorized) return
    const fetchHealth = () => {
      apiFetch(`/api/v1/system/health`)
        .then(async (res) => {
          if (!res.ok) {
            setApiHealthy(false)
            return
          }
          setApiHealthy(true)
          const data = await res.json()
          setSystemHealth({
            queue_depth: data.queue_depth ?? 0,
            dlq_depth: data.dlq_depth ?? 0,
            workers_healthy: data.workers_healthy ?? 0,
            latency_p95_ms: data.latency_p95_ms ?? 0,
          })
        })
        .catch(() => {
          setApiHealthy(false)
        })
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 5000)
    return () => clearInterval(interval)
  }, [authorized])

  if (authLoading || !authorized) {
    return (
      <div className="min-h-screen bg-background p-8 text-foreground">
        <div className="mb-6 h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="space-y-2 rounded-xl border border-border p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-background p-8 font-sans text-foreground">
      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-md animate-in fade-in slide-in-from-top-4 ${
            toast.type === "success"
              ? "border-green-500/50 bg-green-500/20 text-green-400"
              : "border-red-500/50 bg-red-500/20 text-red-400"
          }`}
        >
          {toast.type === "error" && <AlertTriangle className="h-4 w-4" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <header className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-4xl font-bold tracking-tighter">
            <Shield className="h-10 w-10 text-primary" />
            SENTINEL<span className="text-primary">MESH</span>
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">Runtime Security Observer</p>
        </div>
        <div className="flex items-center gap-8">
          <nav className="hidden items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:flex">
            <a href="/dashboard/user" className="flex items-center gap-2 transition-colors hover:text-primary">
              <Shield className="h-3 w-3" /> My Dashboard
            </a>
            <a href="/incidents" className="flex items-center gap-2 transition-colors hover:text-primary">
              <List className="h-3 w-3" /> Incidents
            </a>
            <a href="/audit-trail" className="flex items-center gap-2 transition-colors hover:text-primary">
              <Terminal className="h-3 w-3" /> Audit
            </a>
            <a href="/settings" className="flex items-center gap-2 transition-colors hover:text-primary">
              <Settings className="h-3 w-3" /> Settings
            </a>
          </nav>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground">System Status</div>
            <div className="flex items-center justify-end gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  systemStatus === "connected"
                    ? "animate-pulse bg-green-500"
                    : systemStatus === "connecting"
                      ? "animate-pulse bg-amber-500"
                      : "bg-red-500"
                }`}
              />
              <span className="font-mono text-sm uppercase">{systemStatus}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-50">Active Agents</h2>
            <div className="space-y-4">
              {["Detector", "Listener", "Gatekeeper", "Supervisor"].map((agent) => (
                <div key={agent} className="flex items-center justify-between">
                  <span className="text-sm">{agent}</span>
                  <Badge variant="outline" className="border-green-500/20 bg-green-500/10 text-green-500">
                    Active
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="glass rounded-2xl p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-50">Security Metrics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Activity className="mb-2 h-4 w-4 text-primary" />
                <div className="text-2xl font-bold">{incidents.length}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Total Incidents</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Zap className="mb-2 h-4 w-4 text-yellow-500" />
                <div className="text-2xl font-bold">12ms</div>
                <div className="text-[10px] uppercase text-muted-foreground">Avg Latency</div>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl border-primary/20 p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-80">System Health</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Queue Depth</span>
                <span>{systemHealth.queue_depth}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DLQ Size</span>
                <span>{systemHealth.dlq_depth}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Workers Healthy</span>
                <span>{systemHealth.workers_healthy}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">P95 Latency</span>
                <span>{Math.round(systemHealth.latency_p95_ms)}ms</span>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl border-red-500/20 p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider opacity-80">Active Alerts</h2>
            <div className="space-y-2 text-sm">
              {activeAlerts.length === 0 ? (
                <div className="text-muted-foreground">No active alerts</div>
              ) : (
                activeAlerts.slice(0, 5).map((alert, idx) => (
                  <div key={`${alert.name}-${idx}`} className="rounded-lg border border-white/10 p-2">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">
                        {severityEmoji(alert.severity)} {alert.name}
                      </span>
                      <span className={`uppercase ${alert.severity === "critical" ? "text-red-400" : "text-yellow-400"}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span>{alert.status}</span>
                      <span>for {formatDuration(alert.duration_seconds)}</span>
                    </div>
                    <button
                      type="button"
                      className="mt-2 cursor-not-allowed rounded border border-white/20 px-2 py-1 text-xs opacity-60"
                      disabled
                    >
                      Acknowledge (planned)
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass rounded-2xl border-orange-500/20 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-orange-400">
                <AlertTriangle className="h-4 w-4" /> Attack Simulator
              </h2>
              {runningTest && (
                <button
                  type="button"
                  onClick={handleStopTests}
                  className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/30"
                >
                  <Square className="h-3 w-3" /> Stop
                </button>
              )}
            </div>
            <div className="space-y-3">
              {[
                { id: "oauth", label: "OAuth Attack", color: "blue" },
                { id: "credential", label: "Cred Dump", color: "red" },
                { id: "supply_chain", label: "Supply Chain", color: "purple" },
              ].map((test) => (
                <button
                  key={test.id}
                  type="button"
                  disabled={runningTest !== null && runningTest !== test.id}
                  onClick={() => handleRunTest(test.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 transition-all ${
                    runningTest === test.id
                      ? "border-orange-500/50 bg-orange-500/20 text-orange-400"
                      : runningTest !== null
                        ? "cursor-not-allowed border-white/5 bg-white/5 opacity-50"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className="text-sm font-medium">{test.label}</span>
                  {runningTest === test.id ? (
                    <span className="flex animate-pulse items-center gap-1 text-xs uppercase tracking-wider">Running...</span>
                  ) : (
                    <Play className="h-4 w-4 opacity-50" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Live Threat Intelligence</h2>
            <div className="text-xs text-muted-foreground">Showing last 50 events</div>
          </div>

          <div className="scrollbar-hide max-h-[70vh] space-y-4 overflow-y-auto pr-4">
            {incidents.length === 0 ? (
              <div className="glass flex h-40 flex-col items-center justify-center rounded-2xl border-dashed">
                <Lock className="mb-2 h-8 w-8 opacity-20" />
                <p className="text-sm opacity-50">No threats detected. System secure.</p>
              </div>
            ) : (
              incidents.map((incident) => <AlertCard key={incident.incident_id} incident={incident} />)
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
