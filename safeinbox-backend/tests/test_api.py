"""End-to-end API tests with a fake Gmail service and an in-memory (or real, via TEST_MONGO_URI) MongoDB."""
import os
from datetime import timedelta

from conftest import login
from services import get_services, utcnow


def test_health(client):
    body = client.get("/api/health").get_json()
    expected_db = "mongodb" if os.getenv("TEST_MONGO_URI") else "in-memory"
    assert body["status"] == "ok" and body["database"] == expected_db and body["modelVersion"] == "base"


def test_public_check_endpoint(client):
    spam = client.post("/check_spam", json={"text": "Congratulations! You won a FREE prize. Click here to claim "
                                                    "your cash now, limited offer!"}).get_json()
    assert spam["is_spam"] is True and spam["spam_words"] and spam["summary"]
    ham = client.post("/api/check", json={"text": "Hi team, the meeting is moved to 3pm tomorrow. "
                                                  "Please review the attached agenda."}).get_json()
    assert ham["label"] == "Likely safe"
    assert client.post("/check_spam", json={}).status_code == 200


def test_endpoints_require_login(client):
    for method, path in [("get", "/api/emails"), ("get", "/api/history"), ("post", "/api/chat"),
                         ("get", "/api/preferences"), ("get", "/api/me/export")]:
        response = getattr(client, method)(path)
        assert response.status_code == 401 and response.get_json()["error"] == "auth_required"
    bad = client.get("/api/emails", headers={"Authorization": "Bearer forged.token.value"})
    assert bad.status_code == 401


def test_login_rejects_bad_token(client):
    response = client.post("/api/auth/google", json={"access_token": "not-a-real-token"})
    assert response.status_code == 401


def test_login_registers_user_with_encrypted_data(app, client):
    headers = login(client)
    me = client.get("/api/auth/me", headers=headers).get_json()
    assert me["user"]["email"] == "user@example.com" and me["user"]["role"] == "user" and me["gmailConnected"]
    with app.app_context():
        user = get_services().db.users.find_one({})
    assert "user@example.com" not in str(user)  # email, name and Gmail token are encrypted at rest
    assert user["gmail_token_enc"].startswith("v1:")


def test_fetch_and_analyse_emails(app, client, gmail):
    headers = login(client)
    body = client.get("/api/emails", headers=headers).get_json()
    emails = {e["id"]: e for e in body["emails"]}
    assert len(emails) == 4 and body["fromCache"] == 0

    assert emails["m1"]["label"] == "Likely safe"
    assert "Project Lead" not in emails["m1"]["body"]
    assert emails["m1"]["summary"]
    assert emails["m2"]["label"] == "Likely spam" and emails["m2"]["phishing"]["risk"] == "medium"
    assert any("authentication" in s["text"] for s in emails["m2"]["signals"])
    assert emails["m3"]["phishing"]["risk"] == "high" and emails["m3"]["label"] != "Likely safe"
    assert emails["m3"]["phishing"]["sender"]
    assert body["stats"]["phishing"] >= 2

    with app.app_context():
        stored = list(get_services().db.analyses.find({}))
    assert len(stored) == 4 and all("Team meeting" not in str(doc) for doc in stored)  # content is encrypted

    # Second fetch reuses the cached analyses instead of downloading the emails again.
    gets_before = len([c for c in gmail.calls if c[0] == "get"])
    again = client.get("/api/emails", headers=headers).get_json()
    assert again["fromCache"] == 4
    assert len([c for c in gmail.calls if c[0] == "get"]) == gets_before


def test_mark_read_and_delete(client, gmail):
    headers = login(client)
    client.get("/api/emails", headers=headers)
    assert client.post("/api/emails/m1/action", json={"action": "read"}, headers=headers).status_code == 200
    assert ("modify", "m1", {"removeLabelIds": ["UNREAD"]}) in gmail.calls
    assert client.post("/api/emails/m2/action", json={"action": "delete"}, headers=headers).status_code == 200
    assert ("trash", "m2") in gmail.calls
    cached = client.get("/api/emails?cached=1", headers=headers).get_json()
    assert {e["id"] for e in cached["emails"]} == {"m3", "m4"}
    history = client.get("/api/history", headers=headers).get_json()["items"]
    assert {h["id"]: h["userAction"] for h in history}["m1"] == "read"


def test_report_spam_blocks_sender_and_keep_trusts_sender(app, client, gmail):
    headers = login(client)
    client.get("/api/emails", headers=headers)

    # m2 and m4 come from the same sender: reporting one affects the other.
    client.post("/api/emails/m2/action", json={"action": "report"}, headers=headers)
    assert ("modify", "m2", {"addLabelIds": ["SPAM"], "removeLabelIds": ["INBOX", "UNREAD"]}) in gmail.calls
    emails = {e["id"]: e for e in client.get("/api/emails?cached=1", headers=headers).get_json()["emails"]}
    assert "m2" not in emails
    assert emails["m4"]["senderStatus"] == "blocked" and emails["m4"]["spamScore"] >= 0.95

    client.post("/api/emails/m4/action", json={"action": "keep"}, headers=headers)
    emails = {e["id"]: e for e in client.get("/api/emails?cached=1", headers=headers).get_json()["emails"]}
    assert emails["m4"]["senderStatus"] == "trusted" and emails["m4"]["label"] == "Likely safe"

    with app.app_context():
        feedback = {f["gmail_id"]: f["label"] for f in get_services().db.feedback.find({})}
    assert feedback == {"m2": 1, "m4": 0}

    senders = client.get("/api/senders", headers=headers).get_json()["senders"]
    assert senders == [{"id": senders[0]["id"], "email": "winner@prizes-now.biz", "status": "trusted",
                        "updatedAt": senders[0]["updatedAt"]}]
    assert client.delete(f"/api/senders/{senders[0]['id']}", headers=headers).status_code == 200
    assert client.get("/api/senders", headers=headers).get_json()["senders"] == []


