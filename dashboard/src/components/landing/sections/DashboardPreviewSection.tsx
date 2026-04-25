"use client"

import { SectionShell } from "@/components/landing/ui/SectionShell"
import { PreviewCard } from "./PreviewCard"

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function DashboardPreviewSection({ reduceMotion, narrow }: Props) {
  return (
    <SectionShell className="py-16 sm:py-20 md:py-24">
      <div className="mx-auto max-w-3xl px-1 text-center sm:px-2" data-landing-reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF2D2D]/90">Live security preview</p>
        <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
          A live AI security system actively blocking threats
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
          Risk, alerts, and enforcement in one glass surface — built for teams who cannot afford blind spots in APIs,
          automations, or agent runtimes.
        </p>
      </div>

      <div className="relative mx-auto mt-12 max-w-5xl sm:mt-14 md:mt-16" data-landing-parallax>
        <PreviewCard reduceMotion={reduceMotion} narrow={narrow} />
      </div>
    </SectionShell>
  )
}
