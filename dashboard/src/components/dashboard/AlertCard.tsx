import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShieldAlert, Clock } from "lucide-react"

const severityColors = {
  low: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  high: "border-orange-500/35 bg-orange-500/15 text-orange-300",
  critical: "border-red-500/40 bg-red-500/15 text-red-300",
}

export function AlertCard({ incident }: { incident: any }) {
  const incidentTime = incident.created_at ?? incident.timestamp
  const severity = String(incident.severity || "low").toLowerCase()
  const accent =
    severity === "critical"
      ? "before:bg-red-500"
      : severity === "high" || severity === "warning"
        ? "before:bg-amber-500"
        : "before:bg-blue-500"

  return (
    <Card className={`group relative mb-3 overflow-hidden border-white/10 bg-[#11161C]/85 text-[#E5E7EB] backdrop-blur-xl transition-all hover:translate-y-[-2px] hover:border-white/20 hover:shadow-[0_14px_40px_-20px_rgba(0,0,0,0.85)] before:absolute before:bottom-0 before:left-0 before:top-0 before:w-[3px] ${accent}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold tracking-tight text-[#E5E7EB]">
          {incident.incident_id}
        </CardTitle>
        <Badge variant="outline" className={severityColors[severity as keyof typeof severityColors] ?? severityColors.low}>
          {severity.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-base font-semibold leading-snug text-[#E5E7EB] transition-colors group-hover:text-white md:text-lg">
          {incident.summary}
        </div>
        <div className="flex items-center gap-4 text-xs text-[#9CA3AF]">
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