def test_invalid_action(client):
    headers = login(client)
    client.get("/api/emails", headers=headers)
    assert client.post("/api/emails/m1/action", json={"action": "explode"}, headers=headers).status_code == 400
    assert client.post("/api/emails/nope/action", json={"action": "read"}, headers=headers).status_code == 404


def test_preferences_change_scoring_and_summary(client):
    headers = login(client)
    client.get("/api/emails", headers=headers)
    assert client.put("/api/preferences", json={"sensitivity": "extreme"}, headers=headers).status_code == 400
    assert client.put("/api/preferences", json={"summary_sentences": 9}, headers=headers).status_code == 400

    prefs = client.put("/api/preferences", json={"sensitivity": "high", "summary_sentences": 1, "max_emails": 10},
                       headers=headers).get_json()["preferences"]
    assert prefs["sensitivity"] == "high" and prefs["summary_sentences"] == 1 and prefs["max_emails"] == 10
    high = client.get("/api/emails?cached=1", headers=headers).get_json()
    client.put("/api/preferences", json={"sensitivity": "low"}, headers=headers)
    low = client.get("/api/emails?cached=1", headers=headers).get_json()
    assert high["stats"]["spam"] >= low["stats"]["spam"]


def test_chat(client):
    headers = login(client)
    assert "fetch my emails" in client.post("/api/chat", json={"message": "summary"}, headers=headers).get_json()["reply"]
    client.get("/api/emails", headers=headers)
    reply = client.post("/api/chat", json={"message": "summary"}, headers=headers).get_json()
    assert "You have 4 unread emails" in reply["reply"]
    phish = client.post("/api/chat", json={"message": "any phishing?"}, headers=headers).get_json()
    assert phish["items"]
    update = client.post("/api/chat", json={"message": "set sensitivity to high"}, headers=headers).get_json()
    assert update["action"] == "preferences"
    assert client.get("/api/preferences", headers=headers).get_json()["preferences"]["sensitivity"] == "high"


def test_expired_gmail_token_asks_to_reconnect(app, client):
    headers = login(client)
    with app.app_context():
        get_services().db.users.update_many({}, {"$set": {"gmail_token_expires_at": utcnow() - timedelta(minutes=1)}})
    response = client.get("/api/emails", headers=headers)
    assert response.status_code == 401 and response.get_json()["error"] == "gmail_reauth"
    # Reconnecting must use the same Google account.
    other = client.post("/api/auth/gmail-token", json={"access_token": "token-other"}, headers=headers)
    assert other.status_code == 403
    ok = client.post("/api/auth/gmail-token", json={"access_token": "token-user"}, headers=headers)
    assert ok.status_code == 200
    assert client.get("/api/emails", headers=headers).status_code == 200


def test_logout_ends_session(client):
    headers = login(client)
    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_gdpr_export_and_delete(app, client):
    headers = login(client)
    client.get("/api/emails", headers=headers)
    export = client.get("/api/me/export", headers=headers)
    assert export.status_code == 200 and "attachment" in export.headers["Content-Disposition"]
    data = export.get_json()
    assert data["profile"]["email"] == "user@example.com" and len(data["analysedEmails"]) == 4

    assert client.delete("/api/me", headers=headers).status_code == 200
    with app.app_context():
        db = get_services().db
        assert db.users.count_documents({}) == 0 and db.analyses.count_documents({}) == 0
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_admin_requires_admin_role(client):
    user_headers = login(client, "token-user")
    assert client.get("/api/admin/stats", headers=user_headers).status_code == 403
    assert client.post("/api/admin/retrain", headers=user_headers).status_code == 403
    admin_headers = login(client, "token-admin")
    assert client.get("/api/auth/me", headers=admin_headers).get_json()["user"]["role"] == "admin"
    stats = client.get("/api/admin/stats", headers=admin_headers).get_json()
    assert stats["users"] == 2 and stats["model"]["version"] == "base"


def test_admin_retrain_uses_feedback_and_keeps_accuracy(client):
    headers = login(client, "token-admin")
    client.get("/api/emails", headers=headers)
    client.post("/api/emails/m2/action", json={"action": "report"}, headers=headers)
    client.post("/api/emails/m1/action", json={"action": "keep"}, headers=headers)

    response = client.post("/api/admin/retrain", headers=headers)
    assert response.status_code == 202
    job = client.get("/api/admin/retrain", headers=headers).get_json()["job"]
    assert job["status"] == "succeeded", job
    assert job["metrics"]["accuracy"] >= 0.90 and job["metrics"]["feedback_emails"] == 2

    health = client.get("/api/health").get_json()
    assert health["modelVersion"] == job["version"]
    # Cached analyses are re-scored with the new model without contacting Gmail again.
    emails = client.get("/api/emails?cached=1", headers=headers).get_json()["emails"]
    assert all(e["modelVersion"] == job["version"] for e in emails)

    assert client.post("/api/admin/model/reset", headers=headers).get_json()["model"]["version"] == "base"
