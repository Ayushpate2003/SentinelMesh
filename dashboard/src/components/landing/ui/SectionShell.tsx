import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type SectionShellProps = {
  id?: string
  children: ReactNode
  className?: string
  innerClassName?: string
}

export function SectionShell({ id, children, className, innerClassName }: SectionShellProps) {
  return (
    <section id={id} className={cn("relative scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:py-24", className)}>
      <div className={cn("mx-auto max-w-6xl", innerClassName)}>{children}</div>
    </section>
  )
}
