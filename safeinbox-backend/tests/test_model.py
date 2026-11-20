"""Quality checks for the shipped spam model (spam_classifier.pkl + tfidf_vectorizer.pkl).

tests/data/modern_test_emails.jsonl holds 120 modern emails (70 legitimate, 50 spam/phishing)
that are never used for training - see build_dataset.py. The old Enron-only model scored 63%
here and flagged 30 of the 70 legitimate emails as spam.
"""
import json
from pathlib import Path

import joblib
import pytest

from classifier import MODEL_FILE, VECTORIZER_FILE, SpamModel

ROOT = Path(__file__).resolve().parents[1]
EMAILS = [json.loads(line) for line in (ROOT / "tests" / "data" / "modern_test_emails.jsonl")
          .read_text(encoding="utf-8").splitlines() if line.strip()]


@pytest.fixture(scope="module")
def scored():
    model = SpamModel(joblib.load(ROOT / VECTORIZER_FILE), joblib.load(ROOT / MODEL_FILE), "base")
    return [(model.analyze(f"{e['subject']}\n{e['body']}"), e["label"]) for e in EMAILS]


def test_model_handles_modern_emails(scored):
    correct = sum((result["probability"] >= 0.5) == bool(label) for result, label in scored)
    legit_flagged = sum(result["probability"] >= 0.5 for result, label in scored if label == 0)
    assert correct / len(scored) >= 0.90
    assert legit_flagged <= 7  # of 70


def test_older_naive_bayes_models_still_work():
    """Models retrained before the switch to logistic regression may still be active in MongoDB."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.naive_bayes import MultinomialNB

    texts = ["win free prize cash now", "claim free money prize", "meeting agenda tomorrow", "project report review"]
    vectorizer = TfidfVectorizer()
    classifier = MultinomialNB().fit(vectorizer.fit_transform(texts), [1, 1, 0, 0])
    result = SpamModel(vectorizer, classifier, "v-old").analyze("free prize for the meeting")
    assert "prize" in result["spam_words"] and "meeting" in result["ham_words"]


def test_model_explains_its_decisions(scored):
    spam_results = [result for result, label in scored if label == 1 and result["probability"] >= 0.5]
    assert all(result["spam_words"] for result in spam_results)
    assert all(result["known_words"] > 0 for result, _ in scored)
