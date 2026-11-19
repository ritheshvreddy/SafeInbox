"""AES-256-GCM encryption for personal data stored in MongoDB (SRS 6.2)."""
import base64
import hashlib
import hmac
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class Encryptor:
    PREFIX = "v1:"
    NONCE_BYTES = 12

    def __init__(self, key_b64: str):
        key = self._decode_key(key_b64)
        if len(key) != 32:
            raise ValueError("DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key (AES-256).")
        self._aes = AESGCM(key)
        # Separate key for deterministic lookups (e.g. finding a sender) without storing plaintext.
        self._lookup_key = hashlib.sha256(b"safeinbox-lookup:" + key).digest()

    @staticmethod
    def _decode_key(key_b64: str) -> bytes:
        cleaned = key_b64.strip().replace("+", "-").replace("/", "_")
        cleaned += "=" * (-len(cleaned) % 4)
        try:
            return base64.urlsafe_b64decode(cleaned)
        except (ValueError, TypeError) as exc:
            raise ValueError("DATA_ENCRYPTION_KEY is not valid base64.") from exc

    @staticmethod
    def generate_key() -> str:
        return base64.urlsafe_b64encode(os.urandom(32)).decode("ascii")

    def encrypt(self, plaintext: str) -> str:
        nonce = os.urandom(self.NONCE_BYTES)
        ciphertext = self._aes.encrypt(nonce, plaintext.encode("utf-8"), None)
        return self.PREFIX + base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")

    def decrypt(self, token: str) -> str:
        if not token or not token.startswith(self.PREFIX):
            raise ValueError("Unknown ciphertext format")
        raw = base64.urlsafe_b64decode(token[len(self.PREFIX):])
        nonce, ciphertext = raw[: self.NONCE_BYTES], raw[self.NONCE_BYTES:]
        return self._aes.decrypt(nonce, ciphertext, None).decode("utf-8")

    def encrypt_json(self, value) -> str:
        return self.encrypt(json.dumps(value, ensure_ascii=False))

    def decrypt_json(self, token: str):
        return json.loads(self.decrypt(token))

    def lookup_hash(self, value: str) -> str:
        """Keyed hash (HMAC-SHA256) of a normalised value, used as a searchable identifier."""
        normalised = (value or "").strip().lower().encode("utf-8")
        return hmac.new(self._lookup_key, normalised, hashlib.sha256).hexdigest()
