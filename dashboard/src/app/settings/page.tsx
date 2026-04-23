"use client"

import { useEffect, useState } from "react"
import { Settings, Save, Shield, AlertCircle, Trash2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newScope, setNewScope] = useState("")

  useEffect(() => {
    fetch("http://localhost:8000/api/v1/config")
      .then(res => res.json())
      .then(data => {
        setConfig(data)
        setLoading(false)
      })
      .catch(err => {
        console.error("Failed to fetch config", err)
        setLoading(false)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("http://localhost:8000/api/v1/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        alert("Configuration updated successfully")
      }
    } catch (err) {
      console.error("Failed to save config", err)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (key: string, value: string) => {
    setConfig({ ...config, [key]: value })
  }

  const blocklist = JSON.parse(config.oauth_blocklist || "[]")

  const addScope = () => {
    if (!newScope) return
    const updated = [...blocklist, newScope]
    updateField("oauth_blocklist", JSON.stringify(updated))
    setNewScope("")
  }

  const removeScope = (scope: string) => {
    const updated = blocklist.filter((s: string) => s !== scope)
    updateField("oauth_blocklist", JSON.stringify(updated))
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter flex items-center gap-2">
            <Settings className="text-primary w-8 h-8" />
            SYSTEM_CONFIG
          </h1>
          <p className="text-muted-foreground mt-1 uppercase tracking-widest text-[10px]">Adjust Global Risk Thresholds & Security Policies</p>
        </div>
        <div className="flex gap-4">
          <a href="/" className="text-xs hover:text-primary transition-colors flex items-center">← DASHBOARD</a>
          <Button onClick={handleSave} disabled={saving} className="rounded-full px-6 flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p className="animate-pulse text-muted-foreground">Fetching system parameters...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Risk Thresholds */}
          <section className="glass p-8 rounded-3xl space-y-8 border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="text-primary w-5 h-5" />
              <h2 className="text-lg font-bold uppercase tracking-tight">Detection Thresholds</h2>
            </div>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="threshold_block" className="text-sm font-medium">Automatic Block Threshold</Label>
                  <Badge variant="outline" className="border-red-500/50 text-red-500">{config.threshold_block}</Badge>
                </div>
                <Input 
                  id="threshold_block"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={config.threshold_block}
                  onChange={(e) => updateField("threshold_block", e.target.value)}
                  className="bg-white/5 h-2 accent-primary cursor-pointer"
                />
                <p className="text-[10px] text-muted-foreground italic">Events with risk score above this value are automatically blocked.</p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label htmlFor="threshold_queue" className="text-sm font-medium">Human-in-the-loop Threshold</Label>
                  <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">{config.threshold_queue}</Badge>
                </div>
                <Input 
                  id="threshold_queue"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={config.threshold_queue}
                  onChange={(e) => updateField("threshold_queue", e.target.value)}
                  className="bg-white/5 h-2 accent-primary cursor-pointer"
                />
                <p className="text-[10px] text-muted-foreground italic">Events with risk score above this value (but below block) require manual approval.</p>
              </div>
            </div>
          </section>

          {/* OAuth Blocklist */}
          <section className="glass p-8 rounded-3xl space-y-8 border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="text-orange-500 w-5 h-5" />
              <h2 className="text-lg font-bold uppercase tracking-tight">OAuth Scope Blocklist</h2>
            </div>

            <div className="space-y-6">
              <div className="flex gap-2">
                <Input 
                  placeholder="e.g. cloud-platform.read_only"
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addScope()}
                  className="bg-white/5 border-white/10 rounded-xl"
                />
                <Button onClick={addScope} size="icon" className="rounded-xl shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {blocklist.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4">No restricted scopes defined.</p>
                ) : (
                  blocklist.map((scope: string) => (
                    <Badge key={scope} className="bg-white/10 hover:bg-white/20 text-white flex items-center gap-2 py-1.5 pl-3 pr-2 rounded-full border-none transition-colors">
                      <span className="text-[10px] font-mono">{scope}</span>
                      <button onClick={() => removeScope(scope)} className="hover:text-red-500 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
              <p className="text-[10px] text-muted-foreground italic">If an OAuth request contains any of these scopes, the Detector Agent will flag it with a higher risk score.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
