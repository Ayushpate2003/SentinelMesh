const API_PORT = "8002"

function envApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || `http://localhost:${API_PORT}`
}

function envWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL || `ws://localhost:${API_PORT}`
}

/** True when we should replace loopback with the page hostname (LAN / “Network” URL in dev). */
function useLanAwareBackend(): boolean {
  const u = (process.env.NEXT_PUBLIC_API_URL || "").trim()
  if (!u) return true
  if (u.includes("backend:")) return true
  try {
    const parsed = new URL(u)
    const loopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80")
    if (loopback && port === API_PORT) return true
  } catch {
    /* ignore */
  }
  return false
}

function normalizeDockerInternalUrl(url: string): string {
  if (url.includes("backend:8002") || url.includes("backend-full:8002")) {
    return url
      .replace(/http:\/\/backend(-full)?:8002/g, `http://localhost:${API_PORT}`)
      .replace(/ws:\/\/backend(-full)?:8002/g, `ws://localhost:${API_PORT}`)
  }
  return url
}

/**
 * Base URL for REST calls from the browser or server.
 * When you open the app as http://&lt;LAN-IP&gt;:3001, uses that same host for :8002 so Docker/host API is reachable.
 */
export function getApiBaseUrl(): string {
  let base = normalizeDockerInternalUrl(envApiUrl())
  if (typeof window === "undefined") {
    return base
  }
  if (!useLanAwareBackend()) {
    return base
  }
  const host = window.location.hostname
  const isLoopback = host === "localhost" || host === "127.0.0.1"
  if (!isLoopback) {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:"
    return `${protocol}//${host}:${API_PORT}`
  }
  return base
}

/**
 * WebSocket origin for real-time routes (e.g. /ws/alerts).
 */
export function getWsBaseUrl(): string {
  let base = normalizeDockerInternalUrl(envWsUrl())
  if (typeof window === "undefined") {
    return base
  }
  if (!useLanAwareBackend()) {
    return base
  }
  const host = window.location.hostname
  const isLoopback = host === "localhost" || host === "127.0.0.1"
  if (!isLoopback) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${host}:${API_PORT}`
  }
  return base
}
