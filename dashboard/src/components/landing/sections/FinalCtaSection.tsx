"use client"

import { useLayoutEffect, useRef } from "react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { LandingPressable } from "@/components/landing/motion/LandingPressable"
import { cn } from "@/lib/utils"

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function FinalCtaSection({ reduceMotion, narrow }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || reduceMotion) return

    let ctx: { revert: () => void } | null = null
    let cancelled = false

    ;(async () => {
      const { default: gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      gsap.registerPlugin(ScrollTrigger)

      if (cancelled) return

      ctx = gsap.context(() => {
        const h = root.querySelector("[data-final-heading]")
        const p = root.querySelector("[data-final-body]")
        const cta = root.querySelector("[data-final-cta]")
        if (!h || !p || !cta) return

        gsap.fromTo(
          [h, p, cta],
          { opacity: 0, y: 18, scale: 0.985 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.65,
            stagger: 0.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: root,
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
  }, [reduceMotion])

  return (
    <SectionShell className="py-16 sm:py-20">
      <div
        ref={rootRef}
        className={cn(
          "relative overflow-hidden rounded-2xl border border-[#FF2D2D]/25 bg-gradient-to-br from-[#FF2D2D]/15 via-transparent to-transparent px-6 py-12 text-center sm:px-10 sm:py-16",
          !reduceMotion && "landing-final-cta",
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,45,45,0.2),_transparent_55%)]" aria-hidden />
        <h2
          data-final-heading
          className="relative text-2xl font-bold tracking-tight text-white sm:text-3xl"
          style={reduceMotion ? undefined : { opacity: 0 }}
        >
          Secure your automation mesh today
        </h2>
        <p
          data-final-body
          className="relative mx-auto mt-3 max-w-lg text-sm text-zinc-200 sm:text-base"
          style={reduceMotion ? undefined : { opacity: 0 }}
        >
          Join teams who refuse to trade velocity for safety. SentinelMesh watches every edge of your AI surface area.
        </p>
        <div className="relative mt-8 flex justify-center" data-final-cta style={reduceMotion ? undefined : { opacity: 0 }}>
          <LandingPressable
            href="/register"
            className={cn(
              "inline-flex min-h-[48px] items-center justify-center bg-[#FF2D2D] px-8 py-3 text-sm font-semibold text-white shadow-[0_0_28px_-4px_rgba(255,45,45,0.6)] will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.05] hover:shadow-[0_0_44px_-4px_rgba(255,45,45,0.75)]",
              !reduceMotion && !narrow && "landing-cta-pulse",
            )}
          >
            Start free trial
          </LandingPressable>
        </div>
      </div>
    </SectionShell>
  )
}
