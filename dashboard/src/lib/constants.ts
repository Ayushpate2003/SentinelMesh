const defaultApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002"
const defaultWsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8002"

const runningInBrowser = typeof window !== "undefined"

function normalizeBrowserApiUrl(url: string): string {
  if (url.includes("backend:8002")) return "http://localhost:8002"
  return url
}

function normalizeBrowserWsUrl(url: string): string {
  if (url.includes("backend:8002")) return "ws://localhost:8002"
  return url
}

// If a browser build gets Docker-internal hostnames, fall back to mapped localhost ports.
export const API_BASE_URL = runningInBrowser ? normalizeBrowserApiUrl(defaultApiUrl) : defaultApiUrl

export const WS_BASE_URL = runningInBrowser ? normalizeBrowserWsUrl(defaultWsUrl) : defaultWsUrl
