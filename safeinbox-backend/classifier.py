"""Spam Classification Module: TF-IDF + Naive Bayes, with per-word explanations.

The active model can be replaced at runtime by a retrained one (see training.py). Every
process checks the model pointer file, so all server workers pick up a new model.
"""
import json
import logging
import os
import re
import string
import threading
from pathlib import Path

import joblib
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
        # log P(word | spam) - log P(word | not spam): positive means the word points towards spam.
        self._word_weight = classifier.feature_log_prob_[self._spam_index] - classifier.feature_log_prob_[ham_index]

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


class ModelStore:
    """Loads the active model and hot-swaps it when a retrained model is activated."""

    def __init__(self, base_dir, model_dir):
        self.base_dir = Path(base_dir)
        self.model_dir = Path(model_dir)
        self.pointer = self.model_dir / "current.json"
        self._lock = threading.Lock()
        self._model = None
        self._pointer_mtime = "unset"

    def _pointer_state(self):
        try:
            return self.pointer.stat().st_mtime_ns
        except FileNotFoundError:
            return None

    def _load(self):
        if self.pointer.exists():
            info = json.loads(self.pointer.read_text(encoding="utf-8"))
            folder = self.model_dir / info["version"]
            model = SpamModel(
                joblib.load(folder / VECTORIZER_FILE), joblib.load(folder / MODEL_FILE), info["version"], info.get("metrics")
            )
            log.info("Loaded retrained spam model %s", model.version)
            return model
        return SpamModel(joblib.load(self.base_dir / VECTORIZER_FILE), joblib.load(self.base_dir / MODEL_FILE), BASE_VERSION)

    def get(self) -> SpamModel:
        state = self._pointer_state()
        with self._lock:
            if self._model is None or state != self._pointer_mtime:
                try:
                    self._model = self._load()
                except Exception:
                    if self._model is None:
                        raise
                    log.exception("Could not load the new model - keeping %s", self._model.version)
                self._pointer_mtime = state
            return self._model

    def save_and_activate(self, vectorizer, classifier, version, metrics):
        folder = self.model_dir / version
        folder.mkdir(parents=True, exist_ok=True)
        joblib.dump(vectorizer, folder / VECTORIZER_FILE)
        joblib.dump(classifier, folder / MODEL_FILE)
        temp = self.pointer.with_suffix(".tmp")
        temp.write_text(json.dumps({"version": version, "metrics": metrics}), encoding="utf-8")
        os.replace(temp, self.pointer)

    def reset_to_base(self):
        self.pointer.unlink(missing_ok=True)
