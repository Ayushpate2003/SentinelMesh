import pytest
import time
from core.models import SecurityEvent, Severity
from core.detector import Detector
from core.gatekeeper import Gatekeeper

def test_detector_oauth():
    detector = Detector()
    event = SecurityEvent(
        event_id="test_oauth",
        timestamp=time.time(),
        source="test",
        event_type="oauth_request",
        metadata={"scopes": ["*"]}
    )
    signals = detector.analyze(event)
    assert len(signals) > 0
    assert signals[0].severity == Severity.CRITICAL

def test_gatekeeper_signing():
    gatekeeper = Gatekeeper(key_path="core/keys/test_key.pem")
    msg = "Test message"
    sig = gatekeeper.sign_message(msg)
    assert gatekeeper.verify_signature(msg, sig) is True
    assert gatekeeper.verify_signature("Wrong message", sig) is False

def test_gatekeeper_verdict():
    from core.models import ThreatSignal
    gatekeeper = Gatekeeper(key_path="core/keys/test_key.pem")
    signals = [
        ThreatSignal(
            signal_id="s1", 
            event_id="e1", 
            agent_name="D", 
            severity=Severity.HIGH, 
            description="D", 
            risk_score=0.9
        )
    ]
    from core.models import Verdict
    assert gatekeeper.determine_verdict(signals) == Verdict.BLOCK
