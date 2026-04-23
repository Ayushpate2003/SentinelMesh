import os
import logging
from typing import List, Optional
from .models import Verdict, ThreatSignal
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Gatekeeper")

KEY_PATH = "core/keys/gatekeeper.pem"

class Gatekeeper:
    def __init__(self, key_path=KEY_PATH):
        self.key_path = key_path
        self.private_key = None
        self.public_key = None
        self._load_or_generate_keys()

    def _load_or_generate_keys(self):
        if os.path.exists(self.key_path):
            logger.info(f"Loading existing ECDSA keys from {self.key_path}")
            with open(self.key_path, "rb") as key_file:
                self.private_key = serialization.load_pem_private_key(
                    key_file.read(),
                    password=None,
                )
        else:
            logger.info("Generating new ECDSA (secp256r1) keys...")
            self.private_key = ec.generate_private_key(ec.SECP256R1())
            os.makedirs(os.path.dirname(self.key_path), exist_ok=True)
            with open(self.key_path, "wb") as key_file:
                key_file.write(
                    self.private_key.private_bytes(
                        encoding=serialization.Encoding.PEM,
                        format=serialization.PrivateFormat.PKCS8,
                        encryption_algorithm=serialization.NoEncryption(),
                    )
                )
        
        self.public_key = self.private_key.public_key()

    def sign_message(self, message: str) -> bytes:
        """Signs a message using the private key."""
        signature = self.private_key.sign(
            message.encode(),
            ec.ECDSA(hashes.SHA256())
        )
        return signature

    def verify_signature(self, message: str, signature: bytes) -> bool:
        """Verifies a signature using the public key."""
        try:
            self.public_key.verify(
                signature,
                message.encode(),
                ec.ECDSA(hashes.SHA256())
            )
            return True
        except Exception as e:
            logger.error(f"Signature verification failed: {e}")
            return False

    def get_public_key_pem(self) -> bytes:
        """Returns the public key in PEM format."""
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )

    def determine_verdict(self, signals: List[ThreatSignal], threshold_block: float = 0.8, threshold_queue: float = 0.4) -> Verdict:
        """Decides on a verdict based on threat signals with basic consensus logic."""
        if not signals:
            return Verdict.ALLOW
            
        risk_scores = [s.risk_score for s in signals]
        max_risk = max(risk_scores)
        avg_risk = sum(risk_scores) / len(signals)
        high_risk_count = sum(1 for r in risk_scores if r >= threshold_queue)

        logger.info(f"Verdict analysis: Max={max_risk:.2f}, Avg={avg_risk:.2f}, HighCount={high_risk_count}")

        # 1. Immediate block if any signal is extremely high risk
        if max_risk >= threshold_block:
            return Verdict.BLOCK
            
        # 2. Consensus block: Multiple medium-high risk signals
        if high_risk_count >= 2 and avg_risk >= 0.5:
            return Verdict.BLOCK
            
        # 3. Queue for manual review if risk is moderate
        if max_risk >= threshold_queue or avg_risk >= 0.3:
            return Verdict.QUEUE
            
        return Verdict.ALLOW

if __name__ == "__main__":
    # Quick test
    gatekeeper = Gatekeeper()
    msg = "Security Alert: Unauthorized access detected"
    sig = gatekeeper.sign_message(msg)
    logger.info(f"Message: {msg}")
    logger.info(f"Signature: {sig.hex()}")
    
    is_valid = gatekeeper.verify_signature(msg, sig)
    logger.info(f"Is signature valid? {is_valid}")
