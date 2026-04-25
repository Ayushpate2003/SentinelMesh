"use client"

import { useEffect, useState } from "react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"
import { cn } from "@/lib/utils"

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

const rows = ["OAuth scope escalation", "Credential exfiltration attempt", "Supply chain anomaly"]

export function DashboardPreviewSection({ reduceMotion, narrow }: Props) {
  const [risk, setRisk] = useState(78)
  const [alerts, setAlerts] = useState(12)
  const [incidents, setIncidents] = useState(3)
  const [tick, setTick] = useState(0)

  const live = !reduceMotion && !narrow

  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      setRisk((r) => {
        const n = r + (Math.random() > 0.5 ? 1 : -1)
        return Math.min(92, Math.max(68, n))
      })
      setAlerts((a) => {
        const n = a + (Math.random() > 0.65 ? (Math.random() > 0.5 ? 1 : -1) : 0)
        return Math.min(18, Math.max(8, n))
      })
      setIncidents((i) => {
        const n = i + (Math.random() > 0.85 ? (Math.random() > 0.5 ? 1 : -1) : 0)
        return Math.min(5, Math.max(1, n))
      })
    }, 2200)
    return () => window.clearInterval(id)
  }, [live])

  return (
    <SectionShell className="py-14 sm:py-18">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
        <div data-landing-reveal>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">Live command center</h2>
          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            Incidents, alerts, and risk scoring in one glass cockpit — built for operators who cannot afford blind spots.
          </p>
          <p className="mt-6 text-sm font-medium text-white/90">
            Global teams secure <span className="text-[#FF2D2D]">10K+</span> automations
          </p>
        </div>
        <div data-landing-reveal data-landing-parallax className="relative will-change-transform [transform:translateZ(0)]">
          <div
            className="pointer-events-none absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#FF2D2D]/25 via-[#FF2D2D]/10 to-transparent blur-2xl will-change-[opacity,transform] [transform:translateZ(0)]"
            aria-hidden
          />
          <div className={cn("relative", !reduceMotion && !narrow && "landing-preview-float")}>
            <GlassPanel className="landing-scanline relative overflow-hidden border-white/[0.1] p-4 sm:p-5">
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-t from-[#FF2D2D]/12 via-transparent to-transparent [transform:translateZ(0)]" aria-hidden />
              <div className="relative flex items-center justify-between border-b border-white/[0.06] pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Preview</span>
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">Live</span>
              </div>
              <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Risk score</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-[#FF2D2D] tabular-nums">{risk}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">24h window</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Alerts</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">{alerts}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">Open</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Incidents</p>
                  <p className="mt-2 font-mono text-2xl font-bold text-white tabular-nums">{incidents}</p>
                  <p className="mt-1 text-[10px] text-zinc-500">Queued</p>
                </div>
              </div>
              <div className="relative mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                {rows.map((t, i) => (
                  <div
                    key={t}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-xs will-change-[opacity,box-shadow] [transform:translateZ(0)]",
                      live && (tick + i) % 3 === 0 && "landing-row-blink",
                    )}
                  >
                    <span className="truncate text-zinc-300">{t}</span>
                    <span className={i === 0 ? "text-[#FF2D2D]" : "text-amber-400"}>{i === 0 ? "BLOCK" : "QUEUE"}</span>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </SectionShell>
  )
}
