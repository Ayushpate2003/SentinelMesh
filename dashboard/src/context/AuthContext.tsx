"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { apiAuthEvents, apiFetch, ensureCsrfToken } from "@/lib/api"

type AuthUser = {
  id: string
  email: string
  role: "ADMIN" | "USER"
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  reconnecting: boolean
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [reconnecting, setReconnecting] = useState(false)

  const refreshUser = async () => {
    try {
      await ensureCsrfToken()
      const res = await apiFetch("/api/v1/auth/me")
      if (!res.ok) {
        setUser(null)
        return
      }
      const data = await res.json()
      setUser(data)
    } catch {
      setUser(null)
    }
  }

  const logout = async () => {
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST", includeCsrf: true })
    } finally {
      setUser(null)
    }
  }

  useEffect(() => {
    setLoading(true)
    refreshUser().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onRefreshing = () => setReconnecting(true)
    const onRefreshed = () => {
      setReconnecting(false)
      refreshUser()
    }
    const onFailed = () => {
      setReconnecting(false)
      setUser(null)
    }
    window.addEventListener(apiAuthEvents.AUTH_REFRESHING_EVENT, onRefreshing)
    window.addEventListener(apiAuthEvents.AUTH_REFRESHED_EVENT, onRefreshed)
    window.addEventListener(apiAuthEvents.AUTH_FAILED_EVENT, onFailed)
    return () => {
      window.removeEventListener(apiAuthEvents.AUTH_REFRESHING_EVENT, onRefreshing)
      window.removeEventListener(apiAuthEvents.AUTH_REFRESHED_EVENT, onRefreshed)
      window.removeEventListener(apiAuthEvents.AUTH_FAILED_EVENT, onFailed)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      refreshUser()
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, reconnecting, refreshUser, logout }),
    [user, loading, reconnecting]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return ctx
}
