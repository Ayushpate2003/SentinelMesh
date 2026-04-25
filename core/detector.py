import os
import requests
import logging
import json
import time
from typing import Dict, Any, List, Optional
from .models import SecurityEvent, ThreatSignal, Severity

logger = logging.getLogger("Detector")

class Detector:
    def __init__(self):
        self.vt_api_key = os.getenv("VIRUSTOTAL_API_KEY")
        self.google_api_key = os.getenv("GOOGLE_API_KEY")
        self.light_mode = os.getenv("LIGHT_MODE", "false").lower() == "true"
        self.request_timeout_ms = int(os.getenv("REQUEST_TIMEOUT_MS", "500"))
        self.cb_fail_threshold = int(os.getenv("CB_FAIL_THRESHOLD", "3"))
        self.cb_cooldown_seconds = int(os.getenv("CB_COOLDOWN_SECONDS", "30"))
        self.cb_failures = 0
        self.cb_open_until = 0.0

    def analyze(self, event: SecurityEvent) -> List[ThreatSignal]:
        signals = []
        if event.event_type == "oauth_request":
            signals.append(self.oauth_risk_scorer(event))
        elif event.event_type == "env_access":
            signals.append(self.env_read_monitor(event))
        elif event.event_type == "package_install":
            signals.append(self.supply_chain_auditor(event))
        elif event.event_type == "mcp_tool_call":
            signals.append(self.mcp_tool_risk(event))
        elif event.event_type == "webhook_dispatch":
            signals.append(self.webhook_dispatch_risk(event))
        elif event.event_type == "package_publish":
            signals.append(self.package_publish_risk(event))
        elif event.event_type == "agent_memory_read":
            signals.append(self.agent_memory_exfil(event))
        elif event.event_type == "prompt_injection":
            signals.append(self.prompt_injection_risk(event))
        elif event.event_type == "data_exfiltration":
            signals.append(self.data_exfiltration_risk(event))
        elif event.event_type == "privilege_escalation":
            signals.append(self.privilege_escalation_risk(event))
        elif event.event_type == "ssrf_request":
            signals.append(self.ssrf_risk(event))
        elif event.event_type == "token_replay":
            signals.append(self.token_replay_risk(event))
        elif event.event_type == "ransomware_pattern":
            signals.append(self.ransomware_pattern_risk(event))
        elif event.event_type == "dns_exfiltration":
            signals.append(self.dns_exfiltration_risk(event))
        elif event.event_type == "container_escape":
            signals.append(self.container_escape_risk(event))
        
        # Add threat intel lookup if there's an IP or File Hash
        indicator = event.metadata.get("ip") or event.metadata.get("file_hash")
        if indicator and not self.light_mode:
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
        
        elif indicator and self.light_mode:
            logger.info("LIGHT_MODE enabled; skipping threat intel lookup for %s", event.event_id)

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

    def mcp_tool_risk(self, event: SecurityEvent) -> ThreatSignal:
        """Flags MCP / agent tools that read secrets, execute shell, or fetch arbitrary URLs."""
        tool = (event.metadata.get("tool_name") or "").lower()
        preview = str(event.metadata.get("arguments_preview", "")).lower()
        dangerous_tools = ("filesystem.read", "bash_exec", "shell.run", "http.fetch", "terminal.run")
        secret_markers = ("sk-", "aws_secret", ".env", "/etc/passwd", "curl ", "api_key")
        risk = 0.25
        if any(t in tool for t in dangerous_tools):
            risk = max(risk, 0.82)
        if any(m in preview for m in secret_markers):
            risk = max(risk, 0.92)
        sev = Severity.CRITICAL if risk > 0.88 else Severity.HIGH if risk > 0.7 else Severity.MEDIUM
        return ThreatSignal(
            signal_id=f"mcp_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"MCP tool risk: {tool or 'unknown'} — arguments match secret exfil / execution patterns.",
            risk_score=risk,
        )

    def webhook_dispatch_risk(self, event: SecurityEvent) -> ThreatSignal:
        """Flags outbound webhooks to disposable or known-exfil hosts with credential-like payloads."""
        url = str(event.metadata.get("target_url", "")).lower()
        payload = str(event.metadata.get("payload_preview", "")).lower()
        bad_hosts = (
            "pastebin.com",
            "discord.com/api/webhooks",
            "ngrok",
            "evil-exfil",
            "requestbin",
            "webhook.site",
        )
        risk = 0.2
        if any(h in url for h in bad_hosts):
            risk = 0.9
        if any(x in payload for x in ("aws_secret", "sk_live", "api_key", "password")):
            risk = max(risk, 0.88)
        sev = Severity.CRITICAL if risk > 0.85 else Severity.HIGH
        return ThreatSignal(
            signal_id=f"wh_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Webhook dispatch to high-risk destination with sensitive payload shape: {url[:80]}",
            risk_score=risk,
        )

    def package_publish_risk(self, event: SecurityEvent) -> ThreatSignal:
        """Maintainer hijack / suspicious publish — new owner, huge reach, postinstall."""
        meta = event.metadata
        new_maintainer = bool(meta.get("new_maintainer"))
        postinstall = bool(meta.get("postinstall_present"))
        downloads = int(meta.get("weekly_downloads") or 0)
        hours = float(meta.get("hours_since_ownership_change") or 999)
        risk = 0.15
        if new_maintainer and hours < 48:
            risk += 0.45
        if postinstall:
            risk += 0.25
        if downloads > 500_000:
            risk += 0.2
        risk = min(0.95, risk)
        sev = Severity.CRITICAL if risk > 0.85 else Severity.HIGH if risk > 0.55 else Severity.MEDIUM
        pkg = meta.get("package_name", "unknown")
        ver = meta.get("version", "")
        return ThreatSignal(
            signal_id=f"pub_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Suspicious npm publish: {pkg}@{ver} — maintainer churn + postinstall + high adoption.",
            risk_score=risk,
        )

    def agent_memory_exfil(self, event: SecurityEvent) -> ThreatSignal:
        """Bulk reads from agent memory / vector store containing API keys."""
        keys = event.metadata.get("keys_read") or []
        if isinstance(keys, str):
            keys = [keys]
        sensitive = [k for k in keys if any(p in str(k).upper() for p in ("SECRET", "KEY", "TOKEN", "PASSWORD", "API"))]
        count = len(keys)
        risk = min(0.95, 0.35 + 0.02 * count + (0.15 if len(sensitive) >= 3 else 0))
        sev = Severity.CRITICAL if risk > 0.88 else Severity.HIGH if risk > 0.65 else Severity.MEDIUM
        return ThreatSignal(
            signal_id=f"mem_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Agent memory sweep: {count} keys in one window; {len(sensitive)} look like credentials.",
            risk_score=risk,
        )

    def prompt_injection_risk(self, event: SecurityEvent) -> ThreatSignal:
        text = str(event.metadata.get("prompt", "")).lower()
        markers = ("ignore previous", "system prompt", "bypass", "exfiltrate", "tool call")
        hits = sum(1 for m in markers if m in text)
        risk = min(0.95, 0.45 + hits * 0.1)
        sev = Severity.CRITICAL if risk >= 0.85 else Severity.HIGH
        return ThreatSignal(
            signal_id=f"pinj_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Prompt injection pattern detected ({hits} high-risk markers).",
            risk_score=risk,
        )

    def data_exfiltration_risk(self, event: SecurityEvent) -> ThreatSignal:
        mb = float(event.metadata.get("bytes_out_mb") or 0)
        sensitive = bool(event.metadata.get("contains_secrets"))
        external = bool(event.metadata.get("external_destination"))
        risk = 0.35 + min(0.35, mb / 1500.0) + (0.18 if sensitive else 0) + (0.12 if external else 0)
        risk = min(0.97, risk)
        sev = Severity.CRITICAL if risk >= 0.85 else Severity.HIGH if risk >= 0.6 else Severity.MEDIUM
        return ThreatSignal(
            signal_id=f"dexf_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Possible data exfiltration: {mb:.0f}MB outbound to non-trusted destination.",
            risk_score=risk,
        )

    def privilege_escalation_risk(self, event: SecurityEvent) -> ThreatSignal:
        requested = str(event.metadata.get("requested_role", "")).lower()
        current = str(event.metadata.get("current_role", "")).lower()
        admin_path = requested in {"admin", "owner", "root"} and current not in {"admin", "owner", "root"}
        risk = 0.9 if admin_path else 0.62
        sev = Severity.CRITICAL if admin_path else Severity.HIGH
        return ThreatSignal(
            signal_id=f"priv_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Privilege escalation attempt from '{current}' to '{requested}'.",
            risk_score=risk,
        )

    def ssrf_risk(self, event: SecurityEvent) -> ThreatSignal:
        url = str(event.metadata.get("target_url", "")).lower()
        internal_markers = ("169.254.169.254", "localhost", "127.0.0.1", ".internal", "metadata.google.internal")
        risk = 0.92 if any(m in url for m in internal_markers) else 0.58
        sev = Severity.CRITICAL if risk >= 0.85 else Severity.HIGH
        return ThreatSignal(
            signal_id=f"ssrf_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"SSRF pattern detected targeting: {url[:120]}",
            risk_score=risk,
        )

    def token_replay_risk(self, event: SecurityEvent) -> ThreatSignal:
        age_h = float(event.metadata.get("token_age_hours") or 0)
        reused = int(event.metadata.get("reuse_count") or 0)
        risk = min(0.94, 0.35 + min(0.3, age_h / 72.0) + min(0.3, reused / 6.0))
        sev = Severity.CRITICAL if risk >= 0.85 else Severity.HIGH if risk >= 0.6 else Severity.MEDIUM
        return ThreatSignal(
            signal_id=f"replay_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Token replay suspected: age={age_h:.1f}h, reuse_count={reused}.",
            risk_score=risk,
        )

    def ransomware_pattern_risk(self, event: SecurityEvent) -> ThreatSignal:
        touched = int(event.metadata.get("files_touched") or 0)
        encrypted = int(event.metadata.get("encrypt_ops") or 0)
        deleted = int(event.metadata.get("delete_ops") or 0)
        risk = min(0.98, 0.4 + min(0.35, touched / 2000.0) + min(0.15, encrypted / 300.0) + min(0.15, deleted / 300.0))
        sev = Severity.CRITICAL if risk >= 0.85 else Severity.HIGH
        return ThreatSignal(
            signal_id=f"rans_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"Ransomware-like file operations detected (touch={touched}, enc={encrypted}, del={deleted}).",
            risk_score=risk,
        )

    def dns_exfiltration_risk(self, event: SecurityEvent) -> ThreatSignal:
        entropy = float(event.metadata.get("query_entropy") or 0)
        count = int(event.metadata.get("query_count_1m") or 0)
        long_labels = bool(event.metadata.get("long_subdomains"))
        risk = min(0.95, 0.35 + min(0.3, entropy / 12.0) + min(0.2, count / 160.0) + (0.12 if long_labels else 0))
        sev = Severity.CRITICAL if risk >= 0.85 else Severity.HIGH if risk >= 0.6 else Severity.MEDIUM
        return ThreatSignal(
            signal_id=f"dns_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description=f"DNS exfiltration pattern: entropy={entropy:.2f}, qpm={count}.",
            risk_score=risk,
        )

    def container_escape_risk(self, event: SecurityEvent) -> ThreatSignal:
        privileged = bool(event.metadata.get("privileged"))
        host_mount = bool(event.metadata.get("host_mount_access"))
        syscall = str(event.metadata.get("syscall", "")).lower()
        risky_syscalls = ("unshare", "setns", "mount", "ptrace", "bpf")
        risk = 0.42 + (0.22 if privileged else 0) + (0.2 if host_mount else 0) + (0.18 if any(s in syscall for s in risky_syscalls) else 0)
        risk = min(0.97, risk)
        sev = Severity.CRITICAL if risk >= 0.85 else Severity.HIGH if risk >= 0.6 else Severity.MEDIUM
        return ThreatSignal(
            signal_id=f"cont_{event.event_id}",
            event_id=event.event_id,
            agent_name="Detector",
            severity=sev,
            description="Container escape indicators detected (privileged runtime + host boundary interaction).",
            risk_score=risk,
        )

    def threat_intel_lookup(self, indicator: str) -> Dict[str, Any]:
        """Looks up an indicator (IP, Hash, Domain) on VirusTotal."""
        if not self.vt_api_key or self.vt_api_key == "your_virustotal_api_key":
            return {"malicious": 0}

        now = time.time()
        if self.cb_open_until > now:
            logger.warning("Circuit breaker open; skipping threat intel lookup")
            return {"malicious": 0, "partial": True, "reason": "circuit_open"}
        
        try:
            # Determine if it's a hash or IP (basic check)
            if len(indicator) in [32, 40, 64]: # Likely a hash
                url = f"https://www.virustotal.com/api/v3/files/{indicator}"
            else: # Assume IP
                url = f"https://www.virustotal.com/api/v3/ip_addresses/{indicator}"
                
            headers = {"x-apikey": self.vt_api_key}
            response = requests.get(url, headers=headers, timeout=self.request_timeout_ms / 1000)
            if response.status_code == 200:
                data = response.json()
                stats = data.get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
                malicious_count = stats.get("malicious", 0)
                self.cb_failures = 0
                self.cb_open_until = 0.0
                return {"malicious": malicious_count}
            else:
                logger.warning(f"VirusTotal API error: {response.status_code}")
                self._record_cb_failure()
                return {"malicious": 0}
        except Exception as e:
            logger.error(f"Failed to lookup threat intel: {e}")
            self._record_cb_failure()
            return {"malicious": 0, "partial": True, "reason": "lookup_failed"}

    def _record_cb_failure(self):
        self.cb_failures += 1
        if self.cb_failures >= self.cb_fail_threshold:
            self.cb_open_until = time.time() + self.cb_cooldown_seconds
            logger.warning("Circuit breaker opened for %ss", self.cb_cooldown_seconds)
