"""Summarization Module: extractive summaries with TextRank (sumy + NLTK)."""
import logging
import re
import threading

import nltk
from sumy.nlp.tokenizers import Tokenizer
from sumy.parsers.plaintext import PlaintextParser
from sumy.summarizers.text_rank import TextRankSummarizer
from sumy.utils import get_stop_words

log = logging.getLogger("safeinbox")

MAX_SUMMARY_CHARS = 1500
_tokenizer = None
_tokenizer_lock = threading.Lock()


def ensure_nltk_data():
    """Download the NLTK sentence tokenizer once (Docker images ship with it pre-installed)."""
    try:
        nltk.data.find("tokenizers/punkt")
    except LookupError:
        log.info("Downloading NLTK 'punkt' tokenizer data...")
        nltk.download("punkt", quiet=True)


def _get_tokenizer():
    global _tokenizer
    with _tokenizer_lock:
        if _tokenizer is None:
            _tokenizer = Tokenizer("english")
        return _tokenizer


def _to_sentences_text(text: str) -> str:
    """Join hard-wrapped lines; treat a line without end punctuation (e.g. a heading or bullet) as its own sentence."""
    lines = [line.strip(" \t-*•") for line in text.split("\n")]
    pieces = []
    for line in lines:
        if not line:
            continue
        pieces.append(line if line[-1] in ".!?:;" else line + ".")
    return " ".join(pieces)


def summarize(text: str, sentences: int = 3) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    sentences = max(1, min(int(sentences), 5))
    flat = _to_sentences_text(text)
    parser = PlaintextParser.from_string(flat, _get_tokenizer())
    all_sentences = parser.document.sentences
    if len(all_sentences) <= sentences:
        summary = " ".join(str(s) for s in all_sentences)
    else:
        summarizer = TextRankSummarizer()
        summarizer.stop_words = get_stop_words("english")
        summary = " ".join(str(s) for s in summarizer(parser.document, sentences))
    summary = re.sub(r"\s+", " ", summary).strip()
    if len(summary) > MAX_SUMMARY_CHARS:
        summary = summary[:MAX_SUMMARY_CHARS].rsplit(" ", 1)[0] + "…"
    return summary
