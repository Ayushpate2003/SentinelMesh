"use client"

import { useEffect, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"

export function useRequireAuth(role?: "ADMIN" | "USER") {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!user) {
      if (pathname !== "/login") router.replace("/login")
      return
    }
    if (role && user.role !== role) {
      if (user.role === "USER" && pathname !== "/dashboard/user") {
        router.replace("/dashboard/user")
      } else if (user.role === "ADMIN" && pathname !== "/dashboard") {
        router.replace("/dashboard")
      }
    }
  }, [loading, user, role, router, pathname])

  const authorized = useMemo(() => {
    if (loading) return false
    if (!user) return false
    if (role && user.role !== role) return false
    return true
  }, [loading, user, role])

  return { user, loading, authorized }
}
