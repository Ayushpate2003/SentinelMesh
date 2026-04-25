import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  href: string
  className?: string
  external?: boolean
}

export function OutlineButton({ children, href, className, external }: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:border-white/35 hover:bg-white/[0.08] active:scale-[0.98]"

  if (external) {
    return (
      <a href={href} className={cn(base, className)} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cn(base, className)}>
      {children}
    </Link>
  )
}
