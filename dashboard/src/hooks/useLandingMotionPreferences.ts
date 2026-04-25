"use client"

import { useEffect, useState } from "react"

export type LandingMotionPreferences = {
  /** User or system prefers reduced motion */
  reduceMotion: boolean
  /** Small viewport — lighter animations */
  narrow: boolean
}

export function useLandingMotionPreferences(): LandingMotionPreferences {
  const [reduceMotion, setReduceMotion] = useState(false)
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)")
    const mqNarrow = window.matchMedia("(max-width: 768px)")

    const sync = () => {
      setReduceMotion(mqReduce.matches)
      setNarrow(mqNarrow.matches)
    }
    sync()
    mqReduce.addEventListener("change", sync)
    mqNarrow.addEventListener("change", sync)
    return () => {
      mqReduce.removeEventListener("change", sync)
      mqNarrow.removeEventListener("change", sync)
    }
  }, [])

  return { reduceMotion, narrow }
}
