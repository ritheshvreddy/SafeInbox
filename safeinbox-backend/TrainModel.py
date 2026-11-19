"""Rebuild the base spam model from spam_ham_dataset.csv.

Usage (from inside safeinbox-backend):  python TrainModel.py
Writes spam_classifier.pkl and tfidf_vectorizer.pkl next to this file and prints test metrics.
Admins can also retrain from the dashboard, which additionally learns from user feedback.
"""
from pathlib import Path

import joblib

from classifier import MODEL_FILE, VECTORIZER_FILE
from training import load_dataset, train

HERE = Path(__file__).resolve().parent

if __name__ == "__main__":
    texts, labels = load_dataset(HERE / "spam_ham_dataset.csv")
    vectorizer, classifier, metrics = train(texts, labels)
    print("Test metrics:", metrics)
    if metrics["accuracy"] < 0.90:
        raise SystemExit("Accuracy is below the required 90% - model files were NOT overwritten.")
    joblib.dump(classifier, HERE / MODEL_FILE)
    joblib.dump(vectorizer, HERE / VECTORIZER_FILE)
    print("Model and vectorizer saved.")
