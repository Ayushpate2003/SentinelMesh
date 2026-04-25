"use client"

import { AnimatePresence, motion } from "framer-motion"
import DottedMap from "dotted-map"
import Image from "next/image"
import { useId, useMemo, useState } from "react"
import { cn } from "@/lib/utils"

export type MapDot = {
  start: { lat: number; lng: number; label?: string }
  end: { lat: number; lng: number; label?: string }
}

export interface WorldMapProps {
  dots?: MapDot[]
  lineColor?: string
  showLabels?: boolean
  labelClassName?: string
  animationDuration?: number
  loop?: boolean
  /** Matches app shell: landing uses `dark` only. */
  appearance?: "dark" | "light"
  /** When false, draw static paths (no Framer loop) — e.g. prefers-reduced-motion. */
  animated?: boolean
  className?: string
}

export function WorldMap({
  dots = [],
  lineColor = "#FF2D2D",
  showLabels = true,
  labelClassName = "text-xs",
  animationDuration = 2,
  loop = true,
  appearance = "dark",
  animated = true,
  className,
}: WorldMapProps) {
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null)
  const uid = useId().replace(/:/g, "")

  const map = useMemo(() => new DottedMap({ height: 160, grid: "diagonal" }), [])

  const svgMap = useMemo(
    () =>
      map.getSVG({
        radius: 0.22,
        color: appearance === "dark" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.18)",
        shape: "circle",
        backgroundColor: appearance === "dark" ? "#04050a" : "#ffffff",
      }),
    [map, appearance],
  )

  const projectPoint = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360)
    const y = (90 - lat) * (400 / 180)
    return { x, y }
  }

  const createCurvedPath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const midX = (start.x + end.x) / 2
    const midY = Math.min(start.y, end.y) - 50
    return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`
  }

  const staggerDelay = 0.3
  const totalAnimationTime = dots.length * staggerDelay + animationDuration
  const pauseTime = 2
  const fullCycleDuration = totalAnimationTime + pauseTime

  const gradId = `path-gradient-${uid}`
  const glowId = `glow-${uid}`

  const dataSrc = `data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`

  return (
    <div
      className={cn(
        "relative aspect-[3/2] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[#04050a] font-sans sm:aspect-[5/3]",
        appearance === "light" && "border-zinc-200 bg-white",
        className,
      )}
    >
      <Image
        src={dataSrc}
        className="pointer-events-none h-full w-full select-none object-cover [mask-image:linear-gradient(to_bottom,transparent,white_4%,white_96%,transparent)]"
        alt="Dotted world map"
        height={640}
        width={960}
        draggable={false}
        priority={false}
        unoptimized
      />
      <svg
        viewBox="0 0 800 400"
        className="pointer-events-auto absolute inset-0 h-full w-full select-none"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="95%" stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          <filter id={glowId}>
            <feMorphology operator="dilate" radius="0.5" />
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng)
          const endPoint = projectPoint(dot.end.lat, dot.end.lng)
          const d = createCurvedPath(startPoint, endPoint)
          const startTime = (i * staggerDelay) / fullCycleDuration
          const endTime = (i * staggerDelay + animationDuration) / fullCycleDuration
          const resetTime = totalAnimationTime / fullCycleDuration

          return (
            <g key={`path-group-${i}`}>
              {animated && loop ? (
                <motion.path
                  d={d}
                  fill="none"
                  stroke={`url(#${gradId})`}
                  strokeWidth="1"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: [0, 0, 1, 1, 0] }}
                  transition={{
                    duration: fullCycleDuration,
                    times: [0, startTime, endTime, resetTime, 1],
                    ease: "easeInOut",
                    repeat: Number.POSITIVE_INFINITY,
                    repeatDelay: 0,
                  }}
                />
              ) : (
                <path d={d} fill="none" stroke={lineColor} strokeWidth="1" opacity={0.75} />
              )}

              {animated && loop && (
                <motion.circle
                  r="4"
                  fill={lineColor}
                  initial={{ offsetDistance: "0%", opacity: 0 }}
                  animate={{
                    offsetDistance: ["0%", "0%", "100%", "100%", "100%"],
                    opacity: [0, 0, 1, 0, 0],
                  }}
                  transition={{
                    duration: fullCycleDuration,
                    times: [0, startTime, endTime, resetTime, 1],
                    ease: "easeInOut",
                    repeat: Number.POSITIVE_INFINITY,
                    repeatDelay: 0,
                  }}
                  style={{
                    offsetPath: `path('${d.replace(/'/g, "\\'")}')`,
                  }}
                />
              )}
            </g>
          )
        })}

        {dots.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng)
          const endPoint = projectPoint(dot.end.lat, dot.end.lng)

          return (
            <g key={`points-group-${i}`}>
              <g>
                <motion.g
                  onHoverStart={() => setHoveredLocation(dot.start.label ?? `Location ${i + 1}`)}
                  onHoverEnd={() => setHoveredLocation(null)}
                  className="cursor-pointer"
                  whileHover={{ scale: 1.2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <circle cx={startPoint.x} cy={startPoint.y} r="3" fill={lineColor} filter={`url(#${glowId})`} className="drop-shadow-lg" />
                  {animated && (
                    <circle cx={startPoint.x} cy={startPoint.y} r="3" fill={lineColor} opacity="0.5">
                      <animate attributeName="r" from="3" to="12" dur="2s" begin="0s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="2s" begin="0s" repeatCount="indefinite" />
                    </circle>
                  )}
                </motion.g>

                {showLabels && dot.start.label && (
                  <motion.g
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 * i + 0.3, duration: 0.5 }}
                    className="pointer-events-none"
                  >
                    <foreignObject x={startPoint.x - 50} y={startPoint.y - 35} width="100" height="30" className="block">
                      <div className="flex h-full items-center justify-center">
                        <span
                          className={cn(
                            "rounded-md border border-white/15 bg-black/90 px-2 py-0.5 font-medium text-white shadow-sm",
                            labelClassName,
                            appearance === "light" && "border-zinc-200 bg-white/95 text-zinc-900",
                          )}
                        >
                          {dot.start.label}
                        </span>
                      </div>
                    </foreignObject>
                  </motion.g>
                )}
              </g>

              <g>
                <motion.g
                  onHoverStart={() => setHoveredLocation(dot.end.label ?? `Destination ${i + 1}`)}
                  onHoverEnd={() => setHoveredLocation(null)}
                  className="cursor-pointer"
                  whileHover={{ scale: 1.2 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <circle cx={endPoint.x} cy={endPoint.y} r="3" fill={lineColor} filter={`url(#${glowId})`} className="drop-shadow-lg" />
                  {animated && (
                    <circle cx={endPoint.x} cy={endPoint.y} r="3" fill={lineColor} opacity="0.5">
                      <animate attributeName="r" from="3" to="12" dur="2s" begin="0.5s" repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="2s" begin="0.5s" repeatCount="indefinite" />
                    </circle>
                  )}
                </motion.g>

                {showLabels && dot.end.label && (
                  <motion.g
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 * i + 0.5, duration: 0.5 }}
                    className="pointer-events-none"
                  >
                    <foreignObject x={endPoint.x - 50} y={endPoint.y - 35} width="100" height="30" className="block">
                      <div className="flex h-full items-center justify-center">
                        <span
                          className={cn(
                            "rounded-md border border-white/15 bg-black/90 px-2 py-0.5 font-medium text-white shadow-sm",
                            labelClassName,
                            appearance === "light" && "border-zinc-200 bg-white/95 text-zinc-900",
                          )}
                        >
                          {dot.end.label}
                        </span>
                      </div>
                    </foreignObject>
                  </motion.g>
                )}
              </g>
            </g>
          )
        })}
      </svg>

      <AnimatePresence>
        {hoveredLocation && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-4 rounded-lg border border-white/15 bg-black/90 px-3 py-2 text-sm font-medium text-white backdrop-blur-sm sm:hidden"
          >
            {hoveredLocation}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default WorldMap
