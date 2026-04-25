"use client"

import Link from "next/link"
import { useCallback, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  href: string
  external?: boolean
  className?: string
  children: ReactNode
}

export function LandingPressable({ href, external, className, children }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null)

  const ripple = useCallback((e: React.MouseEvent) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const r = document.createElement("span")
    const rect = wrap.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    r.className = "pointer-events-none absolute rounded-full bg-white/20"
    r.style.width = r.style.height = `${size}px`
    r.style.left = `${e.clientX - rect.left - size / 2}px`
    r.style.top = `${e.clientY - rect.top - size / 2}px`
    r.style.willChange = "transform, opacity"
    wrap.appendChild(r)
    requestAnimationFrame(() => {
      r.style.transition = "transform 0.55s ease-out, opacity 0.55s ease-out"
      r.style.transform = "scale(2.2)"
      r.style.opacity = "0"
    })
    setTimeout(() => r.remove(), 600)
  }, [])

  const body = (
    <span ref={wrapRef} className="relative inline-flex w-full items-center justify-center overflow-hidden rounded-[inherit]">
      <span className="relative z-[1]">{children}</span>
    </span>
  )

  if (external) {
    return (
      <a
        href={href}
        className={cn("landing-pressable relative overflow-hidden rounded-lg", className)}
        onClick={ripple}
        target="_blank"
        rel="noopener noreferrer"
      >
        {body}
      </a>
    )
  }
  return (
    <Link href={href} className={cn("landing-pressable relative overflow-hidden rounded-lg", className)} onClick={ripple}>
      {body}
    </Link>
  )
}
