"""MongoDB connection and indexes (SRS 3.1 - Database)."""
import logging

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError
from pymongo.uri_parser import parse_uri

log = logging.getLogger("safeinbox")

DEFAULT_DB_NAME = "safeinbox"


def connect(uri: str, fallback_to_memory: bool = True):
    """Return (database, backend_name). backend_name is "mongodb" or "in-memory"."""
    if uri.startswith("mongomock://"):
        return _memory_db(), "in-memory"

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        client.admin.command("ping")
        db_name = parse_uri(uri).get("database") or DEFAULT_DB_NAME
        log.info("Connected to MongoDB database '%s'", db_name)
        return client[db_name], "mongodb"
    except PyMongoError as exc:
        if not fallback_to_memory:
            raise
        log.warning(
            "Could not connect to MongoDB at %s (%s). Using an IN-MEMORY database instead - "
            "data will be lost when the server stops. Start MongoDB (e.g. `docker compose up -d mongo`) "
            "to keep data.", uri, exc.__class__.__name__,
        )
        return _memory_db(), "in-memory"


def _memory_db():
    import mongomock

    return mongomock.MongoClient()[DEFAULT_DB_NAME]


def ensure_indexes(db):
    db.users.create_index([("email_hash", ASCENDING)], unique=True)
    db.analyses.create_index([("user_id", ASCENDING), ("gmail_id", ASCENDING)], unique=True)
    db.analyses.create_index([("user_id", ASCENDING), ("analyzed_at", DESCENDING)])
    db.analyses.create_index([("user_id", ASCENDING), ("received_at", DESCENDING)])
    # Data retention (GDPR): MongoDB deletes analyses automatically once `expires_at` has passed.
    db.analyses.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
    db.feedback.create_index([("user_id", ASCENDING), ("gmail_id", ASCENDING)], unique=True)
