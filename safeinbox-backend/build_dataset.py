"""Build email_dataset.csv.gz, the training data for the spam model.

Usage (from inside safeinbox-backend):  pip install pyarrow && python build_dataset.py
Then run TrainModel.py to train on it. pyarrow is only needed here, not by the server.

The original dataset (spam_ham_dataset.csv) only contains Enron business emails as legitimate
mail, so the model learned "anything that isn't Enron business talk is spam" and flagged normal
modern emails (security alerts, deploy notices, order updates). This script mixes in two more
public corpora so the model sees many kinds of legitimate mail and spam:

  enron         spam_ham_dataset.csv (already in this folder)                       ~5,200 emails
  spamassassin  SpamAssassin public corpus - mailing lists, newsletters, personal   ~6,000 emails
                mail and commercial-looking "hard ham" (Apache, public domain-ish)
  phishing      "Phishing Email Detection" dataset (Kaggle / Hugging Face           ~18,600 emails
                zefang-liu/phishing-email-dataset, LGPL-3.0) - phishing and spam
                plus Enron / Linguist List ham
  multi         "Phishing Email Dataset" (Kaggle naserabdullahalam, Hugging Face     sample of ~76,000
                mirror zionia/phishing-emails) - CEAS-2008, Nazario phishing,
                Nigerian fraud, Ling and more, already lowercased without stop words
  modern        modern_emails.jsonl - hand-written 2020s emails (security alerts,       ~320 emails
                OTPs, deploy notices, deliveries, bank alerts ... and the scams that
                imitate them). No public corpus has modern automated mail, which is
                exactly what a Gmail inbox is full of.

The multi corpus is sampled (MULTI_SAMPLE): using all of it pulled the model back towards
2008-era mail (worse on modern emails) and would not fit retraining into the 512 MB of
Render's free plan.

Every email goes through the same preprocessing the server applies to Gmail messages
(preprocessing.py), duplicates are removed (also across sources), and emails that appear
with both labels are dropped. Downloads are cached in .dataset-cache/.
"""
import csv
import email
import gzip
import hashlib
import io
import json
import random
import sys
import tarfile
import urllib.request
from collections import Counter
from email import policy
from pathlib import Path

from classifier import clean_for_model
from preprocessing import clean_text, html_to_text

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".dataset-cache"
OUTPUT = HERE / "email_dataset.csv.gz"
MAX_CHARS = 3000  # long emails are cut to keep the file small; the start of an email carries the signal

SPAMASSASSIN_URL = "https://spamassassin.apache.org/old/publiccorpus/"
SPAMASSASSIN_PARTS = {  # archive -> label (1 = spam)
    "20030228_easy_ham.tar.bz2": 0,
    "20030228_easy_ham_2.tar.bz2": 0,
    "20030228_hard_ham.tar.bz2": 0,
    "20030228_spam.tar.bz2": 1,
    "20030228_spam_2.tar.bz2": 1,
}
PHISHING_URL = "https://huggingface.co/datasets/zefang-liu/phishing-email-dataset/resolve/main/Phishing_Email.csv"
MULTI_URL = "https://huggingface.co/api/datasets/zionia/phishing-emails/parquet/default/{split}/0.parquet"
MULTI_SAMPLE = 15000
MODERN_FILE = HERE / "modern_emails.jsonl"
# The ~320 modern emails are a tiny share of the data, so each one counts this many times in training.
# Chosen on tests/data/modern_test_emails.jsonl (written separately): 1 -> 90%, 5 -> 91%, 15 -> 95% accuracy.
SOURCE_WEIGHT = {"modern": 15}

csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


