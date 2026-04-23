from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class Severity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class Verdict(str, Enum):
    ALLOW = "ALLOW"
    QUEUE = "QUEUE"
    BLOCK = "BLOCK"

class SecurityEvent(BaseModel):
    event_id: str
    timestamp: float
    source: str
    event_type: str
    metadata: Dict[str, Any]
    raw_data: Optional[str] = None

class ThreatSignal(BaseModel):
    signal_id: str
    event_id: str
    agent_name: str
    severity: Severity
    description: str
    risk_score: float = Field(ge=0.0, le=1.0)
    remediation_suggestion: Optional[str] = None

class IncidentCard(BaseModel):
    incident_id: str
    summary: str
    severity: Severity
    affected_components: List[str]
    signals: List[ThreatSignal]
    timeline: List[Dict[str, Any]]
    status: str = "active"

class AuditEntry(BaseModel):
    entry_id: str
    timestamp: float
    action: str
    actor: str
    details: str
    signature: str
