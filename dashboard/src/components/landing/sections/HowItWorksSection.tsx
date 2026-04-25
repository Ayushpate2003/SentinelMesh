"use client"

import { useLayoutEffect, useRef } from "react"
import { Activity, ShieldCheck, Zap } from "lucide-react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"
import { cn } from "@/lib/utils"

const steps = [
  {
    title: "Instrument",
    body: "Connect n8n, APIs, Chrome, MCP, and AI agents. Stream every execution into SentinelMesh.",
    icon: Activity,
  },
  {
    title: "Evaluate",
    body: "Policy engine + AI models score risk in milliseconds. Consensus signals reduce false positives.",
    icon: ShieldCheck,
  },
  {
    title: "Enforce",
    body: "Block, queue, or allow automatically. Cryptographic audit trail for every human override.",
    icon: Zap,
  },
]

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function HowItWorksSection({ reduceMotion, narrow }: Props) {
  const ctxRootRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = ctxRootRef.current
    const grid = cardsRef.current
    if (!root || !grid) return

    let ctx: { revert: () => void } | null = null
    let cancelled = false

    ;(async () => {
      const { default: gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      gsap.registerPlugin(ScrollTrigger)

      const cards = gsap.utils.toArray<HTMLElement>(grid.querySelectorAll("[data-how-card]"))
      if (!cards.length || cancelled) return

      ctx = gsap.context(() => {
        if (reduceMotion) {
          gsap.set(cards, { opacity: 1, y: 0 })
          return
        }

        gsap.fromTo(
          cards,
          { opacity: 0, y: 36 },
          {
            opacity: 1,
            y: 0,
            duration: 0.72,
            stagger: narrow ? 0.08 : 0.16,
            ease: "power3.out",
            scrollTrigger: {
              trigger: grid,
              start: "top 86%",
              toggleActions: "play none none none",
            },
          },
        )
      }, root)
    })()

    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [reduceMotion, narrow])

  return (
    <SectionShell id="how-it-works" className="py-14 sm:py-18">
      <div ref={ctxRootRef}>
        <div data-landing-reveal className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">How it works</h2>
          <p className="mt-3 text-sm text-zinc-400 sm:text-base">Three layers from visibility to autonomous response.</p>
        </div>
        <div ref={cardsRef} className="mt-10 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} data-how-card className="will-change-transform [transform:translateZ(0)]">
              <GlassPanel
                hover
                className={cn(
                  "group landing-card h-full border-white/[0.08] p-5 transition-[box-shadow,border-color] duration-300 will-change-transform [transform:translateZ(0)] sm:p-6",
                  "hover:-translate-y-1 hover:border-[#FF2D2D]/40 hover:shadow-[0_0_44px_-12px_rgba(255,45,45,0.38)]",
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF2D2D]/12 text-[#FF2D2D]">
                  <s.icon className="landing-card-how-icon h-5 w-5" strokeWidth={1.75} />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Step {i + 1}</p>
                <h3 className="mt-1 text-lg font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
              </GlassPanel>
            </div>
          ))}
        </div>
      </div>
    </SectionShell>
  )
}
