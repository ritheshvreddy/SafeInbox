"""Rebuild the base spam model from email_dataset.csv.gz (see build_dataset.py).

Usage (from inside safeinbox-backend):  python TrainModel.py
Writes spam_classifier.pkl and tfidf_vectorizer.pkl next to this file and prints test metrics:
on a held-out 20% of the dataset, and on tests/data/modern_test_emails.jsonl - 120 modern emails
that are never used for training.
Admins can also retrain from the dashboard, which additionally learns from user feedback.
"""
import json
from pathlib import Path

import joblib

from classifier import MODEL_FILE, VECTORIZER_FILE, SpamModel
from training import load_dataset, train

HERE = Path(__file__).resolve().parent
MODERN_TEST = HERE / "tests" / "data" / "modern_test_emails.jsonl"


def modern_test_report(model):
    emails = [json.loads(line) for line in MODERN_TEST.read_text(encoding="utf-8").splitlines() if line.strip()]
    scores = [(model.analyze(f"{e['subject']}\n{e['body']}")["probability"], e["label"]) for e in emails]
    ham = [p for p, label in scores if label == 0]
    spam = [p for p, label in scores if label == 1]
    correct = sum(p < 0.5 for p in ham) + sum(p >= 0.5 for p in spam)
    return {
        "accuracy": round(correct / len(scores), 4),
        "legit_flagged_spam": f"{sum(p >= 0.5 for p in ham)}/{len(ham)}",
        "spam_caught": f"{sum(p >= 0.5 for p in spam)}/{len(spam)}",
    }


if __name__ == "__main__":
    texts, labels, weights = load_dataset(HERE / "email_dataset.csv.gz")
    vectorizer, classifier, metrics = train(texts, labels, weights=weights)
    print("Test metrics (held-out 20% of the dataset):", metrics)
    print("Modern test emails:", modern_test_report(SpamModel(vectorizer, classifier, "new")))
    if metrics["accuracy"] < 0.90:
        raise SystemExit("Accuracy is below the required 90% - model files were NOT overwritten.")
    joblib.dump(classifier, HERE / MODEL_FILE, compress=3)
    joblib.dump(vectorizer, HERE / VECTORIZER_FILE, compress=3)
    print("Model and vectorizer saved.")
