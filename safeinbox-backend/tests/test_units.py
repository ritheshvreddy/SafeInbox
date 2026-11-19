"""Unit tests for preprocessing, phishing detection, encryption, scoring and the chatbot."""
import pytest

import chatbot
import phishing
from conftest import SAMPLE_MESSAGES
from encryption import Encryptor
from preprocessing import clean_text, html_to_text, parse_auth_results, parse_gmail_message
from scoring import LIKELY_SAFE, LIKELY_SPAM, SUSPICIOUS, calculate_spam_score
from summarizer import summarize

# ---------------------------------------------------------------- preprocessing


def test_html_is_stripped_and_links_kept():
    text, links = html_to_text("<style>p{color:red}</style><p>Hello <b>there</b></p><a href='https://x.com/a'>Click</a>")
    assert "color" not in text and "Hello there" in " ".join(text.split())
    assert links == [{"url": "https://x.com/a", "text": "Click"}]


def test_clean_text_removes_quotes_signature_and_sign_off():
    raw = ("Please send the report by Friday.\n\nThanks,\nBob\n-- \nBob | Sales\n"
           "On Mon, Jan 1, 2024 at 9:00 AM Alice <a@x.com> wrote:\n> old text")
    assert clean_text(raw) == "Please send the report by Friday."


def test_clean_text_replaces_urls_with_domain():
    assert clean_text("Visit https://www.example.com/very/long/tracking?id=1 today") == "Visit [www.example.com] today"


def test_parse_gmail_message_extracts_fields():
    parsed = parse_gmail_message(SAMPLE_MESSAGES[0])
    assert parsed["subject"] == "Team meeting moved"
    assert parsed["sender_email"] == "alice@company.com"
    assert parsed["sender_name"] == "Alice Smith"
    assert "meeting is moved" in parsed["body"]
    assert "Project Lead" not in parsed["body"]  # signature removed
    assert parsed["auth"] == {"spf": "pass", "dkim": "pass", "dmarc": "pass"}


def test_parse_auth_results():
    assert parse_auth_results("mx.google.com; dkim=fail; spf=softfail; dmarc=pass") == \
        {"dkim": "fail", "spf": "softfail", "dmarc": "pass"}


# ---------------------------------------------------------------- phishing


@pytest.mark.parametrize("url,text,expected", [
    ("http://198.51.100.7/login", "", "high"),
    ("https://paypal-secure-login.com/verify", "", "high"),
    ("https://evil.example.com/x", "https://www.paypal.com/signin", "high"),
    ("https://xn--pypal-4ve.com", "", "high"),
    ("https://bit.ly/abc", "Click", "medium"),
    ("https://free-gift.xyz/", "", "medium"),
    ("javascript:alert(1)", "", "high"),
    ("https://www.amazon.fr/orders", "Your orders", "none"),
    ("https://purchase.example.com/receipt", "Receipt", "none"),
    ("https://www.googleadservices.com/x", "Ad", "none"),
    ("mailto:help@example.com", "Email us", "none"),
])
def test_check_link(url, text, expected):
    assert phishing.check_link(url, text)["severity"] == expected


def test_sender_impersonation():
    findings = phishing.check_sender("PayPal Support", "support@gmail-helpdesk.ru")
    assert findings and findings[0]["severity"] == "high"
    assert phishing.check_sender("Google", "no-reply@accounts.google.com") == []
    assert phishing.check_sender("Amazon.in", "ship-confirm@amazon.in") == []


def test_reply_to_mismatch():
    findings = phishing.check_sender("Bank", "alerts@mybank.com", ["refunds.mybank@gmail.com"])
    assert findings[0]["severity"] == "medium"


# ---------------------------------------------------------------- encryption


