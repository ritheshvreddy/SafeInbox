"""Shared services and the email analysis pipeline (preprocess -> classify -> summarize -> score)."""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from flask import current_app

import phishing
from preprocessing import clean_text
from scoring import LIKELY_SAFE, LIKELY_SPAM, SENSITIVITIES, SUSPICIOUS, build_reason, calculate_spam_score
from summarizer import summarize

DEFAULT_PREFERENCES = {"sensitivity": "medium", "summary_sentences": 3, "max_emails": 25, "theme": "dark"}
ALLOWED_MAX_EMAILS = (10, 25, 50)
MAX_STORED_BODY_CHARS = 10000


@dataclass
class Services:
    db: object
    db_backend: str
    encryptor: object
    models: object


def get_services() -> Services:
    return current_app.extensions["safeinbox"]


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso(value):
    return value.isoformat(timespec="seconds") + "Z" if value else None


# ---------------------------------------------------------------- users & preferences


def upsert_user(services, email, name, role):
    """Create the user on first sign-in (registration) or update their profile."""
    now = utcnow()
    enc = services.encryptor
    email_hash = enc.lookup_hash(email)
    services.db.users.update_one(
        {"email_hash": email_hash},
        {
            "$set": {"email_enc": enc.encrypt(email), "name_enc": enc.encrypt(name), "role": role, "last_login_at": now},
            "$setOnInsert": {"created_at": now, "preferences": dict(DEFAULT_PREFERENCES), "senders": {},
                             "sessions": [], "current_unread": []},
        },
        upsert=True,
    )
    return services.db.users.find_one({"email_hash": email_hash})


def store_gmail_token(services, user_id, access_token, expires_in):
    services.db.users.update_one(
        {"_id": user_id},
        {"$set": {"gmail_token_enc": services.encryptor.encrypt(access_token),
                  "gmail_token_expires_at": utcnow() + timedelta(seconds=max(60, int(expires_in)))}},
    )


def clear_gmail_token(services, user_id):
    services.db.users.update_one({"_id": user_id}, {"$unset": {"gmail_token_enc": "", "gmail_token_expires_at": ""}})


def get_preferences(user) -> dict:
    prefs = dict(DEFAULT_PREFERENCES)
    prefs.update(user.get("preferences") or {})
    return prefs


def validate_preferences(data: dict) -> dict:
    """Return only valid preference changes; raise ValueError for bad values."""
    updates = {}
    if "sensitivity" in data:
        if data["sensitivity"] not in SENSITIVITIES:
            raise ValueError("sensitivity must be low, medium or high")
        updates["sensitivity"] = data["sensitivity"]
    if "summary_sentences" in data:
        value = int(data["summary_sentences"])
        if not 1 <= value <= 5:
            raise ValueError("summary_sentences must be between 1 and 5")
        updates["summary_sentences"] = value
    if "max_emails" in data:
        value = int(data["max_emails"])
        if value not in ALLOWED_MAX_EMAILS:
            raise ValueError(f"max_emails must be one of {ALLOWED_MAX_EMAILS}")
        updates["max_emails"] = value
    if "theme" in data:
        if data["theme"] not in ("light", "dark"):
            raise ValueError("theme must be light or dark")
        updates["theme"] = data["theme"]
    return updates


def user_profile(services, user, role):
    enc = services.encryptor
    return {
        "name": enc.decrypt(user["name_enc"]),
        "email": enc.decrypt(user["email_enc"]),
        "role": role,
        "preferences": get_preferences(user),
        "createdAt": iso(user.get("created_at")),
    }


def set_sender_status(services, user_id, sender_email, status):
    sender_hash = services.encryptor.lookup_hash(sender_email)
    services.db.users.update_one(
        {"_id": user_id},
        {"$set": {f"senders.{sender_hash}": {"status": status, "email_enc": services.encryptor.encrypt(sender_email),
                                              "updated_at": utcnow()}}},
    )
    return sender_hash


# ---------------------------------------------------------------- analysis pipeline


def analyze_content(model, subject, body, summary_sentences):
    """Classify and summarize already-preprocessed text."""
    result = model.analyze(f"{subject}\n{body}")
    return {
        "model_probability": result["probability"],
        "spam_words": result["spam_words"],
        "ham_words": result["ham_words"],
        "known_words": result["known_words"],
        "summary": summarize(body, summary_sentences),
    }


