"""SafeInbox REST API."""
import json

from flask import Blueprint, Response, current_app, g, jsonify, request

import chatbot
import gmail_client
from auth import (ApiError, admin_required, end_session, issue_session, login_required, revoke_google_token,
                  role_for)
from preprocessing import parse_gmail_message
from services import (analyze_and_store, analyze_text_only, clear_gmail_token, email_to_api, get_preferences,
                      get_services, iso, label_counts, refresh_stale_analysis, set_sender_status, store_gmail_token,
                      upsert_user, user_profile, utcnow, validate_preferences)
from training import JOB_ID, start_retraining

api = Blueprint("api", __name__)

EMAIL_ACTIONS = {"read", "delete", "report", "keep"}


def _json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _gmail_for(user):
    """Gmail API client for the user, or a 401 asking the browser to reconnect Gmail."""
    services = get_services()
    expires = user.get("gmail_token_expires_at")
    if not user.get("gmail_token_enc") or not expires or expires <= utcnow():
        raise ApiError(401, "gmail_reauth", "Your Gmail connection expired. Click \"Reconnect Gmail\" to continue.")
    token = services.encryptor.decrypt(user["gmail_token_enc"])
    return current_app.config["GMAIL_SERVICE_FACTORY"](token)


def _gmail_call(user, func, *args):
    try:
        return func(*args)
    except gmail_client.GmailAuthError as exc:
        clear_gmail_token(get_services(), user["_id"])
        raise ApiError(401, "gmail_reauth", "Your Gmail connection expired. Click \"Reconnect Gmail\" to continue.") from exc
    except gmail_client.GmailError as exc:
        raise ApiError(exc.status, "gmail_error", str(exc)) from exc


def _current_emails(services, user, ids=None):
    """Analysed unread emails for the user (newest first), with the user's current settings applied."""
    ids = list(user.get("current_unread") or []) if ids is None else ids
    if not ids:
        return []
    model = services.models.get()
    prefs = get_preferences(user)
    docs = {d["gmail_id"]: d for d in services.db.analyses.find({"user_id": user["_id"], "gmail_id": {"$in": ids}})}
    emails = []
    for gmail_id in ids:
        doc = docs.get(gmail_id)
        if doc and doc.get("user_action") not in ("read", "deleted", "reported"):
            doc = refresh_stale_analysis(services, doc, model, prefs)
            emails.append(email_to_api(services, doc, user))
    return emails


# ------------------------------------------------------------------ health & public analysis


@api.get("/api/health")
def health():
    services = get_services()
    return jsonify({"status": "ok", "database": services.db_backend, "modelVersion": services.models.get().version,
                    "retentionDays": current_app.config["DATA_RETENTION_DAYS"]})


@api.post("/api/check")
@api.post("/check_spam")  # kept for compatibility with the original API
def check_text():
    data = _json_body()
    model = get_services().models.get()
    analysis, phishing_result, scoring, reason = analyze_text_only(
        model, data.get("text") or "", data.get("subject") or "", data.get("sender") or ""
    )
    return jsonify({
        "is_spam": scoring["is_spam"],
        "spam_score": scoring["score"],
        "model_score": round(analysis["model_probability"], 4),
        "label": scoring["label"],
        "spam_type": scoring["label"],
        "description": scoring["description"],
        "summary": analysis["summary"],
        "reason": reason,
        "signals": scoring["signals"],
        "spam_words": analysis["spam_words"],
        "ham_words": analysis["ham_words"],
        "phishing": phishing_result,
    })


# ------------------------------------------------------------------ authentication


@api.post("/api/auth/google")
def login_with_google():
    """Sign in (first sign-in registers the user) with a Google OAuth access token."""
    services = get_services()
    access_token = (_json_body().get("access_token") or "").strip()
    if not access_token:
        raise ApiError(400, "missing_token", "access_token is required")
    info = current_app.config["GOOGLE_TOKEN_VERIFIER"](access_token, current_app.config["GOOGLE_CLIENT_ID"])

    email_hash = services.encryptor.lookup_hash(info["email"])
    role = role_for({"email_hash": email_hash}, services.encryptor)
    user = upsert_user(services, info["email"], info["name"], role)
    store_gmail_token(services, user["_id"], access_token, info["expires_in"])
    session_token = issue_session(services.db, user["_id"])
    user = services.db.users.find_one({"_id": user["_id"]})
    return jsonify({"sessionToken": session_token, "user": user_profile(services, user, role)})


