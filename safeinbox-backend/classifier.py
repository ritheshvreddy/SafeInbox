"""Spam Classification Module: TF-IDF + a linear classifier, with per-word explanations.

New models use logistic regression (see training.py). Older Naive Bayes models, which may still
be stored in MongoDB, keep working.

The active model can be replaced at runtime by a retrained one (see training.py). Retrained
models live in MongoDB, so every server process picks up a new model.
"""
import io
import logging
import re
import string
import threading
import time
from pathlib import Path

import joblib
from bson.binary import Binary
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

log = logging.getLogger("safeinbox")

BASE_VERSION = "base"
MODEL_FILE = "spam_classifier.pkl"
VECTORIZER_FILE = "tfidf_vectorizer.pkl"

_DIGITS_RE = re.compile(r"\d+")
_PUNCTUATION_TABLE = str.maketrans({ch: " " for ch in string.punctuation})


def clean_for_model(text: str) -> str:
    """Same cleaning the model was trained with: lowercase, no digits, no punctuation, no stop words."""
    text = _DIGITS_RE.sub(" ", (text or "").lower()).translate(_PUNCTUATION_TABLE)
    return " ".join(word for word in text.split() if word not in ENGLISH_STOP_WORDS)


class SpamModel:
    def __init__(self, vectorizer, classifier, version, metrics=None):
        self.vectorizer = vectorizer
        self.classifier = classifier
        self.version = version
        self.metrics = metrics
        classes = list(classifier.classes_)
        self._spam_index = classes.index(1)
        ham_index = classes.index(0)
        self._feature_names = vectorizer.get_feature_names_out()
        # Per-word weight: positive means the word points towards spam.
        if hasattr(classifier, "feature_log_prob_"):  # Naive Bayes: log P(word | spam) - log P(word | not spam)
            self._word_weight = classifier.feature_log_prob_[self._spam_index] - classifier.feature_log_prob_[ham_index]
        else:  # logistic regression: the coefficient pushes towards classes_[1]
            self._word_weight = classifier.coef_[0] if self._spam_index == 1 else -classifier.coef_[0]

    def analyze(self, text: str, top_n: int = 5) -> dict:
        vector = self.vectorizer.transform([clean_for_model(text)])
        probability = float(self.classifier.predict_proba(vector)[0][self._spam_index])

        row = vector.tocoo()
        contributions = [
            (str(self._feature_names[j]), float(value * self._word_weight[j])) for j, value in zip(row.col, row.data)
        ]
        spam_words = [w for w, c in sorted(contributions, key=lambda item: -item[1]) if c > 0][:top_n]
        ham_words = [w for w, c in sorted(contributions, key=lambda item: item[1]) if c < 0][:top_n]
        return {
            "probability": probability,
            "spam_words": spam_words,
            "ham_words": ham_words,
            "known_words": int(len(row.col)),
        }


def _dumps(obj) -> bytes:
    buffer = io.BytesIO()
    joblib.dump(obj, buffer, compress=3)
    return buffer.getvalue()


def _loads(data: bytes):
    return joblib.load(io.BytesIO(bytes(data)))


class ModelStore:
    """Loads the active model and hot-swaps it when a retrained model is activated.

    Retrained models are stored in MongoDB (collection `models`, pointer in `settings`), so they
    survive restarts on hosts without a permanent disk (e.g. Render) and every server worker
    switches to a new model within CHECK_INTERVAL seconds.
    """

    CHECK_INTERVAL = 10  # seconds between checks for a newly activated model
    KEEP_MODELS = 3

    def __init__(self, base_dir, db):
        self.base_dir = Path(base_dir)
        self.db = db
        self._lock = threading.Lock()
        self._model = None
        self._base = None
        self._checked_at = 0.0

    def _base_model(self):
        if self._base is None:
            self._base = SpamModel(joblib.load(self.base_dir / VECTORIZER_FILE),
                                   joblib.load(self.base_dir / MODEL_FILE), BASE_VERSION)
        return self._base

    def _active_version(self):
        pointer = self.db.settings.find_one({"_id": "active_model"})
        return pointer["version"] if pointer else BASE_VERSION

    def _load(self, version):
        if version == BASE_VERSION:
            return self._base_model()
        doc = self.db.models.find_one({"_id": version})
        if not doc:
            log.error("Active model %s is missing from the database - using the base model", version)
            return self._base_model()
        model = SpamModel(_loads(doc["vectorizer"]), _loads(doc["classifier"]), version, doc.get("metrics"))
        log.info("Loaded retrained spam model %s", version)
        return model

    def get(self) -> SpamModel:
        with self._lock:
            now = time.monotonic()
            if self._model is None or now - self._checked_at >= self.CHECK_INTERVAL:
                self._checked_at = now
                try:
                    version = self._active_version()
                    if self._model is None or self._model.version != version:
                        self._model = self._load(version)
                except Exception:
                    if self._model is None:
                        raise
                    log.exception("Could not check for a new model - keeping %s", self._model.version)
            return self._model

    def save_and_activate(self, vectorizer, classifier, version, metrics):
        self.db.models.insert_one({
            "_id": version, "vectorizer": Binary(_dumps(vectorizer)), "classifier": Binary(_dumps(classifier)),
            "metrics": metrics, "created_at": time.time(),
        })
        self.db.settings.update_one({"_id": "active_model"}, {"$set": {"version": version}}, upsert=True)
        # Keep only the newest few retrained models.
        old = [d["_id"] for d in self.db.models.find({}, {"_id": 1}).sort("created_at", -1).skip(self.KEEP_MODELS)]
        if old:
            self.db.models.delete_many({"_id": {"$in": old}})
        with self._lock:
            self._model = SpamModel(vectorizer, classifier, version, metrics)
            self._checked_at = time.monotonic()

    def reset_to_base(self):
        self.db.settings.delete_one({"_id": "active_model"})
        with self._lock:
            self._model = self._base_model()
            self._checked_at = time.monotonic()
