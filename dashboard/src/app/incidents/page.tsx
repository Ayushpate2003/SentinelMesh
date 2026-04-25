"use client"

import { useEffect, useState } from "react"
import { Shield, Filter, ArrowUpDown, ChevronRight, AlertTriangle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ForensicModal } from "@/components/ForensicModal"
import { apiFetch } from "@/lib/api"

interface Signal {
  signal_id: string
  agent_name: string
  severity: string
  description: string
  risk_score: number
}

interface Incident {
  incident_id: string
  summary: string
  severity: string
  status: string
  created_at: number
  signals: Signal[]
  timeline: { timestamp: number; event: string }[]
  affected_components: string[]
}

const severityColors = {
  low: "border-blue-500/20 text-blue-500 bg-blue-500/5",
  medium: "border-yellow-500/20 text-yellow-500 bg-yellow-500/5",
  high: "border-orange-500/20 text-orange-500 bg-orange-500/5",
  critical: "border-red-500/20 text-red-500 bg-red-500/5",
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)

  useEffect(() => {
    apiFetch(`/api/v1/incidents`)
      .then(res => res.json())
      .then(data => {
        setIncidents(data)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch incidents", err)
        setLoading(false)
      })
  }, [])

  const handleAction = async (id: string, action: 'approve' | 'block') => {
    try {
      const res = await apiFetch(`/api/v1/${action}/${id}`, { method: 'POST' })
      if (res.ok) {
        // Refresh incidents
        const updated = incidents.map(inc => 
          inc.incident_id === id ? { ...inc, status: action === 'approve' ? 'approved' : 'blocked' } : inc
        )
        setIncidents(updated)
      }
    } catch (err) {
      console.error(`Failed to ${action} incident`, err)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter flex items-center gap-2">
            <AlertTriangle className="text-primary w-8 h-8" />
            INCIDENT_ARCHIVE
          </h1>
          <p className="text-muted-foreground mt-1 uppercase tracking-widest text-[10px]">Historical Security Data & Forensic Records</p>
        </div>
        <a href="/admin" className="text-xs hover:text-primary transition-colors">← RETURN_TO_DASHBOARD</a>
      </header>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-muted-foreground uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-6 font-medium">Incident ID</th>
                <th className="p-6 font-medium">Summary</th>
                <th className="p-6 font-medium">Severity</th>
                <th className="p-6 font-medium">Status</th>
                <th className="p-6 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground animate-pulse">Scanning archives...</td>
                </tr>
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-muted-foreground">No incidents archived.</td>
                </tr>
              ) : (
                incidents.map((incident) => (
                  <tr key={incident.incident_id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-6 font-mono text-xs opacity-70">{incident.incident_id}</td>
                    <td className="p-6 font-medium">{incident.summary}</td>
                    <td className="p-6">
                      <Badge variant="outline" className={severityColors[incident.severity as keyof typeof severityColors]}>
                        {incident.severity.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-6">
                      <Badge className={
                        incident.status === 'blocked' ? 'bg-red-500' : 
                        incident.status === 'approved' ? 'bg-green-500' : 'bg-white/10'
                      }>
                        {incident.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-6">
                      <div className="flex gap-2 text-right">
                        {incident.status === 'active' && (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[10px] uppercase border-green-500/50 hover:bg-green-500/10"
                              onClick={() => handleAction(incident.incident_id, 'approve')}
                            >
                              Approve
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 text-[10px] uppercase border-red-500/50 hover:bg-red-500/10"
                              onClick={() => handleAction(incident.incident_id, 'block')}
                            >
                              Block
                            </Button>
                          </>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 px-2 flex items-center gap-1 text-[10px] uppercase hover:bg-white/10"
                          onClick={() => setSelectedIncident(incident)}
                        >
                          View Report
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedIncident && (
        <ForensicModal 
          incident={selectedIncident} 
          onClose={() => setSelectedIncident(null)} 
        />
      )}
    </div>
  )
}
