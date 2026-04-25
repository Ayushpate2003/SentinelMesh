"use client"

import { SentinelMeshLogo } from "@/components/brand/SentinelMeshLogo"
import { Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/** Decorative layers — Unsplash (abstract / tech). */
const BG_IMAGES = {
  back: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=2048&q=80",
  mid: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
  front: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1000&q=80",
} as const

export type WaitlistStatus = "idle" | "loading" | "success"

export type WaitlistHeroProps = {
  className?: string
  /** Full viewport hero vs. card inside landing. */
  variant?: "fullscreen" | "embedded"
  headline?: string
  subtitle?: string
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
  size: number
}

export function WaitlistHero({
  className,
  variant = "fullscreen",
  headline = "Join the early access list.",
  subtitle = "Be first to get API keys, mesh telemetry, and policy packs.",
}: WaitlistHeroProps) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<WaitlistStatus>("idle")
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const confettiGen = useRef(0)
  const rafRef = useRef<number>(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const fireConfetti = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || reduceMotion) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const gen = ++confettiGen.current
    const particles: Particle[] = []
    const colors = ["#FF2D2D", "#fca5a5", "#fbbf24", "#e4e4e7", "#fb7185"]

    const w = canvas.offsetWidth
    const h = canvas.offsetHeight
    canvas.width = w
    canvas.height = h

    const cx = w / 2
    const cy = h / 2

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: cx,
        y: cy,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 2) * 10,
        life: 100,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#FF2D2D",
        size: Math.random() * 4 + 2,
      })
    }

    const animate = () => {
      if (gen !== confettiGen.current) return
      if (particles.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        if (!p) continue
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.5
        p.life -= 2

        ctx.fillStyle = p.color
        ctx.globalAlpha = Math.max(0, p.life / 100)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()

        if (p.life <= 0) {
          particles.splice(i, 1)
        }
      }

      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(animate)
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(animate)
  }, [reduceMotion])

  useEffect(() => {
    return () => {
      confettiGen.current += 1
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || status === "loading") return

    setStatus("loading")
    window.setTimeout(() => {
      setStatus("success")
      setEmail("")
      fireConfetti()
    }, 1500)
  }

  const embedded = variant === "embedded"

  return (
    <div
      className={cn(
        "flex w-full items-center justify-center bg-[#05070A]",
        embedded ? "min-h-0 py-0" : "min-h-screen",
        className,
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden shadow-2xl",
          embedded ? "h-[min(92vh,820px)] min-h-[560px] rounded-2xl border border-white/[0.08]" : "h-screen",
        )}
        style={{ backgroundColor: "#05070A", fontFamily: "var(--font-geist-sans), system-ui, sans-serif" }}
      >
        {/* Background decorative */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full",
            !reduceMotion && "waitlist-hero-perspective",
          )}
        >
          <div className={cn("absolute inset-0", !reduceMotion && "waitlist-hero-spin-slow")}>
            <div
              className="absolute left-1/2 top-1/2 z-0"
              style={{
                width: "2000px",
                height: "2000px",
                transform: "translate(-50%, -50%) rotate(279deg)",
              }}
            >
              <img
                src={BG_IMAGES.back}
                alt=""
                className="h-full w-full object-cover opacity-40"
                width={2048}
                height={2048}
                decoding="async"
              />
            </div>
          </div>

          <div className={cn("absolute inset-0", !reduceMotion && "waitlist-hero-spin-slow-reverse")}>
            <div
              className="absolute left-1/2 top-1/2 z-[1]"
              style={{
                width: "1000px",
                height: "1000px",
                transform: "translate(-50%, -50%) rotate(304deg)",
              }}
            >
              <img
                src={BG_IMAGES.mid}
                alt=""
                className="h-full w-full object-cover opacity-50"
                width={1200}
                height={1200}
                decoding="async"
              />
            </div>
          </div>

          <div className={cn("absolute inset-0", !reduceMotion && "waitlist-hero-spin-slow")}>
            <div
              className="absolute left-1/2 top-1/2 z-[2]"
              style={{
                width: "800px",
                height: "800px",
                transform: "translate(-50%, -50%) rotate(48deg)",
              }}
            >
              <img
                src={BG_IMAGES.front}
                alt=""
                className="h-full w-full object-cover opacity-70"
                width={1000}
                height={1000}
                decoding="async"
              />
            </div>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background:
              "linear-gradient(to top, #05070A 10%, rgba(5, 7, 10, 0.88) 42%, rgba(5, 7, 10, 0.35) 72%, transparent 100%)",
          }}
        />

        <div className="relative z-20 flex h-full w-full flex-col items-center justify-end gap-6 pb-16 pt-10 sm:pb-24">
          <div className="mb-2 flex justify-center">
            <SentinelMeshLogo heightPx={52} href={null} className="object-center" />
          </div>

          <h1 className="max-w-[90vw] px-4 text-center text-4xl font-bold tracking-tight text-white md:text-5xl lg:text-6xl">
            {headline}
          </h1>
          <p className="max-w-md px-4 text-center text-base font-medium text-zinc-400 sm:text-lg">{subtitle}</p>

          <div className="relative mt-4 h-[60px] w-full max-w-md px-4 [perspective:1000px]">
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute left-1/2 top-1/2 z-50 h-[min(600px,120vw)] w-[min(600px,120vw)] -translate-x-1/2 -translate-y-1/2"
              aria-hidden
            />

            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] [transform-style:preserve-3d]",
                status === "success"
                  ? "waitlist-hero-success-pulse waitlist-hero-success-glow pointer-events-auto scale-100 opacity-100"
                  : "pointer-events-none scale-95 opacity-0 [transform:rotateX(-90deg)]",
              )}
              style={{ backgroundColor: "#10b981" }}
            >
              {status === "success" && (
                <>
                  <div
                    className="waitlist-hero-ring absolute left-1/2 top-1/2 h-full w-full rounded-full border-2 border-emerald-400"
                    style={{ animationDelay: "0s" }}
                  />
                  <div
                    className="waitlist-hero-ring absolute left-1/2 top-1/2 h-full w-full rounded-full border-2 border-emerald-300"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <div
                    className="waitlist-hero-ring absolute left-1/2 top-1/2 h-full w-full rounded-full border-2 border-emerald-200"
                    style={{ animationDelay: "0.3s" }}
                  />
                </>
              )}
              <div
                className={cn(
                  "flex items-center gap-2 text-lg font-semibold text-white",
                  status === "success" && "waitlist-hero-bounce-in",
                )}
              >
                <div className="rounded-full bg-white/20 p-1">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      className={status === "success" ? "waitlist-hero-checkmark" : undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <span>You&apos;re on the list!</span>
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className={cn(
                "group relative h-full w-full transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] [transform-style:preserve-3d]",
                status === "success"
                  ? "pointer-events-none scale-95 opacity-0 [transform:rotateX(90deg)]"
                  : "scale-100 opacity-100 [transform:rotateX(0deg)]",
              )}
            >
              <input
                type="email"
                required
                placeholder="name@email.com"
                value={email}
                disabled={status === "loading"}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[60px] w-full rounded-full border border-white/10 bg-zinc-900/90 pl-6 pr-[150px] text-white outline-none transition-all duration-200 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}
              />

              <div className="absolute bottom-[6px] right-[6px] top-[6px]">
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="flex h-full min-w-[130px] items-center justify-center rounded-full bg-[#FF2D2D] px-6 font-medium text-white shadow-[0_0_24px_-6px_rgba(255,45,45,0.55)] transition-all hover:brightness-110 active:scale-95 disabled:cursor-wait disabled:active:scale-100 disabled:hover:brightness-100"
                >
                  {status === "loading" ? <Loader2 className="h-5 w-5 animate-spin text-white" aria-label="Loading" /> : "Join waitlist"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WaitlistHero
