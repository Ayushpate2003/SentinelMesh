import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

/** Intrinsic asset ratio (1024×390). */
const ASPECT = 1024 / 390

export type SentinelMeshLogoProps = {
  className?: string
  /** Target height in CSS pixels; width follows aspect ratio. */
  heightPx?: number
  /** Wrap in a link; pass `null` for static branding. */
  href?: string | null
  priority?: boolean
}

export function SentinelMeshLogo({
  className,
  heightPx = 32,
  href = "/",
  priority = false,
}: SentinelMeshLogoProps) {
  const h = heightPx
  const w = Math.round(h * ASPECT)

  const img = (
    <Image
      src="/brand/sentinelmesh-logo.png"
      alt="SentinelMesh"
      width={w}
      height={h}
      priority={priority}
      className={cn("max-w-[min(92vw,320px)] object-contain object-left", className)}
      style={{ height: `${h}px`, width: "auto" }}
    />
  )

  if (href != null && href !== "") {
    return (
      <Link
        href={href}
        className="inline-flex shrink-0 items-center rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {img}
      </Link>
    )
  }

  return <span className="inline-flex shrink-0 items-center">{img}</span>
}
