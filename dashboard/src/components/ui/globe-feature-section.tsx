"use client"

import createGlobe, { type COBEOptions } from "cobe"
import { ArrowRight } from "lucide-react"
import gsap from "gsap"
import Link from "next/link"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ThreatStatus = "active" | "blocked" | "queued"
type ThreatNode = {
  id: string
  label: string
  event: string
  status: ThreatStatus
  latLng: [number, number]
  pos: { x: number; y: number }
  intensity: "low" | "high"
}

const THREAT_NODES: ThreatNode[] = [
  {
    id: "india",
    label: "India",
    event: "OAuth attack detected",
    status: "active",
    latLng: [19.076, 72.8777],
    pos: { x: 60, y: 56 },
    intensity: "high",
  },
  {
    id: "singapore",
    label: "Singapore",
    event: "Token replay blocked",
    status: "blocked",
    latLng: [1.3521, 103.8198],
    pos: { x: 68, y: 64 },
    intensity: "high",
  },
  {
    id: "london",
    label: "London",
    event: "Prompt injection queued",
    status: "queued",
    latLng: [51.5074, -0.1278],
    pos: { x: 45, y: 43 },
    intensity: "low",
  },
  {
    id: "newyork",
    label: "New York",
    event: "Credential sweep blocked",
    status: "blocked",
    latLng: [40.7128, -74.006],
    pos: { x: 33, y: 48 },
    intensity: "high",
  },
  {
    id: "tokyo",
    label: "Tokyo",
    event: "Webhook exfiltration active",
    status: "active",
    latLng: [35.6762, 139.6503],
    pos: { x: 75, y: 49 },
    intensity: "high",
  },
  {
    id: "sao",
    label: "Sao Paulo",
    event: "Ransomware pattern queued",
    status: "queued",
    latLng: [-23.5505, -46.6333],
    pos: { x: 37, y: 72 },
    intensity: "low",
  },
]

const NODE_LINKS: Array<[string, string]> = [
  ["india", "singapore"],
  ["india", "london"],
  ["london", "newyork"],
  ["india", "tokyo"],
  ["newyork", "sao"],
]

const GLOBE_CONFIG: COBEOptions = {
  width: 900,
  height: 900,
  devicePixelRatio: 2.2,
  phi: 0,
  theta: 0.32,
  dark: 1,
  diffuse: 0.82,
  mapSamples: 20000,
  mapBrightness: 1.35,
  mapBaseBrightness: 0.18,
  baseColor: [0.1, 0.13, 0.18],
  markerColor: [1, 45 / 255, 45 / 255],
  glowColor: [0.4, 0.25, 0.95],
  markers: THREAT_NODES.map((n) => ({
    location: n.latLng,
    size: n.intensity === "high" ? 0.085 : 0.055,
  })),
}

function Globe({
  className,
  config = GLOBE_CONFIG,
}: {
  className?: string
  config?: COBEOptions
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widthRef = useRef(0)
  const phiRef = useRef(0)
  const rotationRef = useRef(0)
  const pointerInteracting = useRef<number | null>(null)
  const pointerInteractionMovement = useRef(0)

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value
    if (canvasRef.current) {
      canvasRef.current.style.cursor = value === null ? "grab" : "grabbing"
    }
  }

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current
      pointerInteractionMovement.current = delta
      rotationRef.current = delta / 220
    }
  }

  useEffect(() => {
    const onResize = () => {
      if (canvasRef.current) {
        widthRef.current = canvasRef.current.offsetWidth
      }
    }

    window.addEventListener("resize", onResize)
    onResize()

    if (!canvasRef.current) return

    const globe = createGlobe(canvasRef.current, {
      ...config,
      width: widthRef.current * 2,
      height: widthRef.current * 2,
    })

    let frame = 0
    const animate = () => {
      if (pointerInteracting.current === null) phiRef.current += 0.005
      globe.update({
        phi: phiRef.current + rotationRef.current,
        width: widthRef.current * 2,
        height: widthRef.current * 2,
      })
      frame = window.requestAnimationFrame(animate)
    }
    animate()

    const fadeIn = setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = "1"
    }, 30)

    return () => {
      clearTimeout(fadeIn)
      window.removeEventListener("resize", onResize)
      window.cancelAnimationFrame(frame)
      globe.destroy()
    }
  }, [config])

  return (
    <div className={cn("absolute inset-0 mx-auto aspect-square w-full max-w-[620px]", className)}>
      <canvas
        ref={canvasRef}
        className="size-full opacity-0 transition-opacity duration-500 [contain:layout_paint_size] [filter:contrast(1.18)_saturate(1.22)_brightness(1.08)]"
        onPointerDown={(e) => updatePointerInteraction(e.clientX - pointerInteractionMovement.current)}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) => {
          if (e.touches[0]) updateMovement(e.touches[0].clientX)
        }}
      />
    </div>
  )
}

