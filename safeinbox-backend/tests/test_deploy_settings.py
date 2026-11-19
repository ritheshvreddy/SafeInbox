"""Settings used for public deployments (Render): Limited Use compliance and required keys."""
import pytest

from app import create_app
from conftest import fake_verifier, login
from services import get_services


def make_app(tmp_path, gmail, **overrides):
    config = {
        "TESTING": True, "INSTANCE_DIR": tmp_path, "MONGO_URI": "mongomock://", "GOOGLE_CLIENT_ID": "test-client-id",
        "ADMIN_EMAILS": {"admin@example.com"}, "GOOGLE_TOKEN_VERIFIER": fake_verifier,
        "GMAIL_SERVICE_FACTORY": lambda token: gmail, "RETRAIN_SYNC": True,
    }
    config.update(overrides)
    return create_app(config)


def test_feedback_text_not_stored_by_default(tmp_path, gmail):
    app = make_app(tmp_path, gmail)  # STORE_FEEDBACK_TEXT defaults to off
    client = app.test_client()
    headers = login(client, "token-admin")
    client.get("/api/emails", headers=headers)
    client.post("/api/emails/m2/action", json={"action": "report"}, headers=headers)

    with app.app_context():
        feedback = list(get_services().db.feedback.find({}))
    assert len(feedback) == 1 and feedback[0]["label"] == 1 and "text_enc" not in feedback[0]

    # The sender is still blocked for this user (personalised, allowed) ...
    emails = {e["id"]: e for e in client.get("/api/emails?cached=1", headers=headers).get_json()["emails"]}
    assert emails["m4"]["senderStatus"] == "blocked"
    # ... but retraining only uses the public dataset.
    client.post("/api/admin/retrain", headers=headers)
    job = client.get("/api/admin/retrain", headers=headers).get_json()["job"]
    assert job["status"] == "succeeded" and job["metrics"]["feedback_emails"] == 0


def test_cors_allows_only_the_configured_frontend(tmp_path, gmail):
    app = make_app(tmp_path, gmail, CORS_ORIGINS=["https://safeinbox.vercel.app"])
    client = app.test_client()
    preflight = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"}
    allowed = client.options("/api/emails", headers={"Origin": "https://safeinbox.vercel.app", **preflight})
    assert allowed.headers.get("Access-Control-Allow-Origin") == "https://safeinbox.vercel.app"
    assert "authorization" in allowed.headers.get("Access-Control-Allow-Headers", "").lower()
    blocked = client.options("/api/emails", headers={"Origin": "https://evil.example.com", **preflight})
    assert "Access-Control-Allow-Origin" not in blocked.headers


def test_require_keys_refuses_to_start_without_keys(tmp_path, gmail, monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.delenv("DATA_ENCRYPTION_KEY", raising=False)
    with pytest.raises(RuntimeError, match="must be set"):
        make_app(tmp_path, gmail, REQUIRE_KEYS=True)
    # With explicit keys it starts normally.
    app = make_app(tmp_path, gmail, REQUIRE_KEYS=True, SECRET_KEY="s" * 40,
                   DATA_ENCRYPTION_KEY="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
    assert app.test_client().get("/api/health").status_code == 200
