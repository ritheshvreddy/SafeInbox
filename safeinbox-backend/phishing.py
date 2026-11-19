"""Phishing Detection (SRS "Other Requirements"): identifies and warns about suspicious links."""
import ipaddress
import re
from urllib.parse import urlparse

SEVERITY_ORDER = {"none": 0, "low": 1, "medium": 2, "high": 3}

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rebrand.ly",
    "shorturl.at", "tiny.cc", "rb.gy", "s.id", "t.ly", "v.gd", "shorte.st", "adf.ly", "bl.ink",
}
SUSPICIOUS_TLDS = {
    "zip", "mov", "xyz", "top", "click", "country", "gq", "tk", "ml", "cf", "ga", "work", "rest",
    "cam", "icu", "loan", "kim", "men", "date", "faith", "review", "party", "racing", "win",
}
# Brand name -> domains the brand really sends from / links to.
BRANDS = {
    "paypal": {"paypal.com", "paypal.me"},
    "apple": {"apple.com", "icloud.com"},
    "microsoft": {"microsoft.com", "live.com", "outlook.com", "office.com", "microsoftonline.com"},
    "google": {"google.com", "gmail.com", "youtube.com", "googleusercontent.com", "goo.gl", "g.co"},
    "amazon": {"amazon.com", "amazon.in", "amazon.co.uk", "amazon.de", "amazonaws.com", "amazon.jobs"},
    "netflix": {"netflix.com"},
    "facebook": {"facebook.com", "fb.com", "facebookmail.com", "meta.com"},
    "instagram": {"instagram.com"},
    "whatsapp": {"whatsapp.com", "whatsapp.net"},
    "linkedin": {"linkedin.com"},
    "dhl": {"dhl.com", "dhl.de"},
    "fedex": {"fedex.com"},
    "wellsfargo": {"wellsfargo.com"},
    "hdfc": {"hdfcbank.com", "hdfc.com"},
    "icici": {"icicibank.com"},
}
FREE_MAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com", "aol.com", "icloud.com",
    "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com", "rediffmail.com",
}
# Two-part public suffixes, so "shop.example.co.uk" -> "example.co.uk".
MULTI_PART_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "gov.uk", "co.in", "net.in", "org.in", "ac.in", "gov.in",
    "com.au", "net.au", "org.au", "co.nz", "co.jp", "com.br", "com.cn", "com.sg", "com.my", "co.za",
}
DOMAIN_LIKE_RE = re.compile(r"^(https?://)?(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(/\S*)?$", re.IGNORECASE)


def registered_domain(host: str) -> str:
    host = (host or "").lower().strip(".")
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    if ".".join(parts[-2:]) in MULTI_PART_SUFFIXES:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host.strip("[]"))
        return True
    except ValueError:
        return False


def _is_official(domain: str, brand: str) -> bool:
    """True for the brand's own domains, including country versions such as amazon.fr or paypal.de."""
    return domain in BRANDS[brand] or domain.split(".")[0] == brand


def _brand_impersonation(host: str):
    """Return the brand a host pretends to be, e.g. 'paypal-login.example.com' -> 'paypal'.

    Only whole words of the host name count, so 'purchase.example.com' or
    'googleadservices.com' are not mistaken for brands.
    """
    domain = registered_domain(host)
    words = set(re.split(r"[.\-]", host))
    for brand in BRANDS:
        if brand in words and not _is_official(domain, brand):
            return brand
    return None


