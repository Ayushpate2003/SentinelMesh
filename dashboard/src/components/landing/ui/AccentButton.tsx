import Link from "next/link"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  href: string
  className?: string
  external?: boolean
}

export function AccentButton({ children, href, className, external }: Props) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF2D2D] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_-4px_rgba(255,45,45,0.55)] transition hover:bg-[#ff4747] hover:shadow-[0_0_32px_-4px_rgba(255,45,45,0.65)] active:scale-[0.98]"

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
