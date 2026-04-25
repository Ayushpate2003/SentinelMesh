"use client"

import { useLayoutEffect, useRef } from "react"
import { LandingHeroCtas } from "@/components/landing/motion/LandingHeroCtas"
import { ShaderBackground } from "@/components/ui/shader-background"
import { useLandingMotionPreferences } from "@/hooks/useLandingMotionPreferences"
import { cn } from "@/lib/utils"

export function HeroSection() {
  const rootRef = useRef<HTMLElement>(null)
  const badgeRef = useRef<HTMLParagraphElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const subRef = useRef<HTMLParagraphElement>(null)
  const pulseRef = useRef<HTMLDivElement>(null)
  const { reduceMotion, narrow } = useLandingMotionPreferences()
  const shaderOn = !reduceMotion && !narrow

  useLayoutEffect(() => {
    const root = rootRef.current
    const badge = badgeRef.current
    const headline = headlineRef.current
    const sub = subRef.current
    const pulse = pulseRef.current
    if (!root || !badge || !headline || !sub) return

    let ctx: { revert: () => void } | null = null

    ;(async () => {
      const { default: gsap } = await import("gsap")
      ctx = gsap.context(() => {
        if (reduceMotion) {
          gsap.set([badge, headline, sub], { opacity: 1, y: 0, letterSpacing: "normal" })
          return
        }

        const tl = gsap.timeline({ defaults: { ease: "power3.out" } })
        tl.fromTo(badge, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55 })
          .fromTo(
            headline,
            { opacity: 0, y: 36, letterSpacing: "0.08em" },
            { opacity: 1, y: 0, letterSpacing: "-0.02em", duration: 0.85 },
            "-=0.35",
          )
          .fromTo(sub, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.65 }, "-=0.5")

        if (pulse && !narrow) {
          gsap.to(pulse, {
            opacity: 0.55,
            scale: 1.08,
            duration: 2.8,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
          })
        }
      }, root)
    })()

    return () => ctx?.revert()
  }, [reduceMotion, narrow])

  return (
    <section ref={rootRef} className="relative overflow-hidden px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
      <ShaderBackground enabled={shaderOn} className="z-0" />
      <div
        id="landing-hero-grid"
        className={cn(
          "pointer-events-none absolute inset-0 z-[1] will-change-[background-position] [transform:translateZ(0)]",
          shaderOn ? "opacity-[0.12]" : "opacity-[0.35]",
        )}
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,45,45,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,45,45,0.08) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />
      <div
        id="landing-hero-glow"
        className="pointer-events-none absolute -left-1/4 top-0 z-[1] h-[420px] w-[70%] rounded-full bg-[#FF2D2D]/20 blur-[120px] will-change-[opacity,transform] [transform:translateZ(0)]"
        aria-hidden
      />
      <div
        ref={pulseRef}
        className="pointer-events-none absolute left-1/2 top-[18%] z-[1] h-64 w-[min(90%,520px)] -translate-x-1/2 rounded-full bg-[#FF2D2D]/25 opacity-40 blur-[100px] md:top-[22%]"
        aria-hidden
      />
      <div
        id="landing-hero-lines"
        className="pointer-events-none absolute inset-x-0 top-1/3 z-[1] h-px bg-gradient-to-r from-transparent via-[#FF2D2D]/40 to-transparent will-change-[opacity,transform] [transform:translateZ(0)]"
        aria-hidden
      />

      <div className="relative z-[2] mx-auto max-w-6xl">
        <p ref={badgeRef} className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FF2D2D]">
          Real-time AI security
        </p>
        <h1
          ref={headlineRef}
          className="mt-4 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.5rem] lg:leading-[1.08]"
        >
          Autonomous security for AI workflows
        </h1>
        <p ref={subRef} className="mt-5 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Monitor, detect, and block threats across APIs, automations, and AI agents — in real time.
        </p>
        <LandingHeroCtas />
      </div>
    </section>
  )
}
