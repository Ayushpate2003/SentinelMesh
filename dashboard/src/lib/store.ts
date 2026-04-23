import { create } from 'zustand'

interface ThreatSignal {
  signal_id: str
  agent_name: string
  severity: string
  description: string
  risk_score: number
}

interface Incident {
  incident_id: string
  summary: string
  severity: string
  status: string
  signals: ThreatSignal[]
  timestamp: number
}

interface DashboardState {
  incidents: Incident[]
  addIncident: (incident: Incident) => void
  setIncidents: (incidents: Incident[]) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  incidents: [],
  addIncident: (incident) => set((state) => ({ 
    incidents: [incident, ...state.incidents].slice(0, 50) 
  })),
  setIncidents: (incidents) => set({ incidents }),
}))
