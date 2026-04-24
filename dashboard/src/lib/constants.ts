const defaultApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002"
const defaultWsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8002"

const runningInBrowser = typeof window !== "undefined"

// If a browser build accidentally gets the Docker-internal hostname, fall back to localhost.
export const API_BASE_URL = runningInBrowser
  ? defaultApiUrl.replace("http://backend:8002", "http://localhost:8002")
  : defaultApiUrl

export const WS_BASE_URL = runningInBrowser
  ? defaultWsUrl.replace("ws://backend:8002", "ws://localhost:8002")
  : defaultWsUrl
