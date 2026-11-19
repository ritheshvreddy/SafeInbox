# ---------- base: dependencies + NLTK data ----------
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    NLTK_DATA=/usr/share/nltk_data

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && python -c "import nltk; nltk.download('punkt', download_dir='/usr/share/nltk_data', quiet=True)"

COPY . .

# ---------- test: runs the test suite during the build (used by Jenkins) ----------
FROM base AS test
RUN pip install --no-cache-dir -r requirements-dev.txt \
 && python -m pytest -q

# ---------- runtime: production image ----------
FROM base AS runtime
RUN useradd --create-home --uid 10001 appuser \
 && mkdir -p /app/instance \
 && chown -R appuser:appuser /app/instance
USER appuser

# PORT and WEB_CONCURRENCY can be set by the hosting platform (Render sets PORT; use 1 worker on 512 MB plans).
ENV PORT=5000 \
    WEB_CONCURRENCY=2
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=4)"

CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT} --workers ${WEB_CONCURRENCY} --threads 4 --timeout 120 --access-logfile - wsgi:app"]
