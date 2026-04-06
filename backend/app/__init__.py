"""Application factory for the SDA backend."""

import os

from flask import Flask, jsonify
from flask_cors import CORS

from app.config import config_by_name
from app.extensions import db, jwt, migrate


def create_app(config_name: str | None = None) -> Flask:
    if config_name is None:
        config_name = os.getenv("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_by_name.get(config_name, config_by_name["development"]))

    # ---------- Extensions ----------
    db.init_app(app)
    jwt.init_app(app)
    migrate.init_app(app, db)

    CORS(
        app,
        origins=[app.config["FRONTEND_URL"]],
        supports_credentials=True,
    )

    # ---------- JWT error handlers ----------
    @jwt.unauthorized_loader
    def unauthorized_callback(reason):
        return jsonify({"error": "Missing or invalid token", "detail": reason}), 401

    @jwt.expired_token_loader
    def expired_callback(jwt_header, jwt_payload):
        return jsonify({"error": "Token has expired"}), 401

    @jwt.invalid_token_loader
    def invalid_callback(reason):
        return jsonify({"error": "Invalid token", "detail": reason}), 422

    # ---------- Blueprints ----------
    from app.auth.routes import auth_bp
    from app.store.routes import store_bp
    from app.admin.routes import admin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(store_bp)
    app.register_blueprint(admin_bp)

    # ---------- Health check ----------
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app