def download(url, name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print(f"Downloading {url}")
        request = urllib.request.Request(url, headers={"User-Agent": "dataset-builder"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        path.write_bytes(data)
    return path


def as_server_text(subject, body):
    """Mirror services.analyze_content: the model sees "<subject>\\n<cleaned body>"."""
    return f"{(subject or '').strip()}\n{clean_text(body)}".strip()[:MAX_CHARS]


def enron():
    with open(HERE / "spam_ham_dataset.csv", newline="", encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            text = row["text"]
            subject, _, body = text.partition("\n")
            yield as_server_text(subject.removeprefix("Subject:"), body), int(row["label_num"])


def _message_text(message):
    plain, rich = [], []
    for part in message.walk():
        if part.is_multipart() or part.get_filename():
            continue
        kind = part.get_content_type()
        if kind not in ("text/plain", "text/html"):
            continue
        try:
            content = part.get_content()
        except Exception:  # broken charset or encoding - decode by hand
            payload = part.get_payload(decode=True) or b""
            content = payload.decode("latin-1", errors="replace")
        (plain if kind == "text/plain" else rich).append(content)
    if "".join(plain).strip():
        return "\n".join(plain)
    return html_to_text("\n".join(rich))[0]


def spamassassin():
    for archive, label in SPAMASSASSIN_PARTS.items():
        path = download(SPAMASSASSIN_URL + archive, archive)
        with tarfile.open(path, "r:bz2") as tar:
            for member in tar.getmembers():
                if not member.isfile() or member.name.endswith("cmds"):
                    continue
                raw = tar.extractfile(member).read()
                message = email.message_from_bytes(raw, policy=policy.default)
                try:
                    subject = str(message.get("subject", ""))
                except Exception:
                    subject = ""
                yield as_server_text(subject, _message_text(message)), label


def phishing():
    path = download(PHISHING_URL, "Phishing_Email.csv")
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            label = {"Safe Email": 0, "Phishing Email": 1}.get((row.get("Email Type") or "").strip())
            if label is not None:
                yield as_server_text("", row.get("Email Text") or ""), label


def multi():
    try:
        import pyarrow.parquet as pq
    except ImportError:
        raise SystemExit("build_dataset.py needs pyarrow to read the multi corpus: pip install pyarrow")
    rows = []
    for split in ("train", "test"):
        path = download(MULTI_URL.format(split=split), f"zionia_{split}.parquet")
        rows += pq.read_table(path, columns=["text_combined", "label"]).to_pylist()
    random.Random(7).shuffle(rows)
    for row in rows[:MULTI_SAMPLE]:
        yield (row["text_combined"] or "")[:MAX_CHARS], int(row["label"])


def modern():
    with open(MODERN_FILE, encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                item = json.loads(line)
                yield as_server_text(item["subject"], item["body"]), int(item["label"])


SOURCES = (("enron", enron), ("spamassassin", spamassassin), ("phishing", phishing), ("multi", multi),
           ("modern", modern))


def build():
    seen = {}  # fingerprint -> index in rows
    conflicting = set()
    rows = []
    for source, emails in SOURCES:
        for text, label in emails():
            words = clean_for_model(text).split()
            if len(words) < 3:
                continue  # empty or nearly empty after cleaning
            fingerprint = hashlib.sha1(" ".join(words).encode()).hexdigest()
            if fingerprint in seen:
                if rows[seen[fingerprint]][1] != label:
                    conflicting.add(fingerprint)
                continue
            seen[fingerprint] = len(rows)
            rows.append((source, label, text, fingerprint))

    rows = [row for row in rows if row[3] not in conflicting]
    random.Random(42).shuffle(rows)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["source", "label_num", "weight", "text"])
    writer.writerows((source, label, SOURCE_WEIGHT.get(source, 1), text) for source, label, text, _ in rows)
    with gzip.open(OUTPUT, "wt", encoding="utf-8", newline="", compresslevel=9) as handle:
        handle.write(buffer.getvalue())

    counts = Counter((source, label) for source, label, _, _ in rows)
    print(f"Wrote {len(rows)} emails to {OUTPUT.name} ({OUTPUT.stat().st_size / 1e6:.1f} MB); "
          f"dropped {len(conflicting)} emails that appeared as both spam and ham.")
    for source, _ in SOURCES:
        print(f"  {source:<13} ham {counts[(source, 0)]:>6}   spam {counts[(source, 1)]:>6}")


if __name__ == "__main__":
    build()
