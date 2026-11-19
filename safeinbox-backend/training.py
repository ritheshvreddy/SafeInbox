"""Spam model (re)training - runs in a background thread (SRS 3.1 Performance: background processing).

The model is trained on the original dataset plus emails users reported as spam / marked as
not spam. A new model only replaces the current one if it still meets the >90% accuracy
requirement (SRS 6.1) on held-out test emails.
"""
import csv
import logging
import sys
import threading
import traceback
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB

from classifier import clean_for_model

log = logging.getLogger("safeinbox")

JOB_ID = "retrain"
STALE_JOB_AFTER = timedelta(hours=1)


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def load_dataset(path):
    """Read the labelled dataset (columns: text + label_num, or text + label ham/spam)."""
    csv.field_size_limit(min(sys.maxsize, 2**31 - 1))
    texts, labels = [], []
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            text = row.get("text") or ""
            if (row.get("label_num") or "").strip() in {"0", "1"}:
                label = int(row["label_num"])
            else:
                label = 1 if (row.get("label") or "").strip().lower() == "spam" else 0
            if text.strip():
                texts.append(text)
                labels.append(label)
    return texts, labels


def train(texts, labels, feedback_texts=(), feedback_labels=(), feedback_weight=5.0, test_size=0.2, seed=42):
    """Train TF-IDF + Multinomial Naive Bayes. Feedback emails count `feedback_weight` times."""
    cleaned = [clean_for_model(t) for t in texts]
    x_train, x_test, y_train, y_test = train_test_split(
        cleaned, labels, test_size=test_size, random_state=seed, stratify=labels
    )
    feedback_clean = [clean_for_model(t) for t in feedback_texts]
    train_texts = list(x_train) + feedback_clean
    train_labels = list(y_train) + list(feedback_labels)
    weights = [1.0] * len(x_train) + [float(feedback_weight)] * len(feedback_clean)

    vectorizer = TfidfVectorizer(max_features=5000)
    classifier = MultinomialNB()
    classifier.fit(vectorizer.fit_transform(train_texts), train_labels, sample_weight=weights)

    predictions = classifier.predict(vectorizer.transform(x_test))
    metrics = {
        "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
        "precision": round(float(precision_score(y_test, predictions, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, predictions, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, predictions, zero_division=0)), 4),
        "test_emails": len(y_test),
        "training_emails": len(x_train),
        "feedback_emails": len(feedback_clean),
    }
    return vectorizer, classifier, metrics


def start_retraining(db, model_store, encryptor, config, requested_by, synchronous=False):
    """Queue a retraining job. Returns the job document, or None if one is already running."""
    now = utcnow()
    try:
        job = db.jobs.find_one_and_update(
            {"_id": JOB_ID, "$or": [{"status": {"$ne": "running"}}, {"started_at": {"$lt": now - STALE_JOB_AFTER}}]},
            {"$set": {"status": "running", "started_at": now, "finished_at": None, "requested_by": requested_by,
                      "message": "Training started", "metrics": None, "version": None}},
            upsert=True,
            return_document=True,
        )
    except DuplicateKeyError:
        return None  # a job is already running

    args = (db, model_store, encryptor, config)
    if synchronous:
        _run(*args)
    else:
        threading.Thread(target=_run, args=args, name="safeinbox-retrain", daemon=True).start()
    return job


def _run(db, model_store, encryptor, config):
    try:
        texts, labels = load_dataset(config["DATASET_PATH"])
        feedback_texts, feedback_labels = [], []
        for item in db.feedback.find({}, {"text_enc": 1, "label": 1}):
            try:
                feedback_texts.append(encryptor.decrypt(item["text_enc"]))
                feedback_labels.append(int(item["label"]))
            except Exception:  # unreadable entry (e.g. encrypted with an old key) - skip it
                continue

        vectorizer, classifier, metrics = train(
            texts, labels, feedback_texts, feedback_labels, feedback_weight=config["FEEDBACK_WEIGHT"]
        )
        minimum = config["MIN_RETRAIN_ACCURACY"]
        if metrics["accuracy"] < minimum:
            _finish(db, "rejected", f"New model reached {metrics['accuracy']:.1%} accuracy, below the "
                                    f"required {minimum:.0%} - the current model was kept.", metrics)
            return

        version = "v" + utcnow().strftime("%Y%m%d-%H%M%S")
        model_store.save_and_activate(vectorizer, classifier, version, metrics)
        _finish(db, "succeeded", f"Model {version} is now active ({metrics['accuracy']:.1%} accuracy, "
                                 f"{metrics['feedback_emails']} user-labelled emails).", metrics, version)
        log.info("Retraining finished: %s", version)
    except Exception as exc:  # report the failure instead of losing it in a background thread
        log.error("Retraining failed: %s\n%s", exc, traceback.format_exc())
        _finish(db, "failed", f"Retraining failed: {exc}")


def _finish(db, status, message, metrics=None, version=None):
    db.jobs.update_one(
        {"_id": JOB_ID},
        {"$set": {"status": status, "message": message, "metrics": metrics, "version": version, "finished_at": utcnow()}},
    )
