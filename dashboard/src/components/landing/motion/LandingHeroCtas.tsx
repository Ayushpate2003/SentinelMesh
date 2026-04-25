"use client"

import { LandingPressable } from "@/components/landing/motion/LandingPressable"

export function LandingHeroCtas() {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      <LandingPressable
        href="/register"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 bg-[#FF2D2D] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-4px_rgba(255,45,45,0.55)] will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] duration-200 hover:scale-[1.03] hover:shadow-[0_0_40px_-4px_rgba(255,45,45,0.75)] active:scale-[0.98]"
      >
        Start free trial
      </LandingPressable>
      <LandingPressable
        href="/login"
        className="inline-flex min-h-[44px] items-center justify-center gap-2 border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/90 will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow,border-color] duration-200 hover:scale-[1.03] hover:border-white/35 hover:bg-white/[0.08] hover:shadow-[0_0_28px_-8px_rgba(255,255,255,0.12)] active:scale-[0.98]"
      >
        Log in
      </LandingPressable>
      <LandingPressable
        href="mailto:hello@sentinelmesh.io?subject=Demo%20request"
        external
        className="inline-flex min-h-[44px] items-center justify-center gap-2 border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/90 will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] duration-200 hover:scale-[1.03] hover:border-white/35 hover:bg-white/[0.08] active:scale-[0.98]"
      >
        Book demo
      </LandingPressable>
    </div>
  )
}
