"use client"

import { useEffect, useState } from "react"
import { useDashboardStore } from "@/lib/store"
import { AlertCard } from "@/components/dashboard/AlertCard"
import { Shield, Activity, Zap, Lock, List, Terminal, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { API_BASE_URL, WS_BASE_URL } from "@/lib/constants"

export default function DashboardPage() {
  const { incidents, addIncident, setIncidents } = useDashboardStore()
  const [status, setStatus] = useState("connecting")

  useEffect(() => {
    // Fetch initial incidents
    fetch(`${API_BASE_URL}/api/v1/incidents`)
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
  }, [])

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans">
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
