"use client"

import { useEffect, useRef, useState } from "react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"
import { cn } from "@/lib/utils"

function formatK(n: number) {
  if (n < 1000) return `${Math.round(n)}`
  const k = n / 1000
  const s = k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "")
  return `${s}K`
}

export function MetricsSection() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStarted(true)
          obs.disconnect()
        }
      },
      { threshold: 0.2 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!started) return
    let cancelled = false
    ;(async () => {
      const { default: gsap } = await import("gsap")
      if (cancelled) return
      const run = (id: string, end: number, fmt: (v: number) => string) => {
        const node = document.getElementById(id)
        if (!node) return
        const o = { v: 0 }
        gsap.to(o, {
          v: end,
          duration: 2.1,
          ease: "power2.out",
          onUpdate: () => {
            node.textContent = fmt(o.v)
          },
        })
      }
      run("m-events", 42000, (v) => `${formatK(v)}+`)
      run("m-blocked", 12400, (v) => `${formatK(v)}+`)
      run("m-latency", 0.8, (v) => `${v.toFixed(1)}ms`)
    })()
    return () => {
      cancelled = true
    }
  }, [started])

  return (
    <div ref={wrapRef}>
      <SectionShell innerClassName="max-w-5xl">
        <div data-landing-reveal>
        <GlassPanel className="px-4 py-6 transition-shadow duration-300 hover:shadow-[0_0_36px_-12px_rgba(255,45,45,0.22)] sm:px-8 sm:py-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-6">
            <div className={cn("landing-metric-cell text-center sm:text-left", "landing-metric-float")}>
              <div id="m-events" className="font-mono text-3xl font-bold tracking-tight text-white sm:text-4xl">
                0+
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Events processed</p>
            </div>
            <div className={cn("landing-metric-cell text-center sm:text-left", "landing-metric-float")}>
              <div id="m-blocked" className="font-mono text-3xl font-bold tracking-tight text-[#FF2D2D] sm:text-4xl">
                0+
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Threats blocked</p>
            </div>
            <div className={cn("landing-metric-cell text-center sm:text-left", "landing-metric-float")}>
              <div id="m-latency" className="font-mono text-3xl font-bold tracking-tight text-white sm:text-4xl">
                0.0ms
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Decision latency</p>
            </div>
          </div>
        </GlassPanel>
        </div>
      </SectionShell>
    </div>
  )
}
