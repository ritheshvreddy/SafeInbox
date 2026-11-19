"""SafeInbox backend (Flask).

Run locally with `python app.py`; in Docker it runs under gunicorn (see wsgi.py).
"""
import logging
import os

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

import db as database
import gmail_client
from auth import ApiError, verify_google_access_token
from classifier import ModelStore
from config import load_config
from encryption import Encryptor
from routes import api
from services import Services
from summarizer import ensure_nltk_data

log = logging.getLogger("safeinbox")


def create_app(overrides=None):
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    app = Flask(__name__)
    app.config.update(load_config(overrides))
    app.config.setdefault("GMAIL_SERVICE_FACTORY", gmail_client.build_service)
    app.config.setdefault("GOOGLE_TOKEN_VERIFIER", verify_google_access_token)

    if not app.config["GOOGLE_CLIENT_ID"]:
        log.warning("GOOGLE_CLIENT_ID is not set - sign-in tokens can't be checked against your app's client ID.")

    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]},
                         r"/check_spam": {"origins": app.config["CORS_ORIGINS"]}})

    ensure_nltk_data()
    db, backend = database.connect(app.config["MONGO_URI"], app.config["MONGO_FALLBACK_TO_MEMORY"])
    database.ensure_indexes(db)
    models = ModelStore(app.config["BASE_MODEL_DIR"], db)
    models.get()  # load now so the first request is fast and a broken model fails at start-up
    app.extensions["safeinbox"] = Services(db=db, db_backend=backend,
                                           encryptor=Encryptor(app.config["DATA_ENCRYPTION_KEY"]), models=models)

    app.register_blueprint(api)

    @app.errorhandler(ApiError)
    def handle_api_error(error):
        return jsonify({"error": error.code, "message": error.message}), error.status

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return jsonify({"error": error.name.lower().replace(" ", "_"), "message": error.description}), error.code

    @app.errorhandler(Exception)
    def handle_unexpected(error):
        log.exception("Unhandled error on %s %s", request.method, request.path)
        return jsonify({"error": "server_error", "message": "Something went wrong on the server."}), 500

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", 5000)),
                    debug=os.getenv("FLASK_DEBUG", "1") == "1")
