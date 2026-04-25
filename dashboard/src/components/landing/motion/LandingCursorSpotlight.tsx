"use client"

import { useEffect } from "react"

type Props = {
  enabled: boolean
}

/** Radial glow that follows the pointer (desktop only). */
export function LandingCursorSpotlight({ enabled }: Props) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    let raf = 0
    const root = document.documentElement

    const onMove = (e: MouseEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        root.style.setProperty("--landing-cursor-x", `${e.clientX}px`)
        root.style.setProperty("--landing-cursor-y", `${e.clientY}px`)
      })
    }

    window.addEventListener("mousemove", onMove, { passive: true })
    return () => window.removeEventListener("mousemove", onMove)
  }, [enabled])

  if (!enabled) return null

  return (
    <div
      className="landing-cursor-glow pointer-events-none fixed inset-0 z-[1] hidden md:block"
      aria-hidden
    />
  )
}
