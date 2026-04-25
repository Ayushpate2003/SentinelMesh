"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import Image from "next/image"
import { useDashboardStore } from "@/lib/store"
import { AlertCard } from "@/components/dashboard/AlertCard"
import { AdminThreatCharts } from "@/components/dashboard/AdminThreatCharts"
import {
  Shield,
  Activity,
  Zap,
  Lock,
  List,
  Terminal,
  Settings,
  Play,
  Square,
  AlertTriangle,
  LayoutDashboard,
  Waves,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getWsBaseUrl } from "@/lib/constants"
import { useRequireAuth } from "@/hooks/useRequireAuth"
import { apiFetch } from "@/lib/api"

/** Admin Attack Simulator — IDs must match `allowed_types` in `backend/main.py`. */
const ATTACK_SIMULATIONS: { id: string; label: string }[] = [
  { id: "oauth", label: "OAuth attack" },
  { id: "credential", label: "Credential sweep" },
  { id: "supply_chain", label: "Supply chain typosquat" },
  { id: "mcp", label: "MCP tool exfil" },
  { id: "webhook", label: "Webhook exfiltration" },
  { id: "maintainer", label: "Maintainer hijack" },
  { id: "agent_memory", label: "Agent memory dump" },
  { id: "prompt_injection", label: "Prompt injection" },
  { id: "data_exfiltration", label: "Data exfiltration" },
  { id: "privilege_escalation", label: "Privilege escalation" },
  { id: "ssrf", label: "SSRF attack" },
  { id: "token_replay", label: "Token replay attack" },
  { id: "ransomware", label: "Ransomware pattern" },
  { id: "dns_exfiltration", label: "DNS exfiltration" },
  { id: "container_escape", label: "Container escape" },
]

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
  const rootRef = useRef<HTMLDivElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const lastIncidentCountRef = useRef(0)

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-admin-card]",
        { autoAlpha: 0, y: 18, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.55,
          stagger: 0.055,
          ease: "power2.out",
          clearProps: "transform",
        },
      )
    }, root)
    return () => ctx.revert()
  }, [])

  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    if (lastIncidentCountRef.current === 0) {
      lastIncidentCountRef.current = incidents.length
      return
    }
    if (incidents.length > lastIncidentCountRef.current) {
      const first = feed.firstElementChild
      if (first) {
        gsap.fromTo(
          first,
          { autoAlpha: 0, y: -12, boxShadow: "0 0 0 rgba(255,45,45,0)" },
          {
            autoAlpha: 1,
            y: 0,
            boxShadow: "0 0 32px -16px rgba(255,45,45,0.55)",
            duration: 0.45,
            ease: "power2.out",
          },
        )
      }
    }
    lastIncidentCountRef.current = incidents.length
  }, [incidents])

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

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/incidents", label: "Incidents", icon: List },
    { href: "/audit-trail", label: "Audit", icon: Terminal },
    { href: "/settings", label: "Settings", icon: Settings },
  ]

  const criticalCount = incidents.filter((i) => String(i.severity).toLowerCase() === "critical").length
  const warningCount = incidents.filter((i) => ["high", "medium", "warning"].includes(String(i.severity).toLowerCase())).length

  return (
    <div ref={rootRef} className="relative min-h-screen bg-[#0B0F14] text-[#E5E7EB] sm-grid-bg">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,45,45,0.14),transparent_38%)]" />
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

      <div className="mx-auto flex min-h-screen w-full max-w-[1600px]">
        <aside className="sm-panel sm-primary-glow hidden w-[248px] shrink-0 border-r border-white/10 bg-[#11161C]/85 p-4 xl:sticky xl:top-4 xl:m-4 xl:block xl:h-[calc(100vh-2rem)]">
          <div className="mb-6">
            <Image src="/brand/admin-console-logo.png" alt="SentinelMesh" width={150} height={46} className="h-auto w-[150px]" priority />
            <p className="mt-2 sm-caption text-[#9CA3AF]">Runtime Security Observer</p>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${item.href === "/admin" ? "bg-[#FF2D2D]/15 text-[#E5E7EB]" : "text-[#9CA3AF] hover:bg-white/5 hover:text-[#E5E7EB]"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </a>
              )
            })}
          </nav>
          <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-3">
            <p className="sm-caption uppercase tracking-wider text-[#9CA3AF]">System status</p>
            <div className="mt-2 flex items-center gap-2 text-sm font-medium uppercase">
              <span
                className={`h-2 w-2 rounded-full ${
                  systemStatus === "connected"
                    ? "animate-pulse bg-[#22C55E]"
                    : systemStatus === "connecting"
                      ? "animate-pulse bg-[#F59E0B]"
                      : "bg-[#FF2D2D]"
                }`}
              />
              {systemStatus}
            </div>
          </div>
        </aside>

        <div className="w-full p-4 sm:p-6 xl:pr-6">
          <header className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="sm-h1">Admin Command Center</h1>
              <p className="mt-1 sm-body text-[#9CA3AF]">Real-time threat detection, policy enforcement, and simulation control.</p>
            </div>
            <a href="/dashboard/user" className="hidden rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-[#9CA3AF] transition hover:text-[#E5E7EB] md:block">
              Open User Dashboard
            </a>
          </header>

          <div data-admin-card className="mb-6">
            <AdminThreatCharts incidents={incidents} />
          </div>

          <main className="grid grid-cols-1 gap-5 xl:items-start xl:grid-cols-[320px_minmax(0,1fr)]">
            <section className="space-y-4">
              <div data-admin-card className="sm-panel p-4">
                <h2 className="sm-h3 mb-3">Active Agents</h2>
                <div className="space-y-2 sm-body text-[#9CA3AF]">
                  {["Detector", "Listener", "Gatekeeper", "Supervisor"].map((agent) => (
                    <div key={agent} className="flex items-center justify-between rounded-md bg-black/20 px-3 py-2">
                      <span className="text-[#E5E7EB]">{agent}</span>
                      <Badge variant="outline" className="border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]">
                        Active
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div data-admin-card className="sm-panel p-4">
                <h2 className="sm-h3 mb-3">Security Metrics</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                    <Activity className="mb-1 h-4 w-4 text-[#FF2D2D]" />
                    <p className="text-2xl font-bold">{incidents.length}</p>
                    <p className="sm-caption text-[#9CA3AF]">Total incidents</p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                    <Zap className="mb-1 h-4 w-4 text-[#F59E0B]" />
                    <p className="text-2xl font-bold">{Math.round(systemHealth.latency_p95_ms)}ms</p>
                    <p className="sm-caption text-[#9CA3AF]">P95 latency</p>
                  </div>
                </div>
              </div>

              <div data-admin-card className="sm-panel p-4">
                <h2 className="sm-h3 mb-3">System Health</h2>
                <div className="space-y-2 sm-body">
                  <div className="flex justify-between text-[#9CA3AF]"><span>Queue depth</span><span className="text-[#E5E7EB]">{systemHealth.queue_depth}</span></div>
                  <div className="flex justify-between text-[#9CA3AF]"><span>DLQ size</span><span className="text-[#E5E7EB]">{systemHealth.dlq_depth}</span></div>
                  <div className="flex justify-between text-[#9CA3AF]"><span>Workers healthy</span><span className="text-[#E5E7EB]">{systemHealth.workers_healthy}</span></div>
                  <div className="flex justify-between text-[#9CA3AF]"><span>P95 latency</span><span className="text-[#E5E7EB]">{Math.round(systemHealth.latency_p95_ms)}ms</span></div>
                </div>
              </div>

              <div data-admin-card className="sm-panel p-4">
                <h2 className="sm-h3 mb-3">Active Alerts</h2>
                <div className="space-y-2 sm-body">
                  {activeAlerts.length === 0 ? (
                    <p className="text-[#9CA3AF]">No active alerts</p>
                  ) : (
                    activeAlerts.slice(0, 5).map((alert, idx) => (
                      <div key={`${alert.name}-${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{severityEmoji(alert.severity)} {alert.name}</span>
                          <span className={`${alert.severity === "critical" ? "text-[#FF2D2D]" : "text-[#F59E0B]"} sm-caption uppercase`}>
                            {alert.severity}
                          </span>
                        </div>
                        <div className="mt-1 flex justify-between sm-caption text-[#9CA3AF]">
                          <span>{alert.status}</span>
                          <span>for {formatDuration(alert.duration_seconds)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => showToast("Acknowledge flow is planned in next sprint.", "success")}
                          className="mt-2 rounded border border-white/20 px-2 py-1 text-xs text-[#9CA3AF] transition hover:border-white/35 hover:text-[#E5E7EB]"
                        >
                          Acknowledge
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div data-admin-card className="sm-panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="sm-h3 flex items-center gap-2 text-[#F59E0B]">
                    <AlertTriangle className="h-4 w-4" /> Attack Simulator
                  </h2>
                  {runningTest && (
                    <button
                      type="button"
                      onClick={handleStopTests}
                      className="flex items-center gap-1 rounded bg-[#FF2D2D]/20 px-2 py-1 text-xs text-[#FF2D2D] transition hover:bg-[#FF2D2D]/30"
                    >
                      <Square className="h-3 w-3" /> Stop
                    </button>
                  )}
                </div>
                <div className="scrollbar-hide max-h-[26rem] space-y-2 overflow-y-auto pr-1">
                  {ATTACK_SIMULATIONS.map((test) => {
                    const isRunning = runningTest === test.id
                    const isBlocked = runningTest !== null && runningTest !== test.id
                    return (
                      <button
                        key={test.id}
                        type="button"
                        disabled={isBlocked}
                        onClick={() => handleRunTest(test.id)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                          isRunning
                            ? "border-[#F59E0B]/60 bg-[#F59E0B]/15 text-[#F59E0B]"
                            : isBlocked
                              ? "cursor-not-allowed border-white/5 bg-white/5 text-[#9CA3AF] opacity-50"
                              : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
                        }`}
                      >
                        <span className="sm-body font-medium">{test.label}</span>
                        {isRunning ? (
                          <span className="sm-caption animate-pulse uppercase tracking-wider">Running</span>
                        ) : isBlocked ? (
                          <span className="sm-caption uppercase tracking-wider text-[#FF2D2D]">Blocked</span>
                        ) : (
                          <Play className="h-4 w-4 opacity-70" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            <section data-admin-card className="sm-panel sm-primary-glow self-start overflow-hidden p-4 sm:p-5">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h2 className="sm-h2 flex items-center gap-2">
                    <Waves className="h-5 w-5 text-[#FF2D2D]" />
                    Live Threat Intelligence
                  </h2>
                  <p className="sm-caption mt-1 text-[#9CA3AF]">Primary feed · newest incidents stream to top</p>
                </div>
                <div className="text-right">
                  <p className="sm-caption text-[#9CA3AF]">Critical</p>
                  <p className="text-lg font-semibold text-[#FF2D2D]">{criticalCount}</p>
                </div>
                <div className="text-right">
                  <p className="sm-caption text-[#9CA3AF]">Warnings</p>
                  <p className="text-lg font-semibold text-[#F59E0B]">{warningCount}</p>
                </div>
              </div>

              <div
                ref={feedRef}
                className="scrollbar-hide h-[min(68vh,620px)] min-h-[320px] space-y-3 overflow-y-auto pr-2"
              >
                {incidents.length === 0 ? (
                  <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20">
                    <Lock className="mb-2 h-8 w-8 opacity-30" />
                    <p className="sm-body text-[#9CA3AF]">No threats detected. System secure.</p>
                  </div>
                ) : (
                  incidents.map((incident) => <AlertCard key={incident.incident_id} incident={incident} />)
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  )
}
