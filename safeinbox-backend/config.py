"""Application configuration, read from environment variables (and an optional .env file)."""
import logging
import os
import secrets
import time
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

log = logging.getLogger("safeinbox")


def _bool(value, default=False):
    if value is None or value == "":
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _list(value):
    return [item.strip() for item in (value or "").split(",") if item.strip()]


def _secret(env_name, instance_dir, filename, generator):
    """Use the secret from the environment, otherwise load/generate one in the instance folder.

    Generating keys automatically keeps local development simple; production deployments
    should pass DATA_ENCRYPTION_KEY and SECRET_KEY explicitly so they can be backed up.
    """
    value = os.getenv(env_name, "").strip()
    if value:
        return value
    path = Path(instance_dir) / filename
    try:
        # O_EXCL makes creation atomic: when several server workers start at once, exactly one
        # generates the key and the others read it, so they all share the same key.
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        for _ in range(100):  # the creating process may still be writing
            existing = path.read_text(encoding="utf-8").strip()
            if existing:
                return existing
            time.sleep(0.05)
        raise RuntimeError(f"{path} exists but is empty - delete it or set {env_name}")
    value = generator()
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(value)
    log.warning("%s is not set - generated a new one and saved it to %s", env_name, path)
    return value


def load_config(overrides=None):
    """Build the Flask config dict. `overrides` (used by tests) wins over the environment."""
    overrides = overrides or {}
    instance_dir = Path(overrides.get("INSTANCE_DIR") or os.getenv("INSTANCE_DIR") or BASE_DIR / "instance")
    instance_dir.mkdir(parents=True, exist_ok=True)

    from encryption import Encryptor  # local import to avoid a circular import

    config = {
        "INSTANCE_DIR": instance_dir,
        "MONGO_URI": os.getenv("MONGO_URI", "mongodb://localhost:27017/safeinbox"),
        # When MongoDB can't be reached, fall back to an in-memory database (data is lost on restart).
        "MONGO_FALLBACK_TO_MEMORY": _bool(os.getenv("MONGO_FALLBACK_TO_MEMORY"), default=True),
        "GOOGLE_CLIENT_ID": os.getenv("GOOGLE_CLIENT_ID", "").strip(),
        "ADMIN_EMAILS": {email.lower() for email in _list(os.getenv("ADMIN_EMAILS"))},
        "CORS_ORIGINS": _list(os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000")),
        "SESSION_MAX_AGE_SECONDS": int(os.getenv("SESSION_MAX_AGE_SECONDS", 8 * 3600)),
        "DATA_RETENTION_DAYS": int(os.getenv("DATA_RETENTION_DAYS", 30)),
        "DATASET_PATH": Path(os.getenv("DATASET_PATH", BASE_DIR / "spam_ham_dataset.csv")),
        "BASE_MODEL_DIR": BASE_DIR,
        "MIN_RETRAIN_ACCURACY": float(os.getenv("MIN_RETRAIN_ACCURACY", 0.90)),
        "FEEDBACK_WEIGHT": float(os.getenv("FEEDBACK_WEIGHT", 5)),
        # Keep the text of emails users report / mark as not spam so retraining can learn from them.
        # Off by default: Google's Limited Use policy forbids training shared ML models on Gmail data
        # in public apps. Only enable it for private demos.
        "STORE_FEEDBACK_TEXT": _bool(os.getenv("STORE_FEEDBACK_TEXT"), default=False),
        # Refuse to start without explicit keys (set on hosts without a permanent disk, e.g. Render).
        "REQUIRE_KEYS": _bool(os.getenv("REQUIRE_KEYS"), default=False),
        "MAX_EMAILS_LIMIT": 50,
    }
    config.update(overrides)

    if config["REQUIRE_KEYS"]:
        missing = [name for name in ("SECRET_KEY", "DATA_ENCRYPTION_KEY")
                   if name not in config and not os.getenv(name, "").strip()]
        if missing:
            raise RuntimeError(
                f"{', '.join(missing)} must be set (REQUIRE_KEYS is on). Generated keys would be lost on restart "
                "and stored data would become unreadable."
            )

    if "SECRET_KEY" not in config:
        config["SECRET_KEY"] = _secret("SECRET_KEY", instance_dir, "secret_key", lambda: secrets.token_urlsafe(48))
    if "DATA_ENCRYPTION_KEY" not in config:
        config["DATA_ENCRYPTION_KEY"] = _secret(
            "DATA_ENCRYPTION_KEY", instance_dir, "data_encryption_key", Encryptor.generate_key
        )
    return config
