"use client"

import { WaitlistHero } from "@/components/ui/waitlist-hero"
import { SectionShell } from "@/components/landing/ui/SectionShell"

export function WaitlistSection() {
  return (
    <SectionShell id="waitlist" className="py-12 sm:py-16">
      <div data-landing-reveal className="mx-auto max-w-5xl">
        <WaitlistHero variant="embedded" />
      </div>
    </SectionShell>
  )
}
