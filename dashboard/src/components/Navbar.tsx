"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { SentinelMeshLogo } from "@/components/brand/SentinelMeshLogo"
import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, reconnecting, logout } = useAuth()

  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/landing" ||
    pathname === "/waitlist" ||
    pathname === "/"
  ) {
    return null
  }

  if (loading) {
    return <div className="h-12 w-full border-b border-border bg-background/80" />
  }

  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-4 text-sm">
        <SentinelMeshLogo heightPx={28} href="/" className="mr-1" />
        <Link href="/admin" className="hover:text-primary">
          Admin console
        </Link>
        <Link href="/dashboard/user" className="hover:text-primary">User Dashboard</Link>
        {user?.role === "ADMIN" && <Link href="/admin/users" className="hover:text-primary">Admin</Link>}
      </div>
      <div className="flex items-center gap-2">
        {reconnecting && <span className="text-xs text-amber-400">Reconnecting...</span>}
        {user ? (
          <>
            <span className="text-xs text-muted-foreground">{user.email}</span>
            <Badge variant="outline">{user.role}</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await logout()
                router.replace("/login")
              }}
            >
              Logout
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => router.replace("/login")}>Login</Button>
        )}
      </div>
    </nav>
  )
}
