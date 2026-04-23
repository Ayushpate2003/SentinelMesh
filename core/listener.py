import redis
import os
import json
import logging
import datetime
from typing import List, Dict, Any
from .models import SecurityEvent, ThreatSignal, Severity

logger = logging.getLogger("Listener")

class Listener:
    def __init__(self, redis_url: str = None):
        if not redis_url:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            self.r = redis.from_url(redis_url, decode_responses=True)
            self.r.ping() # Test connection
            self.use_redis = True
        except Exception:
            logger.warning("Redis not available. Using in-memory fallback for Listener.")
            self.use_redis = False
            self._storage = {}
        
        self.working_hours = range(9, 18) # 9 AM to 6 PM

    def _incr(self, key: str) -> int:
        if self.use_redis:
            return self.r.incr(key)
        else:
            self._storage[key] = self._storage.get(key, 0) + 1
            return self._storage[key]

    def _expire(self, key: str, seconds: int):
        if self.use_redis:
            self.r.expire(key, seconds)
        # Mocking expire in-memory is complex for a quick fix, ignoring for now

    def _sadd(self, key: str, value: str):
        if self.use_redis:
            self.r.sadd(key, value)
        else:
            if key not in self._storage: self._storage[key] = set()
            if isinstance(self._storage[key], set):
                self._storage[key].add(value)

    def _scard(self, key: str) -> int:
        if self.use_redis:
            return self.r.scard(key)
        else:
            val = self._storage.get(key, set())
            return len(val) if isinstance(val, set) else 0

    def analyze(self, event: SecurityEvent) -> List[ThreatSignal]:
        signals = []
        
        # 1. Velocity Tracking
        velocity_signal = self.check_velocity(event)
        if velocity_signal: signals.append(velocity_signal)
        
        # 2. Off-hours Activity
        off_hours_signal = self.check_off_hours(event)
        if off_hours_signal: signals.append(off_hours_signal)
        
        # 3. Cross-Project Access
        cross_project_signal = self.check_cross_project(event)
        if cross_project_signal: signals.append(cross_project_signal)
        
        return [s for s in signals if s]

    def check_velocity(self, event: SecurityEvent) -> ThreatSignal:
        key = f"velocity:{event.source}:{event.event_type}"
        count = self._incr(key)
        if count == 1:
            self._expire(key, 60) # 1 minute window
        
        if count > 50: # Threshold for burst activity
            return ThreatSignal(
                signal_id=f"vel_{event.event_id}",
                event_id=event.event_id,
                agent_name="Listener",
                severity=Severity.HIGH,
                description=f"High velocity detected for {event.source}: {count} events/min.",
                risk_score=0.8
            )
        return None

    def check_off_hours(self, event: SecurityEvent) -> ThreatSignal:
        now = datetime.datetime.fromtimestamp(event.timestamp)
        if now.hour not in self.working_hours:
            return ThreatSignal(
                signal_id=f"time_{event.event_id}",
                event_id=event.event_id,
                agent_name="Listener",
                severity=Severity.MEDIUM,
                description=f"Activity detected during off-hours ({now.strftime('%H:%M')}) for {event.source}.",
                risk_score=0.4
            )
        return None

    def check_cross_project(self, event: SecurityEvent) -> ThreatSignal:
        project_id = event.metadata.get("project_id")
        if not project_id: return None
        
        key = f"projects:{event.source}"
        self._sadd(key, project_id)
        project_count = self._scard(key)
        
        if project_count > 3:
            return ThreatSignal(
                signal_id=f"cross_{event.event_id}",
                event_id=event.event_id,
                agent_name="Listener",
                severity=Severity.HIGH,
                description=f"Cross-project access detected for {event.source}. Accessed {project_count} projects.",
                risk_score=0.7
            )
        return None
