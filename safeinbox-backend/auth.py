"""User Authentication Module: Google OAuth 2.0 sign-in, sessions and role-based access control."""
import secrets
from functools import wraps

import requests
from bson import ObjectId
from bson.errors import InvalidId
from flask import current_app, g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
MAX_SESSIONS_PER_USER = 5

ROLE_ADMIN = "admin"
ROLE_USER = "user"


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def verify_google_access_token(access_token: str, client_id: str) -> dict:
    """Check the token with Google: it must belong to this app and include Gmail access."""
    try:
        response = requests.get(TOKENINFO_URL, params={"access_token": access_token}, timeout=10)
    except requests.RequestException as exc:
        raise ApiError(502, "google_unreachable", "Could not reach Google to verify the sign-in.") from exc
    if response.status_code != 200:
        raise ApiError(401, "invalid_google_token", "Google did not accept the sign-in. Please sign in again.")
    info = response.json()

    if client_id and client_id not in (info.get("aud"), info.get("azp")):
        raise ApiError(401, "wrong_audience", "This sign-in was issued for a different app.")
    if GMAIL_SCOPE not in set((info.get("scope") or "").split()):
        raise ApiError(403, "gmail_permission_missing",
                       "Gmail permission wasn't granted. Sign in again and tick the box that lets SafeInbox use your Gmail.")

    profile = {}
    try:
        userinfo = requests.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
        if userinfo.status_code == 200:
            profile = userinfo.json()
    except requests.RequestException:
        pass

    email = (info.get("email") or profile.get("email") or "").lower()
    if not email:
        raise ApiError(403, "email_permission_missing", "SafeInbox needs to see your email address to sign you in.")
    return {
        "email": email,
        "name": profile.get("name") or email.split("@")[0],
        "expires_in": int(info.get("expires_in") or 3600),
    }


def revoke_google_token(access_token: str):
    try:
        requests.post(REVOKE_URL, params={"token": access_token}, timeout=5)
    except requests.RequestException:
        pass


def _serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="safeinbox-session")


def issue_session(db, user_id) -> str:
    session_id = secrets.token_urlsafe(16)
    db.users.update_one(
        {"_id": user_id}, {"$push": {"sessions": {"$each": [session_id], "$slice": -MAX_SESSIONS_PER_USER}}}
    )
    return _serializer().dumps({"uid": str(user_id), "sid": session_id})


def end_session(db, user_id, session_id):
    db.users.update_one({"_id": user_id}, {"$pull": {"sessions": session_id}})


def is_admin(user, encryptor) -> bool:
    admin_hashes = {encryptor.lookup_hash(email) for email in current_app.config["ADMIN_EMAILS"]}
    return user.get("email_hash") in admin_hashes


def role_for(user, encryptor) -> str:
    return ROLE_ADMIN if is_admin(user, encryptor) else ROLE_USER


def _load_session_user():
    from services import get_services  # avoid circular import

    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError(401, "auth_required", "Please sign in.")
    try:
        data = _serializer().loads(header[7:], max_age=current_app.config["SESSION_MAX_AGE_SECONDS"])
    except SignatureExpired as exc:
        raise ApiError(401, "session_expired", "Your session expired. Please sign in again.") from exc
    except BadSignature as exc:
        raise ApiError(401, "auth_required", "Please sign in.") from exc

    services = get_services()
    try:
        user_id = ObjectId(data.get("uid"))
    except (InvalidId, TypeError) as exc:
        raise ApiError(401, "auth_required", "Please sign in.") from exc
    user = services.db.users.find_one({"_id": user_id})
    if not user or data.get("sid") not in user.get("sessions", []):
        raise ApiError(401, "session_expired", "Your session ended. Please sign in again.")
    g.user = user
    g.session_id = data["sid"]
    g.role = role_for(user, services.encryptor)


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        _load_session_user()
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        _load_session_user()
        if g.role != ROLE_ADMIN:
            raise ApiError(403, "forbidden", "Only administrators can do this.")
        return view(*args, **kwargs)

    return wrapper
