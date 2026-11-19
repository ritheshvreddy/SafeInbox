"""SafeInbox assistant (SDD Appendix B pseudocode: "User input to chatbot" -> Summary / Fetch Emails / invalid input).

A rule-based assistant that answers questions about the analysed unread emails.
"""
import re

from scoring import LIKELY_SAFE, LIKELY_SPAM, SUSPICIOUS

HELP_LINES = [
    '"fetch my emails" - check Gmail for new unread emails',
    '"summary" - an overview of your unread inbox',
    '"summarize #2" or "summarize email from Amazon" - summary of one email',
    '"show spam" / "show suspicious" / "show safe emails"',
    '"any phishing?" - emails with dangerous-looking links',
    '"why is #1 spam?" - explain a decision',
    '"is newsletter@shop.com spam?"',
    '"how many spam emails?"',
    '"set sensitivity to high" / "set summary length to 2"',
]

LABEL_WORDS = {
    "spam": LIKELY_SPAM,
    "junk": LIKELY_SPAM,
    "suspicious": SUSPICIOUS,
    "safe": LIKELY_SAFE,
    "legit": LIKELY_SAFE,
    "legitimate": LIKELY_SAFE,
    "clean": LIKELY_SAFE,
}


def _reply(text, items=None, action=None, updates=None):
    return {"reply": text, "items": items or [], "action": action, "updates": updates or {}}


def _item(index, email):
    return {
        "id": email["id"],
        "index": index,
        "title": email["subject"],
        "subtitle": email["senderName"] or email["senderEmail"],
        "label": email["label"],
        "score": email["spamScore"],
    }


def find_email(query, emails):
    """Find an email by '#3', '3', 'latest', 'oldest', or text in the sender/subject."""
    query = (query or "").strip().strip("?.!\"'").strip()
    if not query or not emails:
        return None, None
    number = re.fullmatch(r"(?:#|no\.?\s*|number\s*|email\s*#?)?(\d{1,3})", query, re.IGNORECASE)
    if number:
        index = int(number.group(1))
        return (index, emails[index - 1]) if 1 <= index <= len(emails) else (None, None)
    lowered = query.lower()
    if re.fullmatch(r"(the )?(latest|newest|most recent|first|top)( one| email)?", lowered):
        return 1, emails[0]
    if re.fullmatch(r"(the )?(oldest|last)( one| email)?", lowered):
        return len(emails), emails[-1]
    lowered = re.sub(r"^(the )?(email|mail|message)s? (from|by|about) ", "", lowered)
    lowered = re.sub(r"^(from|by|about) ", "", lowered)
    for index, email in enumerate(emails, start=1):
        haystack = " ".join([email["senderName"] or "", email["senderEmail"] or "", email["subject"] or ""]).lower()
        if lowered and lowered in haystack:
            return index, email
    return None, None


def _explain(index, email):
    lines = [f"#{index} \"{email['subject']}\" from {email['senderName'] or email['senderEmail']} is "
             f"{email['label'].lower()} ({email['spamScore']:.0%}).", email["reason"]]
    lines += [signal["text"] for signal in email.get("signals", [])]
    for finding in email["phishing"].get("sender", []):
        lines.append("Warning: " + finding["reason"])
    for link in email["phishing"].get("links", [])[:3]:
        lines.append(f"Risky link ({link['host'] or link['url']}): " + "; ".join(link["reasons"]))
    return "\n".join(lines)


