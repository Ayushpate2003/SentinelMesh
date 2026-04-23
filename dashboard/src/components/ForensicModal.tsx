"use client"

import { X, Shield, Activity, Clock } from "lucide-react"
import { Badge } from "./ui/badge"
import { Button } from "./ui/button"

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
  signals: Signal[]
  timeline: { timestamp: number; event: string }[]
  affected_components: string[]
}

interface ForensicModalProps {
  incident: Incident
  onClose: () => void
}

export function ForensicModal({ incident, onClose }: ForensicModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <Shield className="text-primary w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold tracking-tight">FORENSIC_ANALYSIS</h2>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{incident.incident_id}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-12">
          {/* Summary Section */}
          <section>
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Incident Summary</h3>
              <Badge variant="outline" className={incident.severity === 'critical' ? 'border-red-500 text-red-500' : 'border-primary text-primary'}>
                {incident.severity.toUpperCase()}
              </Badge>
            </div>
            <p className="text-2xl font-semibold leading-tight">{incident.summary}</p>
            <div className="mt-4 flex gap-2">
              {incident.affected_components.map(comp => (
                <Badge key={comp} className="bg-white/5 text-white/60 hover:bg-white/10">
                  {comp}
                </Badge>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Signals Section */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Agent Signals
              </h3>
              <div className="space-y-4">
                {incident.signals.map(signal => (
                  <div key={signal.signal_id} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-primary uppercase">{signal.agent_name}</span>
                      <span className="text-[10px] font-mono opacity-50">Score: {signal.risk_score.toFixed(2)}</span>
                    </div>
                    <p className="text-sm">{signal.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Timeline Section */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Event Timeline
              </h3>
              <div className="space-y-6 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
                {incident.timeline.map((item, i) => (
                  <div key={i} className="pl-6 relative">
                    <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full bg-black border-2 border-primary" />
                    <span className="text-[10px] font-mono opacity-50 block mb-1">
                      {new Date(item.timestamp * 1000).toLocaleTimeString()}
                    </span>
                    <p className="text-sm font-medium">{item.event}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="p-6 border-t border-white/5 bg-white/[0.01] flex justify-end">
          <Button onClick={onClose} className="px-8 rounded-full">Close Report</Button>
        </div>
      </div>
    </div>
  )
}
