import base64
import os
import sys
import uuid
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app  # noqa: E402
from auth import ApiError  # noqa: E402


def b64(text):
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii").rstrip("=")


def make_message(message_id, subject, sender, text=None, html=None,
                 auth="spf=pass smtp.mailfrom=x; dkim=pass header.i=@x; dmarc=pass", reply_to=None,
                 internal_date=1_700_000_000_000):
    headers = [{"name": "From", "value": sender}, {"name": "Subject", "value": subject},
               {"name": "Authentication-Results", "value": f"mx.google.com; {auth}"}]
    if reply_to:
        headers.append({"name": "Reply-To", "value": reply_to})
    parts = []
    if text is not None:
        parts.append({"mimeType": "text/plain", "filename": "", "body": {"data": b64(text)}})
    if html is not None:
        parts.append({"mimeType": "text/html", "filename": "", "body": {"data": b64(html)}})
    parts.append({"mimeType": "application/pdf", "filename": "invoice.pdf", "body": {"attachmentId": "a1"}})
    return {
        "id": message_id, "threadId": "t-" + message_id, "labelIds": ["INBOX", "UNREAD"],
        "snippet": (text or subject)[:120], "internalDate": str(internal_date),
        "payload": {"mimeType": "multipart/mixed", "headers": headers, "parts": parts},
    }


SAMPLE_MESSAGES = [
    make_message("m1", "Team meeting moved", "Alice Smith <alice@company.com>",
                 text="Hi team,\n\nThe project meeting is moved to 3pm tomorrow. Please review the attached agenda "
                      "and the budget spreadsheet before we meet.\n\nThanks,\nAlice\n\n-- \nAlice Smith | Project Lead"),
    make_message("m2", "You have WON a FREE prize!!!", "Prize Center <winner@prizes-now.biz>",
                 html="<html><body><p>Congratulations! You have won a <b>FREE</b> iPhone. Click here to claim your "
                      "prize now. Limited time offer, act now! Cheap viagra and pills also available.</p>"
                      "<a href='http://bit.ly/claim-prize'>Claim now</a></body></html>",
                 auth="spf=fail smtp.mailfrom=prizes-now.biz; dkim=none; dmarc=fail"),
    make_message("m3", "Your account is locked", "PayPal Security <security@paypal-alerts.xyz>",
                 html="<p>We noticed unusual activity. Verify your account now or it will be suspended.</p>"
                      "<a href='http://198.51.100.7/paypal/login'>https://www.paypal.com/signin</a>"),
    make_message("m4", "Weekly prize newsletter", "Prize Center <winner@prizes-now.biz>",
                 text="Win a free cruise! Claim your exclusive offer today, click the link. Free money awaits."),
]


class FakeRequest:
    def __init__(self, func):
        self._func = func

    def execute(self):
        return self._func()


class FakeBatch:
    def __init__(self, callback):
        self._callback = callback
        self._requests = []

    def add(self, request, request_id):
        self._requests.append((request_id, request))

    def execute(self):
        for request_id, request in self._requests:
            try:
                self._callback(request_id, request.execute(), None)
            except Exception as exc:  # pragma: no cover - mirrors googleapiclient behaviour
                self._callback(request_id, None, exc)


class FakeMessages:
    def __init__(self, gmail):
        self._gmail = gmail

    def list(self, userId, q, maxResults):
        self._gmail.calls.append(("list", q, maxResults))
        return FakeRequest(lambda: {"messages": [{"id": i} for i in self._gmail.unread[:maxResults]]})

    def get(self, userId, id, format):
        self._gmail.calls.append(("get", id))
        return FakeRequest(lambda: self._gmail.store[id])

    def modify(self, userId, id, body):
        self._gmail.calls.append(("modify", id, body))

        def run():
            if "UNREAD" in body.get("removeLabelIds", []) and id in self._gmail.unread:
                self._gmail.unread.remove(id)
            return {}
        return FakeRequest(run)

    def trash(self, userId, id):
        self._gmail.calls.append(("trash", id))

        def run():
            if id in self._gmail.unread:
                self._gmail.unread.remove(id)
            return {}
        return FakeRequest(run)


class FakeGmail:
    def __init__(self, messages):
        self.store = {m["id"]: m for m in messages}
        self.unread = [m["id"] for m in messages]
        self.calls = []

    def users(self):
        return self

    def messages(self):
        return FakeMessages(self)

    def new_batch_http_request(self, callback):
        return FakeBatch(callback)


TOKENS = {"token-user": "user@example.com", "token-admin": "admin@example.com", "token-other": "other@example.com"}


def fake_verifier(token, client_id):
    if token not in TOKENS:
        raise ApiError(401, "invalid_google_token", "Google did not accept the sign-in.")
    email = TOKENS[token]
    return {"email": email, "name": email.split("@")[0].title(), "expires_in": 3600}


@pytest.fixture
def gmail():
    return FakeGmail(SAMPLE_MESSAGES)


@pytest.fixture
def app(tmp_path, gmail):
    # Tests use an in-memory MongoDB by default. Set TEST_MONGO_URI (e.g. mongodb://localhost:27018)
    # to run them against a real server - each test then gets its own temporary database.
    real_mongo = os.getenv("TEST_MONGO_URI", "").rstrip("/")
    mongo_uri = f"{real_mongo}/safeinbox_test_{uuid.uuid4().hex[:12]}" if real_mongo else "mongomock://"
    application = create_app({
        "TESTING": True,
        "INSTANCE_DIR": tmp_path,
        "MONGO_URI": mongo_uri,
        "MONGO_FALLBACK_TO_MEMORY": False,
        "GOOGLE_CLIENT_ID": "test-client-id",
        "ADMIN_EMAILS": {"admin@example.com"},
        "GOOGLE_TOKEN_VERIFIER": fake_verifier,
        "GMAIL_SERVICE_FACTORY": lambda token: gmail,
        "RETRAIN_SYNC": True,
    })
    yield application
    if real_mongo:
        database = application.extensions["safeinbox"].db
        database.client.drop_database(database.name)


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, token="token-user"):
    response = client.post("/api/auth/google", json={"access_token": token})
    assert response.status_code == 200, response.get_json()
    return {"Authorization": "Bearer " + response.get_json()["sessionToken"]}