def check_link(url: str, text: str = "") -> dict:
    """Inspect one link. Returns {"url", "host", "severity", "reasons"}."""
    reasons = []
    severity = "none"

    def flag(level, reason):
        nonlocal severity
        reasons.append(reason)
        if SEVERITY_ORDER[level] > SEVERITY_ORDER[severity]:
            severity = level

    url = (url or "").strip()
    try:
        parsed = urlparse(url)
    except ValueError:
        return {"url": url, "host": "", "severity": "medium", "reasons": ["Malformed link"]}

    scheme = (parsed.scheme or "").lower()
    if scheme in {"mailto", "tel", "cid", ""} and not url.lower().startswith("//"):
        return {"url": url, "host": "", "severity": "none", "reasons": []}
    if scheme in {"javascript", "data", "vbscript", "file"}:
        flag("high", f"Uses a dangerous '{scheme}:' link")
        return {"url": url, "host": "", "severity": severity, "reasons": reasons}

    host = (parsed.hostname or "").lower()
    if not host:
        return {"url": url, "host": "", "severity": "none", "reasons": []}

    if "@" in (parsed.netloc or ""):
        flag("high", "Hides the real destination with an '@' in the address")
    if _is_ip(host):
        flag("high", "Points to a raw IP address instead of a website name")
    if any(label.startswith("xn--") for label in host.split(".")):
        flag("high", "Uses look-alike (punycode) characters in the domain")

    brand = _brand_impersonation(host)
    if brand:
        flag("high", f"Domain mentions '{brand}' but is not an official {brand} website")

    visible = (text or "").strip()
    if visible and visible != url and DOMAIN_LIKE_RE.match(visible):
        shown_host = urlparse(visible if "://" in visible else "http://" + visible).hostname or ""
        if shown_host and registered_domain(shown_host) != registered_domain(host):
            flag("high", f"Link text shows '{shown_host}' but actually goes to '{host}'")

    if registered_domain(host) in URL_SHORTENERS or host in URL_SHORTENERS:
        flag("medium", "Uses a link shortener that hides the real destination")
    if host.rsplit(".", 1)[-1] in SUSPICIOUS_TLDS:
        flag("medium", f"Uses the '.{host.rsplit('.', 1)[-1]}' domain ending, which is common in scams")
    if host.count(".") >= 4:
        flag("low", "Has an unusually long chain of subdomains")
    if scheme == "http":
        flag("low", "Is not encrypted (http instead of https)")

    return {"url": url, "host": host, "severity": severity, "reasons": reasons}


def check_sender(sender_name: str, sender_email: str, reply_to=None) -> list:
    """Look for sender tricks: brand names on free-mail accounts, mismatched Reply-To, etc."""
    findings = []
    domain = sender_email.rsplit("@", 1)[-1].lower() if "@" in (sender_email or "") else ""
    name = (sender_name or "").lower()

    for brand in BRANDS:
        if re.search(rf"\b{brand}\b", name) and domain and not _is_official(registered_domain(domain), brand):
            findings.append({
                "severity": "high",
                "reason": f"Sender name says '{sender_name}' but the email comes from '{domain}', not an official {brand} address",
            })
            break

    if domain and DOMAIN_LIKE_RE.match(name.strip()):
        shown = registered_domain(name.strip().split("/")[0].replace("www.", ""))
        if shown and shown != registered_domain(domain):
            findings.append({"severity": "medium", "reason": f"Sender name looks like '{shown}' but the address is '{domain}'"})

    for address in reply_to or []:
        reply_domain = address.rsplit("@", 1)[-1].lower()
        if domain and reply_domain and registered_domain(reply_domain) != registered_domain(domain):
            severity = "medium" if reply_domain in FREE_MAIL_DOMAINS else "low"
            findings.append({"severity": severity, "reason": f"Replies would go to a different address ({address})"})
            break
    return findings


def analyze(links, sender_name="", sender_email="", reply_to=None, max_links=50) -> dict:
    """Check all links plus the sender. Returns the overall risk and the findings worth showing."""
    findings, seen = [], set()
    for link in links or []:
        url = (link.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        if len(seen) > max_links:
            break
        result = check_link(url, link.get("text", ""))
        if result["severity"] in {"medium", "high"}:
            findings.append(result)

    sender_findings = check_sender(sender_name, sender_email, reply_to)

    risk = "none"
    for level in [f["severity"] for f in findings] + [f["severity"] for f in sender_findings]:
        if SEVERITY_ORDER[level] > SEVERITY_ORDER[risk]:
            risk = level
    findings.sort(key=lambda f: -SEVERITY_ORDER[f["severity"]])
    return {"risk": risk, "links": findings[:10], "sender": sender_findings, "links_checked": len(seen)}
