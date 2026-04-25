"use client"

import { useMemo } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type IncidentLike = {
  severity?: string
  timestamp?: number
  created_at?: number
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const

const SEVERITY_FILL: Record<string, string> = {
  critical: "hsl(0 72% 51%)",
  high: "hsl(25 95% 53%)",
  medium: "hsl(45 93% 47%)",
  low: "hsl(217 91% 60%)",
}

const chartConfig = {
  total: { label: "Incidents", color: "var(--chart-1)" },
  count: { label: "Count", color: "var(--chart-1)" },
} satisfies ChartConfig

function bucketLast12h(incidents: IncidentLike[]) {
  const buckets = 12
  const now = Date.now() / 1000
  const arr = Array.from({ length: buckets }, (_, i) => ({
    slot: `${buckets - 1 - i}h`,
    count: 0,
  }))
  for (const inc of incidents) {
    const t = inc.timestamp ?? inc.created_at ?? now
    const hoursAgo = Math.floor((now - t) / 3600)
    if (hoursAgo < 0 || hoursAgo >= buckets) continue
    const idx = buckets - 1 - hoursAgo
    if (idx >= 0 && idx < buckets) arr[idx].count += 1
  }
  return arr
}

export function AdminThreatCharts({ incidents }: { incidents: IncidentLike[] }) {
  const severityData = useMemo(() => {
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const inc of incidents) {
      const s = String(inc.severity ?? "low").toLowerCase()
      if (s in counts) counts[s] += 1
      else counts.low += 1
    }
    return SEVERITY_ORDER.map((severity) => ({
      severity,
      total: counts[severity] ?? 0,
    }))
  }, [incidents])

  const volumeData = useMemo(() => bucketLast12h(incidents), [incidents])

  return (
    <section className="mb-8 grid gap-6 lg:grid-cols-2">
      <Card className="glass border-white/10 bg-white/[0.02]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Incidents by severity</CardTitle>
          <CardDescription>Live store — last 50 incidents</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={chartConfig} className="h-[220px] w-full max-w-full">
            <BarChart accessibilityLayer data={severityData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis
                dataKey="severity"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => String(v).toUpperCase()}
                className="text-[10px] uppercase"
              />
              <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {severityData.map((row) => (
                  <Cell key={row.severity} fill={SEVERITY_FILL[row.severity] ?? "var(--chart-3)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="glass border-white/10 bg-white/[0.02]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Incident volume</CardTitle>
          <CardDescription>Counts per hour bucket (rolling 12h)</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={chartConfig} className="h-[220px] w-full max-w-full">
            <AreaChart accessibilityLayer data={volumeData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="slot" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} interval={1} />
              <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                fill="var(--color-count)"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </section>
  )
}
