"use client"

import { useEffect, useState } from "react"
import { useDashboardStore } from "@/lib/store"
import { AlertCard } from "@/components/dashboard/AlertCard"
import { Shield, Activity, Zap, Lock, List, Terminal, Settings, Play, Square, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { API_BASE_URL, WS_BASE_URL } from "@/lib/constants"
import { useRequireAuth } from "@/hooks/useRequireAuth"
import { apiFetch } from "@/lib/api"

export default function DashboardPage() {
  const { loading: authLoading, authorized } = useRequireAuth("ADMIN")
  const { incidents, addIncident, setIncidents } = useDashboardStore()
  const [status, setStatus] = useState("connecting")
  const [runningTest, setRunningTest] = useState<string | null>(null)
  const [toast, setToast] = useState<{message: string, type: 'success'|'error'} | null>(null)
  const [systemHealth, setSystemHealth] = useState({
    queue_depth: 0,
    dlq_depth: 0,
    workers_healthy: 0,
    latency_p95_ms: 0,
  })
  const [activeAlerts, setActiveAlerts] = useState<Array<{name: string, severity: string, component: string, status: string, duration_seconds?: number, summary?: string}>>([])

  const showToast = (message: string, type: 'success'|'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const handleRunTest = async (type: string) => {
    try {
      setRunningTest(type)
      const res = await apiFetch(`/api/v1/run-test/${type}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        showToast(`Started ${type} simulation`, 'success')
      } else {
        showToast(data.detail || 'Failed to start simulation', 'error')
        setRunningTest(null)
      }
    } catch (err) {
      showToast('Network error while starting simulation', 'error')
      setRunningTest(null)
    }
  }

  const handleStopTests = async () => {
    try {
      const res = await apiFetch(`/api/v1/stop-tests`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        showToast(`Stopped simulations: ${data.stopped_tests.join(', ') || 'None'}`, 'success')
        setRunningTest(null)
      } else {
        showToast(data.detail || 'Failed to stop simulations', 'error')
      }
    } catch (err) {
      showToast('Network error while stopping simulations', 'error')
    }
  }

  useEffect(() => {
    if (!authorized) return

    // Fetch initial incidents
    apiFetch(`/api/v1/incidents`)
      .then(res => res.json())
      .then(data => setIncidents(data))
      .catch(err => console.error("Failed to fetch incidents", err))

    // Connect to WebSocket
    const ws = new WebSocket(`${WS_BASE_URL}/ws/alerts`)
    
    ws.onopen = () => setStatus("connected")
    ws.onmessage = (event) => {
      const incident = JSON.parse(event.data)
      addIncident(incident)
    }
    ws.onclose = () => setStatus("disconnected")

    return () => ws.close()
  }, [authorized])

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
        .then((res) => res.json())
        .then((data) => {
          setSystemHealth({
            queue_depth: data.queue_depth ?? 0,
            dlq_depth: data.dlq_depth ?? 0,
            workers_healthy: data.workers_healthy ?? 0,
            latency_p95_ms: data.latency_p95_ms ?? 0,
          })
        })
        .catch(() => {})
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 5000)
    return () => clearInterval(interval)
  }, [authorized])

  if (authLoading || !authorized) {
    return (
      <div className="min-h-screen bg-background text-foreground p-8">
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
    <div className="min-h-screen bg-background text-foreground p-8 font-sans relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full border ${toast.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-red-500/20 border-red-500/50 text-red-400'} backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-top-4`}>
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter flex items-center gap-2">
            <Shield className="text-primary w-10 h-10" />
            SENTINEL<span className="text-primary">MESH</span>
          </h1>
          <p className="text-muted-foreground mt-1 uppercase tracking-widest text-xs">Runtime Security Observer</p>
        </div>
        <div className="flex items-center gap-8">
          <nav className="hidden md:flex items-center gap-6 text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
            <a href="/dashboard/user" className="hover:text-primary transition-colors flex items-center gap-2">
              <Shield className="w-3 h-3" /> My Dashboard
            </a>
            <a href="/incidents" className="hover:text-primary transition-colors flex items-center gap-2">
              <List className="w-3 h-3" /> Incidents
            </a>
            <a href="/audit-trail" className="hover:text-primary transition-colors flex items-center gap-2">
              <Terminal className="w-3 h-3" /> Audit
            </a>
            <a href="/settings" className="hover:text-primary transition-colors flex items-center gap-2">
              <Settings className="w-3 h-3" /> Settings
            </a>
          </nav>
          <div className="text-right">
            <div className="text-xs text-muted-foreground uppercase">System Status</div>
            <div className="flex items-center gap-2 justify-end">
              <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="font-mono text-sm uppercase">{status}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Stats & Status */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl">
            <h2 className="text-sm font-semibold uppercase tracking-wider mb-4 opacity-50">Active Agents</h2>
            <div className="space-y-4">
              {['Detector', 'Listener', 'Gatekeeper', 'Supervisor'].map(agent => (
                <div key={agent} className="flex justify-between items-center">
                  <span className="text-sm">{agent}</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-6 rounded-2xl">
             <h2 className="text-sm font-semibold uppercase tracking-wider mb-4 opacity-50">Security Metrics</h2>
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                  <Activity className="w-4 h-4 text-primary mb-2" />
                  <div className="text-2xl font-bold">{incidents.length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Total Incidents</div>
                </div>
                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                  <Zap className="w-4 h-4 text-yellow-500 mb-2" />
                  <div className="text-2xl font-bold">12ms</div>
                  <div className="text-[10px] text-muted-foreground uppercase">Avg Latency</div>
                </div>
             </div>
          </div>

          <div className="glass p-6 rounded-2xl border-primary/20">
             <h2 className="text-sm font-semibold uppercase tracking-wider mb-4 opacity-80">System Health</h2>
             <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Queue Depth</span><span>{systemHealth.queue_depth}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">DLQ Size</span><span>{systemHealth.dlq_depth}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Workers Healthy</span><span>{systemHealth.workers_healthy}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">P95 Latency</span><span>{Math.round(systemHealth.latency_p95_ms)}ms</span></div>
             </div>
          </div>

          <div className="glass p-6 rounded-2xl border-red-500/20">
             <h2 className="text-sm font-semibold uppercase tracking-wider mb-4 opacity-80">Active Alerts</h2>
             <div className="space-y-2 text-sm">
               {activeAlerts.length === 0 ? (
                 <div className="text-muted-foreground">No active alerts</div>
               ) : (
                 activeAlerts.slice(0, 5).map((alert, idx) => (
                   <div key={`${alert.name}-${idx}`} className="border border-white/10 rounded-lg p-2">
                     <div className="flex justify-between gap-2">
                       <span className="truncate">{severityEmoji(alert.severity)} {alert.name}</span>
                       <span className={`${alert.severity === "critical" ? "text-red-400" : "text-yellow-400"} uppercase`}>{alert.severity}</span>
                     </div>
                     <div className="text-xs text-muted-foreground mt-1 flex justify-between">
                       <span>{alert.status}</span>
                       <span>for {formatDuration(alert.duration_seconds)}</span>
                     </div>
                     <button className="mt-2 text-xs border border-white/20 rounded px-2 py-1 opacity-60 cursor-not-allowed" disabled>
                       Acknowledge (planned)
                     </button>
                   </div>
                 ))
               )}
             </div>
          </div>

          {/* Attack Simulator Controls */}
          <div className="glass p-6 rounded-2xl border-orange-500/20">
             <div className="flex justify-between items-center mb-4">
               <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-2">
                 <AlertTriangle className="w-4 h-4" /> Attack Simulator
               </h2>
               {runningTest && (
                 <button 
                   onClick={handleStopTests}
                   className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                 >
                   <Square className="w-3 h-3" /> Stop
                 </button>
               )}
             </div>
             <div className="space-y-3">
               {[
                 { id: 'oauth', label: 'OAuth Attack', color: 'blue' },
                 { id: 'credential', label: 'Cred Dump', color: 'red' },
                 { id: 'supply_chain', label: 'Supply Chain', color: 'purple' }
               ].map(test => (
                 <button 
                   key={test.id}
                   disabled={runningTest !== null && runningTest !== test.id}
                   onClick={() => handleRunTest(test.id)}
                   className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                     runningTest === test.id 
                       ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' 
                       : runningTest !== null
                         ? 'bg-white/5 border-white/5 opacity-50 cursor-not-allowed'
                         : 'bg-white/5 border-white/10 hover:bg-white/10'
                   }`}
                 >
                   <span className="text-sm font-medium">{test.label}</span>
                   {runningTest === test.id ? (
                     <span className="text-xs uppercase tracking-wider animate-pulse flex items-center gap-1">Running...</span>
                   ) : (
                     <Play className="w-4 h-4 opacity-50" />
                   )}
                 </button>
               ))}
             </div>
          </div>
        </div>

        {/* Center/Right Column: Live Feed */}
        <div className="lg:col-span-2">
           <div className="flex justify-between items-end mb-6">
              <h2 className="text-2xl font-bold tracking-tight">Live Threat Intelligence</h2>
              <div className="text-xs text-muted-foreground">Showing last 50 events</div>
           </div>
           
           <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-4 scrollbar-hide">
              {incidents.length === 0 ? (
                <div className="glass h-40 flex flex-col items-center justify-center rounded-2xl border-dashed">
                  <Lock className="w-8 h-8 opacity-20 mb-2" />
                  <p className="text-sm opacity-50">No threats detected. System secure.</p>
                </div>
              ) : (
                incidents.map((incident) => (
                  <AlertCard key={incident.incident_id} incident={incident} />
                ))
              )}
           </div>
        </div>
      </main>
    </div>
  )
}
