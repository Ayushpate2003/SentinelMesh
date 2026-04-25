"use client"

import { useLayoutEffect, useRef } from "react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { cn } from "@/lib/utils"

const bullets = [
  "Real-time policy engine",
  "AI threat detection",
  "Immutable audit logs",
  "Role-based access control",
  "Organization-level isolation",
]

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        className="landing-check-path"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  )
}

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function SecuritySection({ reduceMotion, narrow }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useLayoutEffect(() => {
    const root = rootRef.current
    const list = listRef.current
    if (!root || !list) return

    let ctx: { revert: () => void } | null = null
    let cancelled = false

    ;(async () => {
      const { default: gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      gsap.registerPlugin(ScrollTrigger)

      const items = gsap.utils.toArray<HTMLElement>(list.querySelectorAll("[data-security-item]"))
      const paths = gsap.utils.toArray<SVGPathElement>(list.querySelectorAll(".landing-check-path"))
      if (cancelled) return

      ctx = gsap.context(() => {
        if (reduceMotion) {
          gsap.set(items, { opacity: 1, x: 0 })
          paths.forEach((p) => gsap.set(p, { strokeDashoffset: 0 }))
          return
        }

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: list,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        })

        tl.fromTo(
          items,
          { opacity: 0, x: -28 },
          {
            opacity: 1,
            x: 0,
            duration: 0.55,
            stagger: narrow ? 0.08 : 0.12,
            ease: "power3.out",
          },
        ).fromTo(
          paths,
          { strokeDashoffset: 1 },
          {
            strokeDashoffset: 0,
            duration: 0.45,
            stagger: narrow ? 0.06 : 0.1,
            ease: "power2.out",
          },
          narrow ? "-=0.35" : "-=0.55",
        )
      }, root)
    })()

    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [reduceMotion, narrow])

  return (
    <SectionShell id="security" className="py-14 sm:py-18">
      <div ref={rootRef} className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div data-landing-reveal>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">Security architecture</h2>
          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            Enterprise controls without slowing builders. Every verdict is explainable and signed where it matters.
          </p>
        </div>
        <ul ref={listRef} className="space-y-3">
          {bullets.map((b) => (
            <li
              key={b}
              data-security-item
              className={cn(
                "flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-zinc-200",
                "will-change-transform [transform:translateZ(0)]",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF2D2D]/15 text-[#FF2D2D]">
                <CheckGlyph className="h-4 w-4" />
              </span>
              {b}
            </li>
          ))}
        </ul>
      </div>
    </SectionShell>
  )
}
