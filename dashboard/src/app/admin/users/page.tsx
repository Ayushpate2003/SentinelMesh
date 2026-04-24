"use client"

import { useEffect, useState } from "react"
import { UserTable, type AdminUser } from "@/components/admin/UserTable"
import { apiFetch } from "@/lib/api"
import { useRequireAuth } from "@/hooks/useRequireAuth"

type Toast = { type: "success" | "error"; message: string } | null

export default function AdminUsersPage() {
  const { user, loading: authLoading, authorized } = useRequireAuth("ADMIN")
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingByUser, setLoadingByUser] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<Toast>(null)

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 2500)
  }

  const fetchUsers = async () => {
    const res = await apiFetch("/api/v1/admin/users")
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || "Failed to fetch users")
    setUsers(data.users || [])
  }

  useEffect(() => {
    if (!authorized) return
    const init = async () => {
      setLoadingUsers(true)
      try {
        await fetchUsers()
      } catch {
        showToast("error", "Failed to load users")
      } finally {
        setLoadingUsers(false)
      }
    }
    init()
  }, [authorized])

  const handleChangeRole = async (userId: string, role: "ADMIN" | "USER") => {
    setLoadingByUser((s) => ({ ...s, [userId]: true }))
    const previous = users
    setUsers((list) => list.map((u) => (u.id === userId ? { ...u, role } : u)))
    try {
      const res = await apiFetch(`/api/v1/admin/users/${userId}/role`, {
        method: "POST",
        includeCsrf: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Failed to update role")
      showToast("success", "Role updated successfully")
    } catch (err) {
      setUsers(previous)
      showToast("error", err instanceof Error ? err.message : "Role update failed")
    } finally {
      setLoadingByUser((s) => ({ ...s, [userId]: false }))
    }
  }

  if (authLoading || !authorized || loadingUsers) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 md:p-8">
        <div className="mb-6 h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="space-y-2 rounded-xl border border-border p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-8">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg border px-4 py-2 text-sm ${
            toast.type === "success" ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-red-500/40 bg-red-500/10 text-red-400"
          }`}
        >
          {toast.message}
        </div>
      )}

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin User Management</h1>
          <p className="text-muted-foreground">View users and manage roles with strict RBAC controls.</p>
        </div>
      </header>

      <UserTable users={users} currentAdminId={user?.id || ""} onChangeRole={handleChangeRole} loadingByUser={loadingByUser} />
    </div>
  )
}
