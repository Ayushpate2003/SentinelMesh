import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, ShieldCheck, ShieldX, Clock } from "lucide-react"

const severityColors = {
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
}

export function AlertCard({ incident }: { incident: any }) {
  const incidentTime = incident.created_at ?? incident.timestamp
  return (
    <Card className="glass border-none mb-4 overflow-hidden group hover:scale-[1.01] transition-all text-white">
      <div className={`h-1 w-full ${incident.severity === 'critical' ? 'bg-red-500' : 'bg-primary'}`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold text-white/95">
          {incident.incident_id}
        </CardTitle>
        <Badge variant="outline" className={severityColors[incident.severity as keyof typeof severityColors]}>
          {incident.severity.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-base md:text-lg font-semibold mb-2 text-white/95 group-hover:text-primary transition-colors">
          {incident.summary}
        </div>
        <div className="flex items-center text-xs text-white/70 gap-4">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {incidentTime ? new Date(incidentTime * 1000).toLocaleTimeString() : "N/A"}
          </span>
          <span className="flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" />
            {(incident.signals || []).length} Signals
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
