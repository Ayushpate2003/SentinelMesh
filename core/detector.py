import os
import requests
import logging
import json
from typing import Dict, Any, List, Optional
from .models import SecurityEvent, ThreatSignal, Severity

logger = logging.getLogger("Detector")

class Detector:
    def __init__(self):
        self.vt_api_key = os.getenv("VIRUSTOTAL_API_KEY")
        self.google_api_key = os.getenv("GOOGLE_API_KEY")

    def analyze(self, event: SecurityEvent) -> List[ThreatSignal]:
        signals = []
        if event.event_type == "oauth_request":
            signals.append(self.oauth_risk_scorer(event))
        elif event.event_type == "env_access":
            signals.append(self.env_read_monitor(event))
        elif event.event_type == "package_install":
            signals.append(self.supply_chain_auditor(event))
        
        # Add threat intel lookup if there's an IP or File Hash
        indicator = event.metadata.get("ip") or event.metadata.get("file_hash")
        if indicator:
            intel = self.threat_intel_lookup(indicator)
            if intel.get("malicious", 0) > 0:
                signals.append(ThreatSignal(
                    signal_id=f"intel_{event.event_id}",
                    event_id=event.event_id,
                    agent_name="Detector",
                    severity=Severity.HIGH,
                    description=f"Threat Intelligence Match: {indicator} flagged as malicious.",
                    risk_score=0.9
                ))
        
        return [s for s in signals if s]

    def oauth_risk_scorer(self, event: SecurityEvent) -> ThreatSignal:
        """Analyzes OAuth permission requests for excessive scope."""
        scopes = event.metadata.get("scopes", [])
        sensitive_scopes = {
            "https://www.googleapis.com/auth/drive": 0.8,
            "https://www.googleapis.com/auth/gmail.readonly": 0.7,
            "https://www.googleapis.com/auth/cloud-platform": 0.9,
            "*": 1.0
        }
        
        max_risk = 0.1
        found_scopes = []
        for scope in scopes:
            if scope in sensitive_scopes:
                max_risk = max(max_risk, sensitive_scopes[scope])
                found_scopes.append(scope)
        
        severity = Severity.LOW
        if max_risk > 0.8: severity = Severity.CRITICAL
        elif max_risk > 0.5: severity = Severity.HIGH
        elif max_risk > 0.3: severity = Severity.MEDIUM

        return ThreatSignal(
            signal_id=f"oauth_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=severity,
            description=f"OAuth scope analysis for {event.source}. Sensitive scopes found: {', '.join(found_scopes) or 'None'}",
            risk_score=max_risk
        )

    def env_read_monitor(self, event: SecurityEvent) -> ThreatSignal:
        """Monitors for unauthorized reading of environment variables/credentials."""
        accessed_keys = event.metadata.get("keys", [])
        sensitive_patterns = ["SECRET", "KEY", "PASSWORD", "TOKEN", "CREDENTIAL"]
        
        found_sensitive = [k for k in accessed_keys if any(p in k.upper() for p in sensitive_patterns)]
        
        risk_score = 0.0
        if found_sensitive:
            risk_score = min(0.2 * len(found_sensitive), 0.9)
            
        severity = Severity.LOW
        if risk_score > 0.7: severity = Severity.HIGH
        elif risk_score > 0.4: severity = Severity.MEDIUM

        return ThreatSignal(
            signal_id=f"env_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=severity,
            description=f"Sensitive environment access detected. Keys: {', '.join(found_sensitive)}",
            risk_score=risk_score
        )

    def supply_chain_auditor(self, event: SecurityEvent) -> ThreatSignal:
        """Checks npm/pip packages against known vulnerabilities."""
        package_name = event.metadata.get("package_name")
        version = event.metadata.get("version")
        
        # In a real scenario, we'd query OSV or npm audit
        # For now, simulate checking for 'typosquatting' or 'malicious' packages
        risk_score = 0.0
        description = f"Package audit for {package_name}@{version}"
        
        if package_name in ["reqests", "pyton-dotenv", "expresss"]: # Common typosquats
            risk_score = 0.9
            description = f"CRITICAL: Potential typosquatting detected for {package_name}."

        severity = Severity.LOW
        if risk_score > 0.8: severity = Severity.CRITICAL

        return ThreatSignal(
            signal_id=f"pkg_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=severity,
            description=description,
            risk_score=risk_score
        )

    def threat_intel_lookup(self, indicator: str) -> Dict[str, Any]:
        """Looks up an indicator (IP, Hash, Domain) on VirusTotal."""
        if not self.vt_api_key or self.vt_api_key == "your_virustotal_api_key":
            return {"malicious": 0}
        
        try:
            # Determine if it's a hash or IP (basic check)
            if len(indicator) in [32, 40, 64]: # Likely a hash
                url = f"https://www.virustotal.com/api/v3/files/{indicator}"
            else: # Assume IP
                url = f"https://www.virustotal.com/api/v3/ip_addresses/{indicator}"
                
            headers = {"x-apikey": self.vt_api_key}
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 200:
                data = response.json()
                stats = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
                malicious_count = stats.get("malicious", 0)
                return {"malicious": malicious_count}
            else:
                logger.warning(f"VirusTotal API error: {response.status_code}")
                return {"malicious": 0}
        except Exception as e:
            logger.error(f"Failed to lookup threat intel: {e}")
            return {"malicious": 0}
