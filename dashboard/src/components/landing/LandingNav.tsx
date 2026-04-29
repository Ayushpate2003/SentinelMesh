"use client"

import { useAuth } from "@/context/AuthContext"
import { SentinelMeshLogo } from "@/components/brand/SentinelMeshLogo"
import { LandingPressable } from "@/components/landing/motion/LandingPressable"

const links = [
  { href: "#how-it-works", label: "Platform" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
  { href: "#waitlist", label: "Waitlist" },
  { href: "#security", label: "Security" },
]

export function LandingNav() {
  const { user, loading } = useAuth()

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#05070A]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <SentinelMeshLogo heightPx={36} priority />
        <nav className="hidden items-center gap-6 text-xs font-medium uppercase tracking-wider text-zinc-400 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="landing-nav-anchor transition hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {!loading && user ? (
            <LandingPressable
              href={user.role === "ADMIN" ? "/admin" : "/dashboard/user"}
              className="inline-flex min-h-[40px] items-center justify-center bg-[#FF2D2D] px-3 py-2 text-xs font-semibold text-white shadow-[0_0_20px_-6px_rgba(255,45,45,0.5)] will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.04] hover:shadow-[0_0_28px_-6px_rgba(255,45,45,0.65)] sm:px-4 sm:text-sm"
            >
              {user.role === "ADMIN" ? "Admin Console" : "Dashboard"}
            </LandingPressable>
          ) : (
            <>
              <LandingPressable
                href="/login"
                className="inline-flex min-h-[40px] items-center justify-center border border-white/20 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/90 will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.04] hover:border-white/35 hover:shadow-[0_0_20px_-6px_rgba(255,255,255,0.12)] sm:px-4 sm:text-sm"
              >
                Log in
              </LandingPressable>
              <LandingPressable
                href="/register"
                className="inline-flex min-h-[40px] items-center justify-center bg-[#FF2D2D] px-3 py-2 text-xs font-semibold text-white shadow-[0_0_20px_-6px_rgba(255,45,45,0.5)] will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.04] hover:shadow-[0_0_28px_-6px_rgba(255,45,45,0.65)] sm:px-4 sm:text-sm"
              >
                Start trial
              </LandingPressable>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
