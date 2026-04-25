import type { Metadata } from "next"
import { LandingView } from "@/components/landing/LandingView"

export const metadata: Metadata = {
  title: "SentinelMesh — Autonomous security for AI workflows",
  description:
    "Monitor, detect, and block threats across APIs, automations, and AI agents in real time. RBAC, audit logs, and enterprise integrations.",
  openGraph: {
    title: "SentinelMesh",
    description: "Autonomous security for AI workflows.",
  },
}

export default function HomePage() {
  return <LandingView />
}
