"use client"

import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"
import { AccentButton } from "@/components/landing/ui/AccentButton"
import { LandingPressable } from "@/components/landing/motion/LandingPressable"
import { cn } from "@/lib/utils"

const plans = [
  {
    name: "Starter",
    price: "Free",
    detail: "For solo builders",
    features: ["1K events / mo", "1 integration", "Community support", "Basic audit trail"],
    href: "/register",
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$79",
    detail: "per seat / month",
    features: ["Unlimited events", "All integrations", "Priority support", "SSO-ready RBAC", "Advanced analytics"],
    href: "/register",
    cta: "Go Pro",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    detail: "For regulated teams",
    features: ["Dedicated mesh", "VPC / on-prem", "24/7 TAM", "Custom SLAs", "Professional services"],
    href: "mailto:hello@sentinelmesh.io?subject=Enterprise",
    cta: "Talk to us",
    highlight: false,
    external: true,
  },
]

type Props = {
  reduceMotion: boolean
  narrow: boolean
}

export function PricingSection({ reduceMotion, narrow }: Props) {
  const pulseCta = !reduceMotion && !narrow

  return (
    <SectionShell id="pricing" className="py-14 sm:py-18">
      <div data-landing-reveal className="max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">Pricing</h2>
        <p className="mt-3 text-sm text-zinc-400 sm:text-base">Start free. Scale when your automations go mission-critical.</p>
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.name} data-landing-reveal data-landing-card>
            <GlassPanel
              className={cn(
                "group landing-pricing-card landing-card relative flex h-full flex-col rounded-2xl p-6 transition-[transform,box-shadow] duration-300 will-change-transform [transform:translateZ(0)]",
                p.highlight &&
                  "landing-pricing-pro border-[#FF2D2D]/40 bg-[#FF2D2D]/[0.06] shadow-[0_0_48px_-16px_rgba(255,45,45,0.35)] ring-1 ring-[#FF2D2D]/25",
              )}
              hover={!p.highlight}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#FF2D2D] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-white">{p.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-white">{p.price}</span>
                {p.name === "Pro" && <span className="text-sm text-zinc-500">{p.detail}</span>}
              </div>
              {p.name !== "Pro" && <p className="mt-1 text-xs text-zinc-500">{p.detail}</p>}
              {p.name === "Pro" && <p className="mt-1 text-xs text-zinc-400">{p.detail}</p>}
              <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-300">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex gap-2 transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-zinc-100"
                  >
                    <span className="text-[#FF2D2D]">/</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                {p.highlight ? (
                  <AccentButton href={p.href} className={cn("w-full", pulseCta && "landing-cta-pulse")}>
                    {p.cta}
                  </AccentButton>
                ) : p.external ? (
                  <LandingPressable
                    href={p.href}
                    external
                    className="inline-flex w-full min-h-[44px] items-center justify-center border border-white/20 bg-white/[0.04] py-2.5 text-sm font-semibold text-white will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.02] hover:bg-white/[0.08] hover:shadow-[0_0_24px_-8px_rgba(255,255,255,0.12)]"
                  >
                    {p.cta}
                  </LandingPressable>
                ) : (
                  <LandingPressable
                    href={p.href}
                    className="inline-flex w-full min-h-[44px] items-center justify-center border border-white/20 bg-white/[0.04] py-2.5 text-sm font-semibold text-white will-change-transform [transform:translateZ(0)] transition-[transform,box-shadow] hover:scale-[1.02] hover:bg-white/[0.08]"
                  >
                    {p.cta}
                  </LandingPressable>
                )}
              </div>
            </GlassPanel>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
