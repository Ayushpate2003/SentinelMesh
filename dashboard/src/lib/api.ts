"use client"

import { API_BASE_URL } from "@/lib/constants"

const CSRF_KEY = "sentinelmesh-csrf"
const AUTH_REFRESHING_EVENT = "sentinelmesh:auth-refreshing"
const AUTH_REFRESHED_EVENT = "sentinelmesh:auth-refreshed"
const AUTH_FAILED_EVENT = "sentinelmesh:auth-failed"

export type ApiOptions = RequestInit & {
  includeCsrf?: boolean
  _retry?: boolean
}

function getFallbackBaseUrl(): string | null {
  try {
    const parsed = new URL(API_BASE_URL)
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1"
      return parsed.toString().replace(/\/$/, "")
    }
  } catch {
    return null
  }
  return null
}

async function fetchWithBaseFallback(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    const fallbackBaseUrl = getFallbackBaseUrl()
    if (!fallbackBaseUrl) throw new TypeError("Failed to fetch")
    return fetch(`${fallbackBaseUrl}${path}`, init)
  }
}

export async function ensureCsrfToken(): Promise<string> {
  if (typeof window === "undefined") return ""
  const existing = localStorage.getItem(CSRF_KEY)
  if (existing) return existing
  const res = await fetchWithBaseFallback("/api/v1/auth/csrf", {
    method: "GET",
    credentials: "include",
  })
  if (!res.ok) return ""
  const data = await res.json()
  const token = data.csrf_token || ""
  if (token) localStorage.setItem(CSRF_KEY, token)
  return token
}

let refreshPromise: Promise<boolean> | null = null

function emitAuthEvent(eventName: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventName))
  }
}

async function performRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    emitAuthEvent(AUTH_REFRESHING_EVENT)
    try {
      const refreshed = await fetchWithBaseFallback("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
      })
      if (!refreshed.ok) {
        emitAuthEvent(AUTH_FAILED_EVENT)
        return false
      }
      // CSRF can rotate after refresh; force refresh of local cached token.
      localStorage.removeItem(CSRF_KEY)
      await ensureCsrfToken()
      emitAuthEvent(AUTH_REFRESHED_EVENT)
      return true
    } catch {
      emitAuthEvent(AUTH_FAILED_EVENT)
      return false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function apiFetch(path: string, options: ApiOptions = {}) {
  const includeCsrf = options.includeCsrf ?? true
  const shouldRetry = options._retry !== true
  const headers = new Headers(options.headers || {})

  if (includeCsrf) {
    const csrf = (await ensureCsrfToken()) || (typeof window !== "undefined" ? localStorage.getItem(CSRF_KEY) : "") || ""
    if (csrf) headers.set("x-csrf-token", csrf)
  }

  const response = await fetchWithBaseFallback(path, {
    ...options,
    credentials: "include",
    headers,
  })

  const isRefreshEndpoint = path === "/api/v1/auth/refresh"
  if (response.status === 403 && includeCsrf && shouldRetry) {
    if (typeof window !== "undefined") localStorage.removeItem(CSRF_KEY)
    await ensureCsrfToken()
    return apiFetch(path, { ...options, _retry: true })
  }

  if (response.status === 401 && shouldRetry && !isRefreshEndpoint) {
    const refreshed = await performRefresh()
    if (refreshed) {
      return apiFetch(path, { ...options, _retry: true })
    }
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login"
    }
  }

  return response
}

export const apiAuthEvents = {
  AUTH_REFRESHING_EVENT,
  AUTH_REFRESHED_EVENT,
  AUTH_FAILED_EVENT,
}
