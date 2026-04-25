"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef } from "react"
import { LandingNav } from "@/components/landing/LandingNav"
import { LandingCursorSpotlight } from "@/components/landing/motion/LandingCursorSpotlight"
import { HeroSection } from "@/components/landing/sections/HeroSection"
import { MetricsSection } from "@/components/landing/sections/MetricsSection"
import { HowItWorksSection } from "@/components/landing/sections/HowItWorksSection"
import { IntegrationsSection } from "@/components/landing/sections/IntegrationsSection"
import { DashboardPreviewSection } from "@/components/landing/sections/DashboardPreviewSection"
import { SecuritySection } from "@/components/landing/sections/SecuritySection"
import { RealtimeEngineSection } from "@/components/landing/sections/RealtimeEngineSection"
import { UseCasesSection } from "@/components/landing/sections/UseCasesSection"
import { PricingSection } from "@/components/landing/sections/PricingSection"
import { MidCtaSection } from "@/components/landing/sections/MidCtaSection"
import { WaitlistSection } from "@/components/landing/sections/WaitlistSection"
import { FinalCtaSection } from "@/components/landing/sections/FinalCtaSection"
import { LandingFooter } from "@/components/landing/sections/LandingFooter"
import { setupLandingScrollAnimations } from "@/components/landing/motion/landingScroll"
import { useLandingMotionPreferences } from "@/hooks/useLandingMotionPreferences"
import { cn } from "@/lib/utils"

const GLSLHills = dynamic(() => import("@/components/ui/glsl-hills").then((m) => m.GLSLHills), { ssr: false })

export function LandingView() {
  const rootRef = useRef<HTMLDivElement>(null)
  const { reduceMotion, narrow } = useLandingMotionPreferences()

  useEffect(() => {
    let reverted = false
    let ctx: { revert: () => void } | null = null

    ;(async () => {
      const { default: gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      if (reverted || typeof window === "undefined") return
      gsap.registerPlugin(ScrollTrigger)

      ctx = gsap.context(() => {
        setupLandingScrollAnimations({ reduceMotion, narrow })
      }, rootRef)

      ScrollTrigger.refresh()
    })()

    return () => {
      reverted = true
      ctx?.revert()
    }
  }, [reduceMotion, narrow])

  const cursorOn = !reduceMotion && !narrow
  const hillsOn = !reduceMotion && !narrow

  return (
    <div ref={rootRef} className="landing-page relative min-h-screen bg-[#05070A] text-white selection:bg-[#FF2D2D]/25">
      <LandingCursorSpotlight enabled={cursorOn} />
      <div
        id="landing-page-bg-grid"
        className={cn(
          "pointer-events-none fixed inset-0 z-0 will-change-[background-position] [transform:translateZ(0)]",
          hillsOn ? "opacity-[0.14]" : "opacity-[0.22]",
        )}
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: "56px 56px",
        }}
      />
      {hillsOn && (
        <div className="pointer-events-none fixed inset-0 z-[1] h-[100dvh] w-full opacity-[0.68] mix-blend-soft-light">
          <GLSLHills
            className="h-full w-full"
            width="100%"
            height="100%"
            cameraZ={125}
            planeSize={256}
            speed={0.36}
            enabled
          />
        </div>
      )}
      <div className="relative z-10">
        <div id="landing-hero-inner">
          <LandingNav />
          <HeroSection />
        </div>
        <MetricsSection />
        <HowItWorksSection reduceMotion={reduceMotion} narrow={narrow} />
        <IntegrationsSection reduceMotion={reduceMotion} narrow={narrow} />
        <DashboardPreviewSection reduceMotion={reduceMotion} narrow={narrow} />
        <SecuritySection reduceMotion={reduceMotion} narrow={narrow} />
        <RealtimeEngineSection reduceMotion={reduceMotion} narrow={narrow} />
        <UseCasesSection />
        <PricingSection reduceMotion={reduceMotion} narrow={narrow} />
        <MidCtaSection reduceMotion={reduceMotion} narrow={narrow} />
        <WaitlistSection />
        <FinalCtaSection reduceMotion={reduceMotion} narrow={narrow} />
        <LandingFooter />
      </div>
    </div>
  )
}