@api.post("/api/auth/gmail-token")
@login_required
def reconnect_gmail():
    """Store a fresh Gmail access token for the signed-in user (tokens from Google last ~1 hour)."""
    services = get_services()
    access_token = (_json_body().get("access_token") or "").strip()
    if not access_token:
        raise ApiError(400, "missing_token", "access_token is required")
    info = current_app.config["GOOGLE_TOKEN_VERIFIER"](access_token, current_app.config["GOOGLE_CLIENT_ID"])
    if services.encryptor.lookup_hash(info["email"]) != g.user["email_hash"]:
        raise ApiError(403, "different_account", "Please reconnect with the same Google account you signed in with.")
    store_gmail_token(services, g.user["_id"], access_token, info["expires_in"])
    return jsonify({"ok": True})


@api.get("/api/auth/me")
@login_required
def me():
    services = get_services()
    has_gmail = bool(g.user.get("gmail_token_enc")) and (g.user.get("gmail_token_expires_at") or utcnow()) > utcnow()
    return jsonify({"user": user_profile(services, g.user, g.role), "gmailConnected": has_gmail})


@api.post("/api/auth/logout")
@login_required
def logout():
    services = get_services()
    end_session(services.db, g.user["_id"], g.session_id)
    if g.user.get("gmail_token_enc"):
        revoke_google_token(services.encryptor.decrypt(g.user["gmail_token_enc"]))
    clear_gmail_token(services, g.user["_id"])
    return jsonify({"ok": True})


# ------------------------------------------------------------------ emails


@api.get("/api/emails")
@login_required
def list_emails():
    """Fetch unread emails from Gmail, analyse new ones and return all of them.

    ?cached=1 skips Gmail and re-scores the emails from the last fetch (used after settings changes).
    """
    services = get_services()
    user = g.user
    if request.args.get("cached") == "1":
        emails = _current_emails(services, user)
        return jsonify({"emails": emails, "stats": label_counts(emails), "failed": 0,
                        "fromCache": len(emails), "modelVersion": services.models.get().version})

    prefs = get_preferences(user)
    gmail = _gmail_for(user)
    ids = _gmail_call(user, gmail_client.list_unread_ids, gmail, prefs["max_emails"])

    model = services.models.get()
    known = {d["gmail_id"] for d in services.db.analyses.find(
        {"user_id": user["_id"], "gmail_id": {"$in": ids}}, {"gmail_id": 1})}
    new_ids = [i for i in ids if i not in known]
    messages, failed = _gmail_call(user, gmail_client.get_messages, gmail, new_ids) if new_ids else ([], [])
    retention = current_app.config["DATA_RETENTION_DAYS"]
    for message in messages:
        analyze_and_store(services, user["_id"], parse_gmail_message(message), model, prefs, retention)

    # Emails that are unread in Gmail again (e.g. after a mistaken "mark as read") show up again.
    services.db.analyses.update_many(
        {"user_id": user["_id"], "gmail_id": {"$in": ids}, "user_action": "read"},
        {"$set": {"user_action": None, "action_at": None}},
    )
    services.db.users.update_one({"_id": user["_id"]}, {"$set": {"current_unread": ids, "last_fetch_at": utcnow()}})
    emails = _current_emails(services, user, ids)
    return jsonify({"emails": emails, "stats": label_counts(emails), "failed": len(failed),
                    "fromCache": len(ids) - len(new_ids), "modelVersion": model.version})