def handle(message, emails):
    """Answer a chat message. `emails` are the analysed unread emails (newest first)."""
    text = (message or "").strip()
    lowered = text.lower().strip(" ?!.")

    if not lowered or re.fullmatch(r"(hi|hello|hey|help|menu|commands|what can you do|\?)", lowered):
        return _reply("Hi! I'm the SafeInbox assistant. You can ask me:\n- " + "\n- ".join(HELP_LINES))

    if re.search(r"\b(fetch|refresh|reload|scan|check|load|get)\b.*\b(e-?mails?|mails?|inbox|messages?)\b", lowered) \
            and not re.search(r"\b(is|why)\b", lowered):
        return _reply("Checking Gmail for unread emails...", action="refresh")

    setting = re.search(r"\b(?:set|change|make)\b.*\bsensitivity\b.*\b(low|medium|high)\b", lowered)
    if setting:
        level = setting.group(1)
        return _reply(f"Done - spam sensitivity is now {level}.", action="preferences", updates={"sensitivity": level})
    length = re.search(r"\b(?:set|change|make)\b.*\bsummar(?:y|ies)\b.*?\b([1-5])\b", lowered)
    if length:
        count = int(length.group(1))
        return _reply(f"Done - summaries will now be {count} sentence{'s' if count > 1 else ''} long.",
                      action="preferences", updates={"summary_sentences": count})

    if not emails:
        return _reply('I have no analysed unread emails yet. Say "fetch my emails" first.')

    if re.search(r"phish|dangerous|malicious|risky link|suspicious link|scam link", lowered):
        risky = [(i, e) for i, e in enumerate(emails, 1) if e["phishing"]["risk"] in ("medium", "high")]
        if not risky:
            return _reply("Good news - I didn't find phishing signs in your unread emails.")
        return _reply(f"{len(risky)} email(s) have phishing warning signs. Don't click their links:",
                      items=[_item(i, e) for i, e in risky])

    count = re.search(r"\bhow many\b.*?\b(spam|junk|suspicious|safe|legit\w*|clean|unread|e-?mails?)\b", lowered)
    if count:
        word = count.group(1)
        if word in LABEL_WORDS:
            label = LABEL_WORDS[word]
            total = sum(1 for e in emails if e["label"] == label)
            return _reply(f"{total} of your {len(emails)} unread emails are {label.lower()}.")
        return _reply(f"You have {len(emails)} analysed unread emails.")

    why = re.search(r"\bwhy\b(?: is| was| did)?(.*?)(?:\b(?:marked|flagged|considered|classed|classified)\b)?"
                    r"(?:\s+as)?\s*\b(?:spam|safe|suspicious|junk|legit\w*)\b(.*)$", lowered)
    if why:
        target = (why.group(1) or why.group(2) or "").strip()
        index, email = find_email(target, emails)
        if not email:
            return _reply('Which email? Try "why is #1 spam?" or use part of the sender or subject.')
        return _reply(_explain(index, email), items=[_item(index, email)])

    listing = re.search(r"\b(show|list|which|what|see|display|find)\b.*?\b(spam|junk|suspicious|safe|legit\w*|clean)\b",
                        lowered)
    if listing:
        label = LABEL_WORDS.get(listing.group(2), LIKELY_SAFE)
        matches = [(i, e) for i, e in enumerate(emails, 1) if e["label"] == label]
        if not matches:
            return _reply(f"None of your unread emails are {label.lower()} right now.")
        return _reply(f"{len(matches)} email(s) are {label.lower()}:", items=[_item(i, e) for i, e in matches])

    summarize = re.match(r"^(?:please )?(?:summari[sz]e|summary(?: of)?|tl;?dr(?: of)?|what(?:'s| is) .*? about)\s*(.*)$",
                         lowered)
    if summarize or lowered in {"summary", "overview", "inbox summary", "summarise", "summarize"}:
        target = (summarize.group(1) if summarize else "").strip()
        if target in {"", "inbox", "my inbox", "emails", "my emails", "all", "everything", "unread"}:
            spam = [e for e in emails if e["label"] == LIKELY_SPAM]
            suspicious = [e for e in emails if e["label"] == SUSPICIOUS]
            safe = [e for e in emails if e["label"] == LIKELY_SAFE]
            lines = [f"You have {len(emails)} unread emails: {len(safe)} likely safe, {len(suspicious)} suspicious "
                     f"and {len(spam)} likely spam."]
            if safe:
                lines.append("Worth reading: " + "; ".join(f"\"{e['subject']}\"" for e in safe[:3]) + ".")
            if spam:
                senders = sorted({e["senderName"] or e["senderEmail"] for e in spam})
                lines.append("Spam mostly from: " + ", ".join(senders[:4]) + ".")
            return _reply("\n".join(lines))
        index, email = find_email(target, emails)
        if not email:
            return _reply(f"I couldn't find an unread email matching \"{target}\".")
        return _reply(f"#{index} \"{email['subject']}\" ({email['label'].lower()}):\n{email['summary'] or email['snippet']}",
                      items=[_item(index, email)])

    is_check = re.match(r"^(?:is|are)\s+(.+?)\s+(spam|junk|safe|suspicious|legit\w*)$", lowered)
    if is_check:
        index, email = find_email(is_check.group(1), emails)
        if not email:
            return _reply(f"I couldn't find an unread email matching \"{is_check.group(1)}\".")
        return _reply(_explain(index, email), items=[_item(index, email)])

    return _reply("Sorry, I didn't understand that (invalid input). Try one of these:\n- " + "\n- ".join(HELP_LINES))
