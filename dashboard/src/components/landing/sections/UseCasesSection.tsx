"use client"

import { Boxes, Bot, Globe, Scale } from "lucide-react"
import { SectionShell } from "@/components/landing/ui/SectionShell"
import { GlassPanel } from "@/components/landing/ui/GlassPanel"

const cases = [
  {
    title: "DevOps automation security",
    body: "Guard CI tokens, deployment hooks, and infra playbooks from lateral movement.",
    icon: Boxes,
  },
  {
    title: "AI agent governance",
    body: "Enforce least-privilege tool access and trace every agent decision end-to-end.",
    icon: Bot,
  },
  {
    title: "API threat detection",
    body: "Spot credential stuffing, token replay, and shadow APIs across environments.",
    icon: Globe,
  },
  {
    title: "Workflow compliance",
    body: "Continuous controls for regulated workflows without blocking innovation.",
    icon: Scale,
  },
]

export function UseCasesSection() {
  return (
    <SectionShell className="py-14 sm:py-18">
      <div data-landing-reveal className="max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">Built for your teams</h2>
        <p className="mt-3 text-sm text-zinc-400 sm:text-base">Use cases that map to how modern enterprises ship software.</p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {cases.map((c) => (
          <div key={c.title} data-landing-reveal data-landing-card>
            <GlassPanel
              className="group landing-use-card landing-card h-full rounded-2xl border-white/[0.08] p-5 sm:p-6"
            >
              <c.icon className="landing-use-icon h-5 w-5 text-[#FF2D2D]" strokeWidth={1.5} />
              <h3 className="mt-4 text-base font-semibold text-white">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{c.body}</p>
            </GlassPanel>
          </div>
        ))}
      </div>
    </SectionShell>
  )
}
