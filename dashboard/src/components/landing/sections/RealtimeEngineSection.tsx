"use client"

import { useState } from "react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"
import { cn } from "@/lib/utils"

const flow = ["Event", "Queue", "Worker", "AI decision", "Enforcement", "Alert"]

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function RealtimeEngineSection({ reduceMotion, narrow }: Props) {
  const [hovered, setHovered] = useState<number | null>(null)
  const showRail = !reduceMotion && !narrow

  return (
    <SectionShell className="py-14 sm:py-18">
      <div data-landing-reveal className="max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">Real-time engine</h2>
        <p className="mt-3 text-sm text-zinc-400 sm:text-base">
          Event → Queue → Worker → AI decision → Enforcement → Alert. Sub-second path from signal to action.
        </p>
      </div>
      <div data-landing-reveal>
        <GlassPanel className="relative mt-10 overflow-x-auto p-4 sm:p-6">
        {showRail && (
          <div className="landing-engine-rail hidden min-[640px]:block" aria-hidden>
            <div className="landing-engine-dot" />
          </div>
        )}
        <div className="relative z-10 flex min-w-[640px] items-center gap-1 py-3 sm:min-w-0 sm:flex-wrap sm:justify-center sm:py-2">
          {flow.map((label, i) => (
            <div key={label} className="flex items-center">
              <button
                type="button"
                className={cn(
                  "engine-step rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-200 transition-[border-color,box-shadow,transform] duration-200 will-change-transform [transform:translateZ(0)] sm:px-4 sm:text-xs",
                  hovered === i && "border-[#FF2D2D]/55 shadow-[0_0_22px_rgba(255,45,45,0.28)]",
                )}
                data-engine-index={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {label}
              </button>
              {i < flow.length - 1 && (
                <span
                  className={cn(
                    "mx-1 font-mono text-[10px] text-[#FF2D2D]/70 transition-opacity duration-200 sm:mx-2",
                    hovered === i || hovered === i + 1 ? "opacity-100" : "opacity-60",
                  )}
                  aria-hidden
                >
                  →
                </span>
              )}
            </div>
          ))}
        </div>
        </GlassPanel>
      </div>
    </SectionShell>
  )
}
