"use client"

import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"
import { LandingPressable } from "@/components/landing/motion/LandingPressable"
import { cn } from "@/lib/utils"

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function MidCtaSection({ reduceMotion, narrow }: Props) {
  return (
    <SectionShell className="py-12 sm:py-16">
      <div data-landing-reveal>
        <GlassPanel
          className={cn(
            "relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-12",
            !reduceMotion && "landing-mid-cta-shell",
          )}
        >
        <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">Secure your automations in minutes</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 sm:text-base">
          Ship the API key, wire n8n, and route your first events through SentinelMesh — no agents to install on day one.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <LandingPressable
            href="/register"
            className={cn(
              "inline-flex min-h-[44px] items-center justify-center bg-[#FF2D2D] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-4px_rgba(255,45,45,0.55)] will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.04] hover:shadow-[0_0_36px_-4px_rgba(255,45,45,0.7)]",
              !reduceMotion && !narrow && "landing-cta-pulse",
            )}
          >
            Get API key
          </LandingPressable>
          <LandingPressable
            href="#integrations"
            className="inline-flex min-h-[44px] items-center justify-center border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/90 will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.04] hover:border-white/35 hover:shadow-[0_0_28px_-8px_rgba(255,255,255,0.12)]"
          >
            Connect n8n
          </LandingPressable>
        </div>
        </GlassPanel>
      </div>
    </SectionShell>
  )
}
