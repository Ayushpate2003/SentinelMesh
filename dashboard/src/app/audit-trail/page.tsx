"use client"

import { useEffect, useState } from "react"
import { Shield, Terminal, CheckCircle, XCircle, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { apiFetch } from "@/lib/api"

interface AuditEntry {
  entry_id: string
  timestamp: number
  action: string
  actor: string
  details: string
  signature: string
}

export default function AuditTrailPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch(`/api/v1/audit-trail`)
      .then(res => res.json())
      .then(data => {
        setEntries(data)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch audit trail", err)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground p-8 font-mono">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter flex items-center gap-2 terminal-text">
            <Terminal className="w-8 h-8" />
            AUDIT_TRAIL.LOG
          </h1>
          <p className="text-muted-foreground mt-1 uppercase tracking-widest text-[10px]">Cryptographically Signed Immutable Ledger</p>
        </div>
        <a href="/admin" className="text-xs hover:text-primary transition-colors">← RETURN_TO_DASHBOARD</a>
      </header>

      <div className="glass rounded-2xl overflow-hidden border border-white/5">
        <div className="bg-white/5 p-4 flex justify-between items-center border-b border-white/10">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
            <div className="w-3 h-3 rounded-full bg-green-500/50" />
          </div>
          <div className="text-[10px] text-muted-foreground uppercase">SentinelMesh v1.0.0-alpha</div>
        </div>
        
        <div className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground animate-pulse">Initializing forensic scan...</div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">No audit records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-muted-foreground uppercase">
                  <tr>
                    <th className="p-4 font-medium">Timestamp</th>
                    <th className="p-4 font-medium">Action</th>
                    <th className="p-4 font-medium">Actor</th>
                    <th className="p-4 font-medium">Details</th>
                    <th className="p-4 font-medium">Signature</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {entries.map((entry) => (
                    <tr key={entry.entry_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 text-muted-foreground">
                        {new Date(entry.timestamp * 1000).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={
                          entry.action === 'APPROVE' ? 'border-green-500/20 text-green-500 bg-green-500/5' : 
                          'border-red-500/20 text-red-500 bg-red-500/5'
                        }>
                          {entry.action}
                        </Badge>
                      </td>
                      <td className="p-4">{entry.actor}</td>
                      <td className="p-4 opacity-80">{entry.details}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 group cursor-help">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <span className="text-[10px] text-muted-foreground truncate max-w-[100px] font-mono">
                            {entry.signature}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
