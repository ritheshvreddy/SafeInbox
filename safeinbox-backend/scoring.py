"""Confidence Scoring Module (SDD Appendix B: CALCULATE_SPAM_SCORE(spam_probability, email_text, sender_info)).

Combines the model's spam probability with sender information (the user's trusted/blocked
senders and Gmail's SPF/DKIM/DMARC results) and phishing findings, then maps the final score
to a classification type using the user's chosen spam sensitivity.
"""

LIKELY_SAFE = "Likely safe"
SUSPICIOUS = "Suspicious"
LIKELY_SPAM = "Likely spam"

# sensitivity -> (score at which an email becomes "Suspicious", score at which it becomes "Likely spam")
SENSITIVITY_THRESHOLDS = {
    "low": (0.50, 0.75),
    "medium": (0.35, 0.50),
    "high": (0.20, 0.35),
}
SENSITIVITIES = tuple(SENSITIVITY_THRESHOLDS)

DESCRIPTIONS = {
    LIKELY_SAFE: "This email seems legitimate.",
    SUSPICIOUS: "Be careful with this email - review it before clicking links or replying.",
    LIKELY_SPAM: "This email looks like spam or an unwanted promotion.",
}

_FAILED_AUTH = {"fail", "softfail", "permerror"}


def calculate_spam_score(model_probability, sender_status=None, auth=None, phishing_risk="none", sensitivity="medium"):
    score = float(model_probability)
    signals = []

    if sender_status == "trusted":
        score = min(score, 0.05)
        signals.append({"direction": "down", "text": "You marked this sender as trusted."})
    elif sender_status == "blocked":
        score = max(score, 0.95)
        signals.append({"direction": "up", "text": "You reported this sender as spam before."})
    else:
        auth = auth or {}
        failed = sorted(mech.upper() for mech, verdict in auth.items() if verdict in _FAILED_AUTH)
        if failed:
            score += (1 - score) * 0.3
            signals.append({"direction": "up", "text": f"The sender failed Gmail's authentication checks ({', '.join(failed)})."})
        elif auth.get("dkim") == "pass" and auth.get("dmarc") == "pass":
            score *= 0.8
            signals.append({"direction": "down", "text": "The sender passed Gmail's authentication checks (DKIM and DMARC)."})

        if phishing_risk == "high":
            score += (1 - score) * 0.5
            signals.append({"direction": "up", "text": "It contains links or sender details that look like phishing."})
        elif phishing_risk == "medium":
            score += (1 - score) * 0.2
            signals.append({"direction": "up", "text": "It contains links that hide where they really go."})

    score = max(0.0, min(1.0, score))
    suspicious_at, spam_at = SENSITIVITY_THRESHOLDS.get(sensitivity, SENSITIVITY_THRESHOLDS["medium"])
    if score >= spam_at:
        label = LIKELY_SPAM
    elif score >= suspicious_at:
        label = SUSPICIOUS
    else:
        label = LIKELY_SAFE
    if phishing_risk == "high" and label == LIKELY_SAFE and sender_status != "trusted":
        label = SUSPICIOUS

    return {
        "score": round(score, 4),
        "label": label,
        "is_spam": label == LIKELY_SPAM,
        "description": DESCRIPTIONS[label],
        "signals": signals,
    }


def _quote(words):
    return ", ".join(f'"{w}"' for w in words)


def build_reason(label, score, spam_words, ham_words, known_words):
    """One-sentence explanation of which words drove the model's decision."""
    if known_words == 0:
        return (f"{label} ({score:.0%}): none of the words in this email appeared in the training data, "
                "so the score mostly reflects the sender checks and how common spam was during training.")
    if label == LIKELY_SAFE:
        reason = f"Looks legitimate ({score:.0%} spam) because "
        reason += (f"it uses words that appeared mostly in normal emails during training: {_quote(ham_words)}."
                   if ham_words else "its overall wording resembles normal emails from training.")
        if spam_words:
            reason += f" Words that looked spammy: {_quote(spam_words)}."
        return reason
    prefix = "Flagged as spam" if label == LIKELY_SPAM else "Marked suspicious"
    reason = f"{prefix} ({score:.0%}) because "
    reason += (f"it uses words that appeared mostly in spam emails during training: {_quote(spam_words)}."
               if spam_words else "its overall wording resembles spam emails from training.")
    if ham_words:
        reason += f" Words that pointed the other way: {_quote(ham_words)}."
    return reason
