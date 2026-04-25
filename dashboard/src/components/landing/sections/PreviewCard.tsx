"use client"

import gsap from "gsap"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

const NOISE_SVG =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")"

const ACTIVITY = [
  { label: "OAuth scope escalation", status: "BLOCK" as const },
  { label: "Credential exfiltration", status: "QUEUE" as const },
  { label: "Supply chain anomaly", status: "QUEUE" as const },
]

type Metrics = { r: number; a: number; i: number }

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export function PreviewCard({ reduceMotion, narrow }: Props) {
  const lightMotion = reduceMotion || narrow
  const rootRef = useRef<HTMLDivElement>(null)
  const ambientRef = useRef<HTMLDivElement>(null)
  const gradientDriftRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const liveBadgeRef = useRef<HTMLSpanElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const metricEls = useRef<(HTMLDivElement | null)[]>([])

  const [metrics, setMetrics] = useState<Metrics>({ r: 77, a: 11, i: 3 })
  const [tick, setTick] = useState(0)

  const live = !lightMotion

  /** Subtle live drift (targets wander slightly). */
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => {
      setTick((t) => t + 1)
      setMetrics((m) => ({
        r: clamp(m.r + (Math.random() > 0.5 ? 1 : -1), 70, 88),
        a: clamp(m.a + (Math.random() > 0.72 ? (Math.random() > 0.5 ? 1 : -1) : 0), 7, 16),
        i: clamp(m.i + (Math.random() > 0.88 ? (Math.random() > 0.5 ? 1 : -1) : 0), 2, 5),
      }))
    }, 2600)
    return () => window.clearInterval(id)
  }, [live])

  /** Entrance, count-up, ambient motion, staggered rows — runs once per lightMotion mode. */
  useLayoutEffect(() => {
    const root = rootRef.current
    const card = cardRef.current
    const ambient = ambientRef.current
    const gradient = gradientDriftRef.current
    const badge = liveBadgeRef.current
    const rows = rowsRef.current
    if (!root || !card) return

    if (lightMotion) {
      setMetrics({ r: 77, a: 11, i: 3 })
      gsap.set(card, { clearProps: "all" })
      if (rows) gsap.set(rows.children, { clearProps: "all" })
      return
    }

    setMetrics({ r: 0, a: 0, i: 0 })

    const ctx = gsap.context(() => {
      gsap.set(card, { opacity: 0, scale: 0.94, transformOrigin: "50% 50%" })
      if (rows) gsap.set(rows.children, { opacity: 0, x: 20 })

      const proxy = { r: 0, a: 0, i: 0 }
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } })

      tl.to(card, { opacity: 1, scale: 1, duration: 0.85 }, 0)
      tl.to(
        proxy,
        {
          r: 77,
          a: 11,
          i: 3,
          duration: 1.65,
          ease: "power2.out",
          onUpdate: () => {
            setMetrics({
              r: Math.round(proxy.r),
              a: Math.round(proxy.a),
              i: Math.round(proxy.i),
            })
          },
        },
        0.1,
      )

      if (rows) {
        tl.fromTo(
          rows.children,
          { opacity: 0, x: 22 },
          { opacity: 1, x: 0, duration: 0.52, stagger: 0.12, ease: "power2.out" },
          0.32,
        )
      }

      if (badge) {
        gsap.to(badge, {
          boxShadow: "0 0 24px 2px rgba(52, 211, 153, 0.42)",
          scale: 1.04,
          duration: 1.2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        })
      }

      if (ambient) {
        gsap.to(ambient, {
          opacity: 0.9,
          scale: 1.05,
          duration: 3.4,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        })
      }

      if (gradient) {
        gsap.fromTo(
          gradient,
          { backgroundPosition: "0% 50%" },
          {
            backgroundPosition: "100% 50%",
            duration: 11,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
          },
        )
      }

      gsap.to(card, {
        y: -4,
        duration: 3.1,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        delay: 0.85,
      })

      metricEls.current.forEach((el, idx) => {
        if (!el) return
        gsap.to(el, {
          y: -2,
          duration: 2.6 + idx * 0.15,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          delay: 0.4 + idx * 0.12,
        })
      })
    }, root)

    return () => ctx.revert()
  }, [lightMotion])

  return (
    <div ref={rootRef} className="relative mx-auto w-full max-w-4xl px-3 sm:px-4">
      <div
        ref={ambientRef}
        className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,45,45,0.48),transparent_58%)] opacity-75 blur-3xl will-change-[opacity,transform] [transform:translateZ(0)]"
        aria-hidden
      />

      <div
        ref={cardRef}
        className={cn(
          "landing-scanline relative overflow-hidden rounded-2xl border border-white/[0.12] bg-gradient-to-br from-[#080910]/98 via-[#100e18]/95 to-[#18080c]/96 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset,0_28px_90px_-28px_rgba(0,0,0,0.9),0_0_140px_-48px_rgba(255,45,45,0.4)] backdrop-blur-2xl sm:rounded-3xl sm:p-6 md:p-8",
          "will-change-transform [transform:translateZ(0)]",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.32] mix-blend-overlay"
          style={{ backgroundImage: NOISE_SVG }}
          aria-hidden
        />
        <div
          ref={gradientDriftRef}
          className="pointer-events-none absolute inset-0 bg-[length:220%_220%] bg-gradient-to-br from-[#FF2D2D]/2 via-[#FF2D2D]/14 to-transparent opacity-95 will-change-[background-position]"
          style={{ backgroundPosition: "0% 40%" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-[#FF2D2D]/12 via-transparent to-transparent"
          aria-hidden
        />

        <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400 sm:text-xs">Preview</span>
          <span
            ref={liveBadgeRef}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/35 will-change-transform [transform:translateZ(0)]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-55" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Live
          </span>
        </div>

        <div className="relative mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4">
          {[
            { k: "r", label: "Risk score", sub: "24h window", accent: "text-[#FF2D2D]" },
            { k: "a", label: "Alerts", sub: "Open", accent: "text-white" },
            { k: "i", label: "Incidents", sub: "Queued", accent: "text-white" },
          ].map((m, idx) => (
            <div
              key={m.k}
              ref={(el) => {
                metricEls.current[idx] = el
              }}
              className="group relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 p-4 transition-shadow duration-300 hover:border-[#FF2D2D]/28 hover:shadow-[0_0_36px_-10px_rgba(255,45,45,0.32)] sm:p-5"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{m.label}</p>
              <p className={cn("mt-2 font-mono text-3xl font-bold tabular-nums sm:text-4xl", m.accent)}>
                {m.k === "r" ? metrics.r : m.k === "a" ? metrics.a : metrics.i}
              </p>
              <p className="mt-1 text-[10px] text-zinc-500">{m.sub}</p>
              <div
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background: "radial-gradient(140px 90px at 50% 0%, rgba(255,45,45,0.14), transparent 72%)",
                }}
                aria-hidden
              />
            </div>
          ))}
        </div>

        <div
          ref={rowsRef}
          className="relative mt-5 space-y-2 rounded-xl border border-white/[0.08] bg-black/30 p-3 sm:mt-6 sm:p-4"
        >
          {ACTIVITY.map((row, i) => (
            <div
              key={row.label}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border border-transparent bg-white/[0.045] px-3 py-2.5 text-sm transition-all duration-300 sm:px-4 sm:py-3 sm:text-base",
                "hover:border-white/[0.1] hover:bg-white/[0.08] hover:shadow-[0_0_28px_-14px_rgba(255,45,45,0.18)]",
                live && (tick + i) % 3 === 0 && "landing-row-blink",
                !lightMotion && "hover:translate-x-1",
              )}
            >
              <span className="truncate font-medium text-zinc-200">{row.label}</span>
              <span
                className={cn(
                  "shrink-0 font-bold tracking-wide",
                  row.status === "BLOCK" ? "text-[#FF2D2D]" : "text-amber-400",
                )}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
