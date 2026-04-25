"use client"

import { motion, useReducedMotion } from "framer-motion"
import Link from "next/link"
import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type InfiniteTextMarqueeProps = {
  text?: string
  link?: string
  speed?: number
  showTooltip?: boolean
  tooltipText?: string
  fontSize?: string
  /** CSS color for default text (SentinelMesh: zinc on dark). */
  textColor?: string
  /** CSS color on hover (SentinelMesh accent). */
  hoverColor?: string
  className?: string
}

export function InfiniteTextMarquee({
  text = "Join the early access list",
  link = "/register",
  speed = 42,
  showTooltip = true,
  tooltipText = "API keys · mesh telemetry · policy packs",
  fontSize = "clamp(2.25rem, 6vw, 4.5rem)",
  textColor,
  hoverColor = "#FF2D2D",
  className,
}: InfiniteTextMarqueeProps) {
  const measureRef = useRef<HTMLSpanElement>(null)
  const [loopWidth, setLoopWidth] = useState(0)
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [rotation, setRotation] = useState(0)
  const maxRotation = 6
  const systemReduce = useReducedMotion()
  const animateMarquee = !systemReduce

  const segment = `${Array(6).fill(text).join(" — ")} — `

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setLoopWidth(el.offsetWidth))
    ro.observe(el)
    setLoopWidth(el.offsetWidth)
    return () => ro.disconnect()
  }, [text, fontSize])

  useEffect(() => {
    if (!showTooltip || systemReduce) return

    const handleMouseMove = (e: MouseEvent) => {
      setCursorPosition({ x: e.clientX, y: e.clientY })
      const midpoint = window.innerWidth / 2
      const distanceFromMidpoint = Math.abs(e.clientX - midpoint)
      const rot = (distanceFromMidpoint / midpoint) * maxRotation
      setRotation(e.clientX > midpoint ? rot : -rot)
    }

    window.addEventListener("mousemove", handleMouseMove, { passive: true })
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [showTooltip, systemReduce])

  const external = /^https?:\/\//.test(link)

  const spanClassName = cn(
    "inline-block cursor-pointer font-bold tracking-tight text-white transition-colors duration-200",
    !textColor && "text-white",
    "hover:text-[var(--marquee-hover)]",
  )

  const spanStyle: CSSProperties & { ["--marquee-hover"]?: string } = {
    fontSize,
    color: textColor,
    "--marquee-hover": hoverColor,
  }

  return (
    <div className={cn("relative w-full overflow-hidden", className)}>
      {showTooltip && !systemReduce && (
        <div
          className={cn(
            "following-tooltip pointer-events-none fixed z-[99] rounded-3xl bg-[#FF2D2D] px-8 py-4 text-nowrap text-sm font-bold text-white shadow-[0_0_40px_-8px_rgba(255,45,45,0.55)] transition-opacity duration-300",
            isHovered ? "opacity-100" : "opacity-0",
          )}
          style={{
            top: cursorPosition.y,
            left: cursorPosition.x,
            transform: `translate(-50%, calc(-100% - 16px)) rotate(${rotation}deg)`,
          }}
        >
          {tooltipText}
        </div>
      )}

      <div
        className="relative w-full overflow-x-hidden py-6 sm:py-8"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <motion.div
          className="flex w-max will-change-transform [transform:translateZ(0)]"
          animate={
            animateMarquee && loopWidth > 0
              ? { x: [0, -loopWidth] }
              : { x: 0 }
          }
          transition={
            animateMarquee && loopWidth > 0
              ? {
                  duration: speed,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "linear",
                }
              : { duration: 0 }
          }
        >
          <span className="flex shrink-0 items-center">
            {external ? (
              <a
                href={link}
                className="block w-max outline-none"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span ref={measureRef} className={spanClassName} style={spanStyle}>
                  {segment}
                </span>
              </a>
            ) : (
              <Link href={link} className="block w-max outline-none">
                <span ref={measureRef} className={spanClassName} style={spanStyle}>
                  {segment}
                </span>
              </Link>
            )}
          </span>
          <span className="flex shrink-0 items-center" aria-hidden>
            <span className={spanClassName} style={spanStyle}>
              {segment}
            </span>
          </span>
        </motion.div>
      </div>
    </div>
  )
}

export default InfiniteTextMarquee