@api.post("/api/emails/<gmail_id>/action")
@login_required
def email_action(gmail_id):
    """User decision (SRS Data Dictionary `user_action`): read, delete, report (spam) or keep (not spam)."""
    services = get_services()
    user = g.user
    action = _json_body().get("action")
    if action not in EMAIL_ACTIONS:
        raise ApiError(400, "invalid_action", f"action must be one of {sorted(EMAIL_ACTIONS)}")
    doc = services.db.analyses.find_one({"user_id": user["_id"], "gmail_id": gmail_id})
    if not doc:
        raise ApiError(404, "not_found", "This email hasn't been analysed. Refresh your emails.")
    content = services.encryptor.decrypt_json(doc["content_enc"])

    if action in ("read", "delete", "report"):
        gmail = _gmail_for(user)
        func = {"read": gmail_client.mark_read, "delete": gmail_client.trash, "report": gmail_client.report_spam}[action]
        _gmail_call(user, func, gmail, gmail_id)

    stored_action = {"read": "read", "delete": "deleted", "report": "reported", "keep": "kept"}[action]
    services.db.analyses.update_one({"_id": doc["_id"]}, {"$set": {"user_action": stored_action, "action_at": utcnow()}})

    if action in ("report", "keep") and content["sender_email"]:
        set_sender_status(services, user["_id"], content["sender_email"], "blocked" if action == "report" else "trusted")
        # Record the decision. The email text is only kept for retraining when STORE_FEEDBACK_TEXT is on.
        feedback = {"label": 1 if action == "report" else 0, "created_at": utcnow()}
        if current_app.config["STORE_FEEDBACK_TEXT"]:
            feedback["text_enc"] = services.encryptor.encrypt(f"{content['subject']}\n{content['body']}")
        services.db.feedback.update_one(
            {"user_id": user["_id"], "gmail_id": gmail_id}, {"$set": feedback}, upsert=True,
        )
    if action in ("read", "delete", "report"):
        services.db.users.update_one({"_id": user["_id"]}, {"$pull": {"current_unread": gmail_id}})
    return jsonify({"ok": True, "action": stored_action})


@api.get("/api/history")
@login_required
def history():
    """Previously analysed emails ("Previous Mails" in the UI mock-up)."""
    services = get_services()
    limit = max(1, min(int(request.args.get("limit", 20)), 100))
    docs = services.db.analyses.find({"user_id": g.user["_id"]}).sort("analyzed_at", -1).limit(limit)
    items = []
    for doc in docs:
        email = email_to_api(services, doc, g.user, include_body=False)
        items.append({k: email[k] for k in ("id", "from", "senderName", "subject", "label", "spamScore",
                                             "userAction", "analyzedAt", "receivedAt", "gmailUrl")})
    return jsonify({"items": items})


# ------------------------------------------------------------------ preferences & senders


@api.get("/api/preferences")
@login_required
def get_prefs():
    return jsonify({"preferences": get_preferences(g.user)})


@api.put("/api/preferences")
@login_required
def update_prefs():
    try:
        updates = validate_preferences(_json_body())
    except (ValueError, TypeError) as exc:
        raise ApiError(400, "invalid_preferences", str(exc)) from exc
    services = get_services()
    if updates:
        services.db.users.update_one({"_id": g.user["_id"]},
                                     {"$set": {f"preferences.{k}": v for k, v in updates.items()}})
    user = services.db.users.find_one({"_id": g.user["_id"]})
    return jsonify({"preferences": get_preferences(user)})


@api.get("/api/senders")
@login_required
def list_senders():
    services = get_services()
    senders = [
        {"id": key, "email": services.encryptor.decrypt(value["email_enc"]), "status": value["status"],
         "updatedAt": iso(value.get("updated_at"))}
        for key, value in (g.user.get("senders") or {}).items()
    ]
    senders.sort(key=lambda s: s["email"])
    return jsonify({"senders": senders})


@api.delete("/api/senders/<sender_id>")
@login_required
def forget_sender(sender_id):
    if not all(c in "0123456789abcdef" for c in sender_id) or len(sender_id) != 64:
        raise ApiError(400, "invalid_sender", "Unknown sender")
    get_services().db.users.update_one({"_id": g.user["_id"]}, {"$unset": {f"senders.{sender_id}": ""}})
    return jsonify({"ok": True})


# ------------------------------------------------------------------ chatbot


@api.post("/api/chat")
@login_required
def chat():
    services = get_services()
    message = (_json_body().get("message") or "")[:500]
    result = chatbot.handle(message, _current_emails(services, g.user))
    if result["updates"]:
        updates = validate_preferences(result["updates"])
        services.db.users.update_one({"_id": g.user["_id"]},
                                     {"$set": {f"preferences.{k}": v for k, v in updates.items()}})
    return jsonify(result)


