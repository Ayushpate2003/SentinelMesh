import Link from "next/link"
import { WaitlistHero } from "@/components/ui/waitlist-hero"

export default function WaitlistPage() {
  return (
    <div className="relative min-h-screen bg-[#05070A]">
      <Link
        href="/"
        className="absolute left-4 top-4 z-[60] rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-300 backdrop-blur transition hover:border-white/20 hover:text-white sm:left-6 sm:top-6"
      >
        ← SentinelMesh
      </Link>
      <WaitlistHero variant="fullscreen" />
    </div>
  )
}
