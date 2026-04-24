"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type AdminUser = {
  id: string
  email: string
  role: "ADMIN" | "USER"
  created_at: number
}

type UserTableProps = {
  users: AdminUser[]
  currentAdminId: string
  onChangeRole: (userId: string, role: "ADMIN" | "USER") => Promise<void>
  loadingByUser: Record<string, boolean>
}

export function UserTable({ users, currentAdminId, onChangeRole, loadingByUser }: UserTableProps) {
  const [confirm, setConfirm] = useState<{ userId: string; email: string; role: "ADMIN" | "USER" } | null>(null)

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-4">Email</th>
              <th className="p-4">Role</th>
              <th className="p-4">Created At</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentAdminId
              const targetRole: "ADMIN" | "USER" = user.role === "ADMIN" ? "USER" : "ADMIN"
              const loading = !!loadingByUser[user.id]
              return (
                <tr key={user.id} className="border-t border-border">
                  <td className="p-4">{user.email}</td>
                  <td className="p-4">
                    {user.role === "ADMIN" ? (
                      <Badge variant="outline" className="border-red-500/30 text-red-500">🔴 Admin</Badge>
                    ) : (
                      <Badge variant="outline" className="border-green-500/30 text-green-500">🟢 User</Badge>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground">{new Date(user.created_at * 1000).toLocaleString()}</td>
                  <td className="p-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || (isSelf && user.role === "ADMIN" && targetRole === "USER")}
                      onClick={() => setConfirm({ userId: user.id, email: user.email, role: targetRole })}
                    >
                      {loading ? "Updating..." : targetRole === "ADMIN" ? "Promote to Admin" : "Demote to User"}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-5">
            <h3 className="text-lg font-semibold">Confirm Role Change</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Change <span className="font-medium text-foreground">{confirm.email}</span> to{" "}
              <span className="font-medium text-foreground">{confirm.role}</span>?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                onClick={async () => {
                  await onChangeRole(confirm.userId, confirm.role)
                  setConfirm(null)
                }}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
