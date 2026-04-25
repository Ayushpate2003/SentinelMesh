import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function GlassPanel({
  children,
  className,
  hover = false,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-xl",
        hover &&
          "transition-all duration-300 hover:-translate-y-1 hover:border-[#FF2D2D]/35 hover:shadow-[0_0_40px_-12px_rgba(255,45,45,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  )
}
