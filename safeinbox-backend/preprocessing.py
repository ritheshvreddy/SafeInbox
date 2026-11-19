"""Email Preprocessing Module (SRS 1.2 / 5.3).

Turns a raw Gmail API message into clean text: decodes the MIME parts, strips HTML tags,
removes quoted replies and signatures, and extracts the subject, sender, body and links.
"""
import base64
import html
import re
from email.utils import getaddresses, parseaddr
from html.parser import HTMLParser
from urllib.parse import urlparse

MAX_BODY_CHARS = 20000

URL_RE = re.compile(r"https?://[^\s<>\"'()\[\]]+", re.IGNORECASE)
ZERO_WIDTH_RE = re.compile(r"[​-‏  ‪-‮⁠-⁤﻿­͏]")
AUTH_RESULT_RE = re.compile(r"\b(spf|dkim|dmarc)=([a-z]+)", re.IGNORECASE)

# Lines that start a quoted reply or forwarded original - everything after them is dropped.
REPLY_MARKERS = [
    re.compile(r"^on .{3,200} wrote:\s*$", re.IGNORECASE),
    re.compile(r"^-{2,}\s*original message\s*-{2,}", re.IGNORECASE),
    re.compile(r"^-{2,}\s*forwarded message\s*-{2,}", re.IGNORECASE),
    re.compile(r"^from:\s.+\s(sent|date):\s", re.IGNORECASE),
]
# Signature delimiters - everything after them is dropped.
SIGNATURE_MARKERS = [
    re.compile(r"^--\s*$"),
    re.compile(r"^_{5,}\s*$"),
    re.compile(r"^sent from my (iphone|ipad|android|samsung|mobile|phone|galaxy)", re.IGNORECASE),
    re.compile(r"^get outlook for (ios|android)", re.IGNORECASE),
]
SIGN_OFF_RE = re.compile(
    r"^(best|kind|warm|warmest)?\s*(regards|wishes)|^(thanks|thank you|many thanks|cheers|sincerely|yours (truly|sincerely))[,.!]?\s*$",
    re.IGNORECASE,
)

BLOCK_TAGS = {
    "p", "div", "br", "li", "ul", "ol", "tr", "td", "th", "table", "section", "article",
    "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr",
}
SKIP_TAGS = {"script", "style", "head", "title", "noscript", "template"}


class _HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.links = []
        self._skip_depth = 0
        self._href = None
        self._link_text = []

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self._skip_depth += 1
            return
        if tag in BLOCK_TAGS:
            self.parts.append("\n")
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._link_text = []

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if tag == "a" and self._href is not None:
            text = " ".join("".join(self._link_text).split())
            self.links.append({"url": self._href.strip(), "text": text})
            self._href = None
        if tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip_depth:
            return
        self.parts.append(data)
        if self._href is not None:
            self._link_text.append(data)


def html_to_text(markup: str):
    """Strip HTML tags. Returns (text, links) where links keep their visible text."""
    parser = _HTMLTextExtractor()
    try:
        parser.feed(markup or "")
        parser.close()
    except Exception:  # malformed HTML - fall back to a crude tag strip
        return re.sub(r"<[^>]+>", " ", markup or ""), []
    return "".join(parser.parts), parser.links


def _decode_base64url(data: str) -> str:
    raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
    return raw.decode("utf-8", errors="replace")


def extract_bodies(payload: dict):
    """Collect the text/plain and text/html parts of a Gmail message payload (skipping attachments)."""
    plain, rich = [], []

    def walk(part):
        if not part or part.get("filename"):
            return
        mime = (part.get("mimeType") or "").lower()
        data = (part.get("body") or {}).get("data")
        if data:
            if mime == "text/plain":
                plain.append(_decode_base64url(data))
            elif mime == "text/html":
                rich.append(_decode_base64url(data))
        for child in part.get("parts") or []:
            walk(child)

    walk(payload or {})
    return "\n".join(plain), "\n".join(rich)


def _hostname(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def clean_text(text: str) -> str:
    """Normalise whitespace and remove quoted replies, signatures and sign-offs."""
    text = html.unescape(text or "")
    text = ZERO_WIDTH_RE.sub("", text).replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ")

    kept = []
    for raw_line in text.split("\n"):
        line = " ".join(raw_line.split())
        if line.startswith(">"):
            continue  # quoted reply line
        if any(marker.search(line) for marker in REPLY_MARKERS + SIGNATURE_MARKERS):
            break
        kept.append(line)

    # Drop a trailing sign-off block ("Regards,\nJohn") if it appears near the end.
    non_empty = [i for i, line in enumerate(kept) if line]
    for index in non_empty[-6:]:
        if SIGN_OFF_RE.search(kept[index]) and len(kept[index]) < 40:
            kept = kept[:index]
            break

    # Replace long URLs with their domain so they don't swamp summaries and the classifier.
    cleaned = "\n".join(kept)
    cleaned = URL_RE.sub(lambda m: f"[{_hostname(m.group(0)) or 'link'}]", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned[:MAX_BODY_CHARS]


def _header_map(headers):
    result = {}
    for header in headers or []:
        name = (header.get("name") or "").lower()
        if name and name not in result:
            result[name] = header.get("value") or ""
    return result


def parse_auth_results(value: str) -> dict:
    """Read SPF/DKIM/DMARC verdicts from Gmail's Authentication-Results header."""
    results = {}
    for mechanism, verdict in AUTH_RESULT_RE.findall(value or ""):
        results.setdefault(mechanism.lower(), verdict.lower())
    return results


def parse_gmail_message(message: dict) -> dict:
    """Convert a Gmail API message (format=full) into the fields SafeInbox works with."""
    payload = message.get("payload") or {}
    headers = _header_map(payload.get("headers"))

    sender_name, sender_email = parseaddr(headers.get("from", ""))
    reply_to_addresses = [addr for _, addr in getaddresses([headers.get("reply-to", "")]) if addr]

    plain, rich = extract_bodies(payload)
    links = []
    rich_text = ""
    if rich:
        rich_text, links = html_to_text(rich)
    body_source = plain if plain.strip() else rich_text

    # Plain-text URLs (and those in HTML text) are links too; their visible text is the URL itself.
    seen = {link["url"] for link in links}
    for url in URL_RE.findall(plain + "\n" + rich_text):
        url = url.rstrip(".,;:!?")
        if url not in seen:
            seen.add(url)
            links.append({"url": url, "text": url})

    snippet = html.unescape(message.get("snippet") or "")
    body = clean_text(body_source) or snippet

    try:
        received_ms = int(message.get("internalDate") or 0)
    except (TypeError, ValueError):
        received_ms = 0

    return {
        "gmail_id": message.get("id"),
        "thread_id": message.get("threadId"),
        "subject": headers.get("subject", "").strip() or "(no subject)",
        "sender": headers.get("from", "").strip(),
        "sender_name": sender_name.strip(),
        "sender_email": sender_email.strip().lower(),
        "reply_to": [addr.lower() for addr in reply_to_addresses],
        "snippet": snippet,
        "body": body,
        "links": links[:100],
        "auth": parse_auth_results(headers.get("authentication-results", "")),
        "received_ms": received_ms,
        "label_ids": message.get("labelIds") or [],
    }