def analyze_and_store(services, user_id, parsed, model, prefs, retention_days):
    """Run the full pipeline on a parsed Gmail message and save the (encrypted) result."""
    body = parsed["body"] or parsed["snippet"]
    analysis = analyze_content(model, parsed["subject"], body, prefs["summary_sentences"])
    phishing_result = phishing.analyze(parsed["links"], parsed["sender_name"], parsed["sender_email"], parsed["reply_to"])
    now = utcnow()
    received = datetime.fromtimestamp(parsed["received_ms"] / 1000, tz=timezone.utc).replace(tzinfo=None) \
        if parsed["received_ms"] else now

    content = {
        "subject": parsed["subject"], "sender": parsed["sender"], "sender_name": parsed["sender_name"],
        "sender_email": parsed["sender_email"], "snippet": parsed["snippet"], "body": body[:MAX_STORED_BODY_CHARS],
        "summary": analysis["summary"], "spam_words": analysis["spam_words"], "ham_words": analysis["ham_words"],
        "known_words": analysis["known_words"], "phishing": phishing_result,
    }
    fields = {
        "thread_id": parsed["thread_id"], "received_at": received, "analyzed_at": now,
        "expires_at": now + timedelta(days=retention_days), "model_version": model.version,
        "summary_sentences": prefs["summary_sentences"], "model_probability": analysis["model_probability"],
        "auth": parsed["auth"], "phishing_risk": phishing_result["risk"],
        "sender_hash": services.encryptor.lookup_hash(parsed["sender_email"]),
        "content_enc": services.encryptor.encrypt_json(content),
    }
    services.db.analyses.update_one(
        {"user_id": user_id, "gmail_id": parsed["gmail_id"]},
        {"$set": fields, "$setOnInsert": {"user_action": None, "action_at": None}},
        upsert=True,
    )
    return services.db.analyses.find_one({"user_id": user_id, "gmail_id": parsed["gmail_id"]})


def refresh_stale_analysis(services, doc, model, prefs):
    """Re-run the model / summary from the stored text when the model or summary length changed (no Gmail call)."""
    if doc["model_version"] == model.version and doc["summary_sentences"] == prefs["summary_sentences"]:
        return doc
    content = services.encryptor.decrypt_json(doc["content_enc"])
    analysis = analyze_content(model, content["subject"], content["body"], prefs["summary_sentences"])
    content.update({k: analysis[k] for k in ("summary", "spam_words", "ham_words", "known_words")})
    updates = {"model_version": model.version, "summary_sentences": prefs["summary_sentences"],
               "model_probability": analysis["model_probability"],
               "content_enc": services.encryptor.encrypt_json(content)}
    services.db.analyses.update_one({"_id": doc["_id"]}, {"$set": updates})
    doc.update(updates)
    return doc


def email_to_api(services, doc, user, include_body=True):
    """Decrypt a stored analysis and apply the user's current settings to produce the API response."""
    content = services.encryptor.decrypt_json(doc["content_enc"])
    prefs = get_preferences(user)
    sender_status = ((user.get("senders") or {}).get(doc.get("sender_hash")) or {}).get("status")
    scoring = calculate_spam_score(doc["model_probability"], sender_status, doc.get("auth"),
                                   doc.get("phishing_risk", "none"), prefs["sensitivity"])
    reason = build_reason(scoring["label"], scoring["score"], content["spam_words"], content["ham_words"],
                          content["known_words"])
    email = {
        "id": doc["gmail_id"],
        "threadId": doc.get("thread_id"),
        "from": content["sender"],
        "senderName": content["sender_name"],
        "senderEmail": content["sender_email"],
        "subject": content["subject"],
        "snippet": content["snippet"],
        "summary": content["summary"],
        "receivedAt": iso(doc.get("received_at")),
        "analyzedAt": iso(doc.get("analyzed_at")),
        "spamScore": scoring["score"],
        "modelScore": round(doc["model_probability"], 4),
        "label": scoring["label"],
        "isSpam": scoring["is_spam"],
        "description": scoring["description"],
        "reason": reason,
        "signals": scoring["signals"],
        "spamWords": content["spam_words"],
        "hamWords": content["ham_words"],
        "phishing": content["phishing"],
        "auth": doc.get("auth") or {},
        "senderStatus": sender_status,
        "userAction": doc.get("user_action"),
        "modelVersion": doc["model_version"],
        "gmailUrl": "https://mail.google.com/mail/?authuser={}#all/{}".format(
            quote(services.encryptor.decrypt(user["email_enc"])), doc.get("thread_id") or doc["gmail_id"]
        ),
    }
    if include_body:
        email["body"] = content["body"]
    return email


def label_counts(emails):
    counts = {LIKELY_SPAM: 0, SUSPICIOUS: 0, LIKELY_SAFE: 0}
    for email in emails:
        counts[email["label"]] = counts.get(email["label"], 0) + 1
    return {"spam": counts[LIKELY_SPAM], "suspicious": counts[SUSPICIOUS], "safe": counts[LIKELY_SAFE],
            "phishing": sum(1 for e in emails if e["phishing"]["risk"] in ("medium", "high"))}


def analyze_text_only(model, text, subject="", sender="", summary_sentences=3, sensitivity="medium"):
    """Analyse pasted text without storing anything (public /api/check endpoint)."""
    from email.utils import parseaddr

    from preprocessing import URL_RE, html_to_text

    raw = text or ""
    links = []
    if "<" in raw and ">" in raw:
        raw, links = html_to_text(raw)
    links += [{"url": u, "text": u} for u in URL_RE.findall(raw)]
    body = clean_text(raw)
    analysis = analyze_content(model, subject, body, summary_sentences)
    name, address = parseaddr(sender or "")
    phishing_result = phishing.analyze(links, name, address.lower())
    scoring = calculate_spam_score(analysis["model_probability"], None, None, phishing_result["risk"], sensitivity)
    reason = build_reason(scoring["label"], scoring["score"], analysis["spam_words"], analysis["ham_words"],
                          analysis["known_words"])
    return analysis, phishing_result, scoring, reason
