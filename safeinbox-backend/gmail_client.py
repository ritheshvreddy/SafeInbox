"""Gmail API Integration: fetch unread emails and apply the user's actions."""
import logging
import time

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

log = logging.getLogger("safeinbox")

UNREAD_QUERY = "is:unread in:inbox"
BATCH_SIZE = 10


class GmailAuthError(Exception):
    """The stored Gmail access token is missing, expired or revoked."""


class GmailError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def build_service(access_token: str):
    credentials = Credentials(token=access_token)
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def _translate(error: HttpError):
    status = getattr(error.resp, "status", 500)
    if status == 401:
        return GmailAuthError("Gmail access token expired or was revoked")
    if status == 429 or (status == 403 and "rate" in str(error).lower()):
        return GmailError("Gmail is rate-limiting requests. Wait a minute and try again.", 429)
    if status == 403:
        return GmailError("Gmail refused the request. Make sure you granted SafeInbox access to Gmail.", 403)
    return GmailError(f"Gmail API error ({status})", 502)


def _call(request):
    try:
        return request.execute()
    except HttpError as error:
        raise _translate(error) from error


def list_unread_ids(service, max_results: int):
    response = _call(service.users().messages().list(userId="me", q=UNREAD_QUERY, maxResults=max_results))
    return [message["id"] for message in response.get("messages", [])]


def get_messages(service, message_ids):
    """Fetch full messages in small batches. Returns (messages, failed_ids)."""
    messages, retry = {}, []

    def collect(request_id, response, exception):
        if exception is None:
            messages[request_id] = response
        else:
            retry.append(request_id)

    for start in range(0, len(message_ids), BATCH_SIZE):
        batch = service.new_batch_http_request(callback=collect)
        for message_id in message_ids[start:start + BATCH_SIZE]:
            batch.add(service.users().messages().get(userId="me", id=message_id, format="full"), request_id=message_id)
        try:
            batch.execute()
        except HttpError as error:
            translated = _translate(error)
            if isinstance(translated, GmailAuthError):
                raise translated from error
            retry.extend(i for i in message_ids[start:start + BATCH_SIZE] if i not in messages and i not in retry)

    # Retry failures (usually "too many concurrent requests") one at a time with a short back-off.
    failed = []
    for attempt, message_id in enumerate(retry):
        time.sleep(min(0.2 * (attempt + 1), 1.0))
        try:
            messages[message_id] = _call(service.users().messages().get(userId="me", id=message_id, format="full"))
        except GmailAuthError:
            raise
        except GmailError:
            failed.append(message_id)

    ordered = [messages[i] for i in message_ids if i in messages]
    return ordered, failed


def mark_read(service, message_id):
    _call(service.users().messages().modify(userId="me", id=message_id, body={"removeLabelIds": ["UNREAD"]}))


def trash(service, message_id):
    _call(service.users().messages().trash(userId="me", id=message_id))


def report_spam(service, message_id):
    _call(service.users().messages().modify(
        userId="me", id=message_id, body={"addLabelIds": ["SPAM"], "removeLabelIds": ["INBOX", "UNREAD"]}
    ))
