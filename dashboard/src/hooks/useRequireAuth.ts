"use client"

import { useEffect, useMemo } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/context/AuthContext"

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1) || "/"
  return pathname
}

function isPublicPath(pathname: string) {
  const p = normalizePath(pathname)
  return p === "/login" || p === "/register" || p === "/" || p === "/landing" || p === "/waitlist"
}

export function useRequireAuth(role?: "ADMIN" | "USER") {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return
    if (!user) {
      if (!isPublicPath(pathname)) router.replace("/login")
      return
    }
    if (role && user.role !== role) {
      if (user.role === "USER" && pathname !== "/dashboard/user") {
        router.replace("/dashboard/user")
      } else if (user.role === "ADMIN" && pathname !== "/admin") {
        router.replace("/admin")
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