def test_encryption_round_trip_and_tamper_detection():
    enc = Encryptor(Encryptor.generate_key())
    token = enc.encrypt("secret email body")
    assert "secret" not in token
    assert enc.decrypt(token) == "secret email body"
    assert enc.encrypt("same") != enc.encrypt("same")  # random nonce
    tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    with pytest.raises(Exception):
        enc.decrypt(tampered)
    assert enc.decrypt_json(enc.encrypt_json({"a": [1, 2]})) == {"a": [1, 2]}
    assert enc.lookup_hash("A@B.com ") == enc.lookup_hash("a@b.com")


def test_encryption_rejects_short_key():
    with pytest.raises(ValueError):
        Encryptor("c2hvcnQ=")


# ---------------------------------------------------------------- scoring


def test_sensitivity_levels():
    assert calculate_spam_score(0.4, sensitivity="low")["label"] == LIKELY_SAFE
    assert calculate_spam_score(0.4, sensitivity="medium")["label"] == SUSPICIOUS
    assert calculate_spam_score(0.4, sensitivity="high")["label"] == LIKELY_SPAM


def test_trusted_and_blocked_senders_override_model():
    assert calculate_spam_score(0.9, sender_status="trusted")["label"] == LIKELY_SAFE
    assert calculate_spam_score(0.05, sender_status="blocked")["label"] == LIKELY_SPAM


def test_auth_and_phishing_signals():
    failed = calculate_spam_score(0.3, auth={"spf": "fail"})
    assert failed["score"] > 0.3 and failed["signals"][0]["direction"] == "up"
    passed = calculate_spam_score(0.3, auth={"dkim": "pass", "dmarc": "pass"})
    assert passed["score"] < 0.3
    assert calculate_spam_score(0.01, phishing_risk="high")["label"] != LIKELY_SAFE


# ---------------------------------------------------------------- summarizer


def test_summary_respects_sentence_count():
    text = " ".join(f"Sentence number {i} talks about the quarterly budget review meeting." for i in range(10))
    summary = summarize(text, 2)
    assert summary.count("Sentence number") == 2
    assert summarize("", 3) == ""


# ---------------------------------------------------------------- chatbot

EMAILS = [
    {"id": "a", "subject": "Lunch on Friday", "senderName": "Alice", "senderEmail": "alice@x.com", "label": LIKELY_SAFE,
     "spamScore": 0.1, "summary": "Lunch plans.", "snippet": "", "reason": "Looks legitimate.", "signals": [],
     "phishing": {"risk": "none", "links": [], "sender": []}},
    {"id": "b", "subject": "FREE prize", "senderName": "Prize Center", "senderEmail": "win@prize.biz",
     "label": LIKELY_SPAM, "spamScore": 0.97, "summary": "Claim your prize.", "snippet": "", "reason": "Flagged.",
     "signals": [], "phishing": {"risk": "high", "links": [{"host": "bit.ly", "url": "x", "reasons": ["Shortener"]}],
                                 "sender": []}},
]


@pytest.mark.parametrize("message,expected", [
    ("hello", "You can ask me"),
    ("fetch my emails", "Checking Gmail"),
    ("summary", "You have 2 unread emails"),
    ("summarize #2", "Claim your prize."),
    ("summarize email from alice", "Lunch plans."),
    ("show spam", "1 email(s) are likely spam"),
    ("any phishing?", "phishing warning signs"),
    ("why is #2 spam?", "#2 \"FREE prize\""),
    ("is prize center spam?", "likely spam"),
    ("how many spam emails?", "1 of your 2"),
    ("blah blah", "invalid input"),
])
def test_chatbot_intents(message, expected):
    assert expected in chatbot.handle(message, EMAILS)["reply"]


def test_chatbot_actions():
    assert chatbot.handle("refresh inbox", EMAILS)["action"] == "refresh"
    result = chatbot.handle("set sensitivity to high", EMAILS)
    assert result["action"] == "preferences" and result["updates"] == {"sensitivity": "high"}
    assert chatbot.handle("set summary length to 2", EMAILS)["updates"] == {"summary_sentences": 2}
