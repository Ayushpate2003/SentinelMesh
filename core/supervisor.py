import os
import logging
import requests
import json
import time
from typing import List
from concurrent.futures import ThreadPoolExecutor
from .models import SecurityEvent, ThreatSignal, IncidentCard, Severity, Verdict
from .detector import Detector
from .listener import Listener
from .gatekeeper import Gatekeeper
from integrations.notifications import NotificationService

logger = logging.getLogger("Supervisor")

class Supervisor:
    def __init__(self):
        self.light_mode = os.getenv("LIGHT_MODE", "false").lower() == "true"
        self.detector = Detector()
        self.listener = Listener()
        self.gatekeeper = Gatekeeper()
        self.notifier = NotificationService()
        self.executor = ThreadPoolExecutor(max_workers=2 if self.light_mode else 5)
        logger.info("Supervisor initialized | light_mode=%s", self.light_mode)

    def process_event(self, event_data: dict, threshold_block: float = 0.8, threshold_queue: float = 0.4) -> IncidentCard:
        started = time.perf_counter()
        event = SecurityEvent(**event_data)
        logger.info(f"Processing event {event.event_id} from {event.source}")
        
        # 1. Gather signals from agents
        signals = []
        signals.extend(self.detector.analyze(event))
        signals.extend(self.listener.analyze(event))
        
        if not signals:
            logger.info(f"No threats detected for event {event.event_id}")
            return None
            
        # 2. Determine Verdict
        verdict = self.gatekeeper.determine_verdict(signals, threshold_block=threshold_block, threshold_queue=threshold_queue)
        logger.info(f"Verdict for {event.event_id}: {verdict}")

        # 3. Generate Incident Card
        max_severity = max([s.severity for s in signals], key=lambda x: self._severity_rank(x))
        incident = IncidentCard(
            incident_id=f"inc_{event.event_id}",
            summary=f"Security Incident: {event.event_type} anomaly from {event.source}",
            severity=max_severity,
            affected_components=[event.source],
            signals=signals,
            timeline=[{"timestamp": event.timestamp, "event": "Detection started"}],
            status="blocked" if verdict == Verdict.BLOCK else "active"
        )

        # 4. Send Notifications
        if not self.light_mode and self._severity_rank(max_severity) >= self._severity_rank(Severity.HIGH):
            self.send_alerts(incident)
        elif self.light_mode:
            logger.info("LIGHT_MODE enabled; external alert fanout skipped for %s", incident.incident_id)

        logger.info(
            "Processed event %s in %.1fms",
            event.event_id,
            (time.perf_counter() - started) * 1000,
        )

        return incident

    def _severity_rank(self, severity: Severity) -> int:
        ranks = {Severity.LOW: 1, Severity.MEDIUM: 2, Severity.HIGH: 3, Severity.CRITICAL: 4}
        return ranks.get(severity, 0)

    def send_alerts(self, incident: IncidentCard):
        # Escape underscores for Markdown
        safe_summary = incident.summary.replace("_", "\\_")
        safe_id = incident.incident_id.replace("_", "\\_")
        
        message = (
            f"🚨 *SentinelMesh Alert*\n"
            f"ID: `{safe_id}`\n"
            f"Severity: *{incident.severity.upper()}*\n"
            f"Summary: {safe_summary}\n"
            f"Status: {incident.status}\n"
            f"Signals: {len(incident.signals)}"
        )
        self.executor.submit(self.notifier.send_telegram, message)

        # Prepare Email Content
        html_content = f"""
        <h1>SentinelMesh Security Alert</h1>
        <p><strong>Incident ID:</strong> {incident.incident_id}</p>
        <p><strong>Severity:</strong> {incident.severity.upper()}</p>
        <p><strong>Summary:</strong> {incident.summary}</p>
        <p><strong>Status:</strong> {incident.status}</p>
        <h3>Threat Signals:</h3>
        <ul>
            {''.join([f"<li>{s.description} (Risk Score: {s.risk_score})</li>" for s in incident.signals])}
        </ul>
        """
        self.executor.submit(
            self.notifier.send_email,
            subject=f"SentinelMesh Alert: {incident.severity.upper()} - {incident.incident_id}",
            html_content=html_content
        )

if __name__ == "__main__":
    # Test Supervisor
    supervisor = Supervisor()
    test_event = {
        "event_id": "test_456",
        "timestamp": time.time(),
        "source": "ci-runner-01",
        "event_type": "oauth_request",
        "metadata": {
            "scopes": ["https://www.googleapis.com/auth/drive", "*"],
            "project_id": "proj_alpha"
        }
    }
    incident = supervisor.process_event(test_event)
    if incident:
        print(json.dumps(incident.model_dump(), indent=2))
    
    print("Test complete. Staying alive...")
    while True:
        time.sleep(3600)
