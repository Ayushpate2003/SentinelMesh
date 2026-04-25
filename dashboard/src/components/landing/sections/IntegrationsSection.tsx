"use client"

import { useCallback } from "react"
import { AppWindow, Bot, Cable, Workflow } from "lucide-react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"
import { cn } from "@/lib/utils"

const items = [
  {
    name: "n8n",
    desc: "Observe every node execution and block risky automations before they spread.",
    icon: Workflow,
    badge: "Monitored",
  },
  {
    name: "APIs",
    desc: "Ingest events from REST and webhooks with per-integration rate limits.",
    icon: Cable,
    badge: "Secured",
  },
  {
    name: "Chrome",
    desc: "Extension telemetry for credential misuse and OAuth abuse patterns.",
    icon: AppWindow,
    badge: "Live",
  },
  {
    name: "MCP & AI agents",
    desc: "Govern tool-calling agents with policy checks on each MCP action.",
    icon: Bot,
    badge: "Governed",
  },
]

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function IntegrationsSection({ reduceMotion, narrow }: Props) {
  const tiltEnabled = !reduceMotion && !narrow

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!tiltEnabled) return
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width - 0.5
      const py = (e.clientY - rect.top) / rect.height - 0.5
      const max = 7
      el.style.transform = `translateZ(0) perspective(960px) rotateY(${px * max}deg) rotateX(${-py * max}deg) scale(1.02)`
    },
    [tiltEnabled],
  )

  const onLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.transform = "translateZ(0) perspective(960px) rotateY(0deg) rotateX(0deg) scale(1)"
    },
    [],
  )

  return (
    <SectionShell id="integrations" className="py-14 sm:py-18">
      <div data-landing-reveal className="max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">Integrations</h2>
        <p className="mt-3 text-sm text-zinc-400 sm:text-base">One mesh across the tools your teams already use.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {items.map((it) => (
          <div key={it.name} data-landing-reveal data-landing-card>
            <div className="landing-int-wrap h-full will-change-transform [transform:translateZ(0)]">
              <div
                className={cn(
                  "landing-int-inner h-full rounded-2xl will-change-transform",
                  tiltEnabled && "cursor-default",
                )}
                onMouseMove={onMove}
                onMouseLeave={onLeave}
              >
                <GlassPanel
                  hover
                  className="landing-card flex h-full flex-col border-white/[0.08] p-5 transition-[box-shadow,border-color] duration-300 will-change-transform [transform:translateZ(0)] hover:border-[#FF2D2D]/45 hover:shadow-[0_0_42px_-10px_rgba(255,45,45,0.42)] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-white">
                      <it.icon className="h-5 w-5" strokeWidth={1.5} />
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF2D2D]/30 bg-[#FF2D2D]/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#FF2D2D]">
                      {it.badge === "Secured" && (
                        <span
                          className="landing-secured-dot size-1.5 shrink-0 rounded-full bg-[#FF2D2D]"
                          aria-hidden
                        />
                      )}
                      {it.badge}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{it.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{it.desc}</p>
                </GlassPanel>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
