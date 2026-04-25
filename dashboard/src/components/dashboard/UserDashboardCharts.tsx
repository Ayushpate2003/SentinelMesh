"use client"

import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

type Summary = { actions_today: number; blocked: number; warnings: number; safe: number }

const chartConfig = {
  value: { label: "Actions", color: "var(--chart-1)" },
} satisfies ChartConfig

const MIX_COLORS = ["var(--chart-2)", "var(--chart-4)", "var(--chart-1)"]

export function UserDashboardCharts({ summary }: { summary: Summary }) {
  const mixData = useMemo(
    () => [
      { name: "safe", label: "Safe", value: summary.safe },
      { name: "warnings", label: "Warnings", value: summary.warnings },
      { name: "blocked", label: "Blocked", value: summary.blocked },
    ],
    [summary.blocked, summary.safe, summary.warnings],
  )

  const loadBars = useMemo(
    () => [
      { name: "Today", value: summary.actions_today },
      { name: "Blocked", value: summary.blocked },
      { name: "Warnings", value: summary.warnings },
    ],
    [summary.actions_today, summary.blocked, summary.warnings],
  )

  const loadFills = ["var(--chart-3)", "var(--chart-1)", "var(--chart-4)"] as const

  return (
    <section className="mb-6 grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Automation outcomes</CardTitle>
          <CardDescription>Today&apos;s blocked / warnings / safe runs</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={chartConfig} className="h-[200px] w-full max-w-full">
            <BarChart accessibilityLayer data={mixData} layout="vertical" margin={{ left: 16, right: 12 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="label"
                width={72}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                {mixData.map((_, i) => (
                  <Cell key={i} fill={MIX_COLORS[i % MIX_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity load</CardTitle>
          <CardDescription>Total actions today vs policy outcomes</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={chartConfig} className="h-[200px] w-full max-w-full">
            <BarChart accessibilityLayer data={loadBars} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                {loadBars.map((_, i) => (
                  <Cell key={loadBars[i].name} fill={loadFills[i % loadFills.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </section>
  )
}