export default function GlobeFeatureSection() {
  const overlayRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const particleRef = useRef<HTMLDivElement>(null)
  const [hoveredNode, setHoveredNode] = useState<ThreatNode | null>(null)

  const linkedLines = useMemo(
    () =>
      NODE_LINKS.map(([fromId, toId]) => {
        const from = THREAT_NODES.find((n) => n.id === fromId)
        const to = THREAT_NODES.find((n) => n.id === toId)
        if (!from || !to) return null
        return { id: `${fromId}-${toId}`, from, to }
      }).filter(Boolean) as Array<{ id: string; from: ThreatNode; to: ThreatNode }>,
    [],
  )

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const particle = particleRef.current
    if (!overlay) return

    const nodes = Object.values(nodeRefs.current).filter(Boolean) as HTMLButtonElement[]
    const ctx = gsap.context(() => {
      gsap.fromTo(
        nodes,
        { autoAlpha: 0, scale: 0.3 },
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.42,
          stagger: 0.08,
          ease: "back.out(2)",
        },
      )

      nodes.forEach((node, idx) => {
        const speed = 1 + (idx % 3) * 0.18
        gsap.to(node, {
          scale: 1.22,
          boxShadow: "0 0 18px rgba(255,45,45,0.55)",
          transformOrigin: "50% 50%",
          duration: speed,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        })
      })

      if (particle) {
        gsap.to(particle, {
          rotate: 360,
          duration: 30,
          ease: "none",
          repeat: -1,
        })
      }

      gsap.to("[data-threat-line]", {
        opacity: 0.65,
        duration: 1.4,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.15,
      })
    }, overlay)

    return () => ctx.revert()
  }, [])

  const statusTone: Record<ThreatStatus, string> = {
    active: "text-[#FF2D2D]",
    blocked: "text-[#22C55E]",
    queued: "text-[#F59E0B]",
  }

  return (
    <section className="relative mx-auto mt-16 w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0e1218]/95 via-[#101622]/95 to-[#130f19]/95 px-6 py-14 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_24px_70px_-24px_rgba(0,0,0,0.85)] md:px-12 md:py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,45,45,0.15),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[56%] bg-[radial-gradient(circle_at_right,rgba(255,45,45,0.25),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-[8%] w-[48%] bg-[radial-gradient(circle_at_70%_35%,rgba(88,96,255,0.22),transparent_62%)]" />
      <div className="flex flex-col-reverse items-center justify-between gap-10 md:flex-row">
        <div className="z-10 max-w-xl text-left">
          <h2 className="text-2xl font-semibold leading-tight text-[#E5E7EB] md:text-3xl">
            Defend globally with <span className="text-[#FF2D2D]">SentinelMesh</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[#9CA3AF] md:text-base">
            Visualize enforcement coverage across your automation stack. SentinelMesh helps teams detect, triage, and
            block cross-region threats in real time.
          </p>
          <Link href="/register" className="inline-block">
            <Button className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#FF2D2D] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#ff4747]">
              Join Today <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="relative h-[280px] w-full max-w-xl md:h-[340px]">
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,45,45,0.28),rgba(255,45,45,0.03)_46%,transparent_68%)] blur-2xl" />
          <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(110,95,255,0.24),transparent_64%)] blur-[56px]" />
          <Globe className="absolute -bottom-20 -right-24 scale-[1.52] md:-right-18 md:scale-[1.66]" />

          <div ref={overlayRef} className="pointer-events-none absolute inset-0">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
              {linkedLines.map((line) => (
                <line
                  key={line.id}
                  data-threat-line
                  x1={line.from.pos.x}
                  y1={line.from.pos.y}
                  x2={line.to.pos.x}
                  y2={line.to.pos.y}
                  stroke="rgba(255,45,45,0.48)"
                  strokeWidth="0.4"
                  strokeDasharray="1.2 1"
                />
              ))}
            </svg>

            <div
              ref={particleRef}
              className="pointer-events-none absolute left-[48%] top-[48%] h-36 w-36 rounded-full border border-[#ff2d2d]/20"
            >
              <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#ff2d2d]/80 shadow-[0_0_12px_rgba(255,45,45,0.8)]" />
            </div>

            {THREAT_NODES.map((node) => {
              const isActive = hoveredNode?.id === node.id
              const dotSize = node.intensity === "high" ? "h-3.5 w-3.5" : "h-2.5 w-2.5"
              return (
                <button
                  key={node.id}
                  ref={(el) => {
                    nodeRefs.current[node.id] = el
                  }}
                  type="button"
                  className={cn(
                    "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF2D2D]",
                    dotSize,
                    isActive && "z-20",
                  )}
                  style={{ left: `${node.pos.x}%`, top: `${node.pos.y}%` }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                  aria-label={`${node.event} - ${node.label}`}
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-[#FF2D2D]/70" />
                  <span className="absolute -inset-2 rounded-full border border-[#FF2D2D]/35" />
                </button>
              )
            })}

            {hoveredNode && (
              <div
                className="pointer-events-none absolute z-30 min-w-[220px] rounded-lg border border-white/15 bg-[#0b1018]/92 px-3 py-2 text-xs shadow-[0_12px_30px_-15px_rgba(0,0,0,0.9)] backdrop-blur-md"
                style={{
                  left: `calc(${hoveredNode.pos.x}% + 10px)`,
                  top: `calc(${hoveredNode.pos.y}% - 34px)`,
                }}
              >
                <p className="font-semibold text-[#E5E7EB]">{hoveredNode.event}</p>
                <p className="mt-0.5 text-[#9CA3AF]">Region: {hoveredNode.label}</p>
                <p className={cn("mt-0.5 font-semibold uppercase", statusTone[hoveredNode.status])}>
                  {hoveredNode.status}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

