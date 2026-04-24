"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api"
import { API_BASE_URL } from "@/lib/constants"

const CSRF_KEY = "sentinelmesh-csrf"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const errorParam = searchParams.get("error") || searchParams.get("auth_err")
    if (errorParam) {
      setError(decodeURIComponent(errorParam))
    }
  }, [searchParams])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || "Login failed")
        return
      }
      if (data.csrf_token) localStorage.setItem(CSRF_KEY, data.csrf_token)
      if (data.role === "ADMIN") router.push("/")
      else router.push("/dashboard/user")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md rounded-xl border border-border p-6 space-y-4">
      <h1 className="text-2xl font-bold">Login</h1>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing in..." : "Sign in"}</Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          window.location.href = `${API_BASE_URL}/api/v1/auth/google/start?next_path=/dashboard/user`
        }}
      >
        Continue with Google
      </Button>
      <p className="text-xs text-muted-foreground">No account? <a href="/register" className="underline">Register</a></p>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <Suspense fallback={<div className="w-full max-w-md p-6 text-center">Loading...</div>}>
        <LoginContent />
      </Suspense>
    </div>
  )
}