# ------------------------------------------------------------------ GDPR: data export & erasure


@api.get("/api/me/export")
@login_required
def export_my_data():
    """Right of access / data portability: everything SafeInbox stores about the user, decrypted."""
    services = get_services()
    user = g.user
    analyses = []
    for doc in services.db.analyses.find({"user_id": user["_id"]}).sort("analyzed_at", -1):
        item = email_to_api(services, doc, user)
        item["storedUntil"] = iso(doc.get("expires_at"))
        analyses.append(item)
    feedback = [{"emailId": f["gmail_id"], "label": "spam" if f["label"] else "not spam",
                 "createdAt": iso(f.get("created_at"))}
                for f in services.db.feedback.find({"user_id": user["_id"]})]
    senders = [{"email": services.encryptor.decrypt(v["email_enc"]), "status": v["status"]}
               for v in (user.get("senders") or {}).values()]
    payload = {"exportedAt": iso(utcnow()), "profile": user_profile(services, user, g.role),
               "senders": senders, "feedback": feedback, "analysedEmails": analyses}
    return Response(json.dumps(payload, indent=2, ensure_ascii=False), mimetype="application/json",
                    headers={"Content-Disposition": "attachment; filename=safeinbox-my-data.json"})


@api.delete("/api/me")
@login_required
def delete_my_data():
    """Right to erasure: delete the account and all stored data, and revoke Gmail access."""
    services = get_services()
    user = g.user
    if user.get("gmail_token_enc"):
        revoke_google_token(services.encryptor.decrypt(user["gmail_token_enc"]))
    services.db.analyses.delete_many({"user_id": user["_id"]})
    services.db.feedback.delete_many({"user_id": user["_id"]})
    services.db.users.delete_one({"_id": user["_id"]})
    return jsonify({"ok": True})


# ------------------------------------------------------------------ admin (role-based access)


def _job_to_api(job):
    if not job:
        return {"status": "idle"}
    return {"status": job.get("status"), "message": job.get("message"), "metrics": job.get("metrics"),
            "version": job.get("version"), "startedAt": iso(job.get("started_at")),
            "finishedAt": iso(job.get("finished_at"))}


@api.get("/api/admin/stats")
@admin_required
def admin_stats():
    services = get_services()
    db = services.db
    model = services.models.get()
    return jsonify({
        "users": db.users.count_documents({}),
        "analysedEmails": db.analyses.count_documents({}),
        "modelSpam": db.analyses.count_documents({"model_probability": {"$gte": 0.5}}),
        "phishing": db.analyses.count_documents({"phishing_risk": {"$in": ["medium", "high"]}}),
        "actions": {a: db.analyses.count_documents({"user_action": a}) for a in ("read", "deleted", "reported", "kept")},
        "feedback": {"spam": db.feedback.count_documents({"label": 1}), "notSpam": db.feedback.count_documents({"label": 0})},
        "model": {"version": model.version, "metrics": model.metrics},
        "database": services.db_backend,
        "retrainJob": _job_to_api(db.jobs.find_one({"_id": JOB_ID})),
    })


@api.post("/api/admin/retrain")
@admin_required
def admin_retrain():
    services = get_services()
    job = start_retraining(services.db, services.models, services.encryptor, current_app.config,
                           requested_by=str(g.user["_id"]), synchronous=current_app.config.get("RETRAIN_SYNC", False))
    if job is None:
        raise ApiError(409, "already_running", "Retraining is already running.")
    return jsonify({"job": _job_to_api(services.db.jobs.find_one({"_id": JOB_ID}))}), 202


@api.get("/api/admin/retrain")
@admin_required
def admin_retrain_status():
    return jsonify({"job": _job_to_api(get_services().db.jobs.find_one({"_id": JOB_ID}))})


@api.post("/api/admin/model/reset")
@admin_required
def admin_reset_model():
    services = get_services()
    services.models.reset_to_base()
    return jsonify({"model": {"version": services.models.get().version}})
