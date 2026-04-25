"use client"

import Link from "next/link"
import { SentinelMeshLogo } from "@/components/brand/SentinelMeshLogo"
import { InfiniteTextMarquee } from "@/components/ui/infinite-text-marquee"
import { useLandingMotionPreferences } from "@/hooks/useLandingMotionPreferences"

type FooterLink = { href: string; label: string; external?: boolean }

const cols: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: "#how-it-works", label: "Platform" },
      { href: "#integrations", label: "Integrations" },
      { href: "#pricing", label: "Pricing" },
      { href: "#waitlist", label: "Waitlist" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/", label: "Overview" },
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create account" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "mailto:hello@sentinelmesh.io", label: "Contact", external: true },
      { href: "#security", label: "Security" },
    ],
  },
]

export function LandingFooter() {
  const { reduceMotion } = useLandingMotionPreferences()

  return (
    <footer data-landing-footer className="border-t border-white/[0.06] bg-[#04050a] px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-7xl overflow-hidden border-b border-white/[0.06] pb-10">
        <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Early access
        </p>
        <p className="mx-auto mb-6 max-w-xl text-center text-sm text-zinc-400">
          Be first to get API keys, mesh telemetry, and policy packs.
        </p>
        <InfiniteTextMarquee
          text="Join the early access list"
          link="#waitlist"
          speed={48}
          showTooltip={!reduceMotion}
          tooltipText="API keys · mesh telemetry · policy packs"
          fontSize="clamp(2.25rem, 7vw, 5rem)"
          hoverColor="#FF2D2D"
        />
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-10 sm:flex-row sm:justify-between">
        <div>
          <SentinelMeshLogo heightPx={40} href="/" />
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-zinc-500">
            Autonomous security for APIs, automations, and AI agents. Real-time detection and enforcement.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {cols.map((c) => (
            <div key={c.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{c.title}</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-400">
                {c.links.map((l) => (
                  <li key={l.label}>
                    {l.external || l.href.startsWith("mailto:") ? (
                      <a href={l.href} className="landing-footer-link inline-block text-left hover:text-white">
                        {l.label}
                      </a>
                    ) : l.href.startsWith("#") ? (
                      <a href={l.href} className="landing-footer-link inline-block text-left hover:text-white">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="landing-footer-link inline-block text-left hover:text-white">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl text-center text-[11px] text-zinc-600 sm:text-left">
        © {new Date().getFullYear()} SentinelMesh. All rights reserved.
      </p>
    </footer>
  )
}
