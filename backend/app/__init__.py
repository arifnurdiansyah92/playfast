"""Application factory for the Playfast backend."""

import logging
import os

from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import text

from app.config import config_by_name
from app.extensions import db, jwt, migrate

logger = logging.getLogger(__name__)


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

    # ---------- Generic HTTP error handlers ----------
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": e.description or "Bad request"}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(429)
    def too_many_requests(e):
        return jsonify({"error": "Too many requests"}), 429

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error"}), 500

    # ---------- Blueprints ----------
    from app.auth.routes import auth_bp
    from app.store.routes import store_bp
    from app.admin.routes import admin_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(store_bp)
    app.register_blueprint(admin_bp)

    # ---------- Health check with DB connectivity ----------
    @app.route("/api/health")
    def health():
        db_ok = False
        try:
            db.session.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            pass
        status = "ok" if db_ok else "degraded"
        code = 200 if db_ok else 503
        return jsonify({
            "status": status,
            "database": "connected" if db_ok else "unreachable",
        }), code

    # ---------- Schema migrations (add new columns if missing) ----------
    with app.app_context():
        _run_schema_upgrades()

    return app


def _run_schema_upgrades():
    """Add new columns to existing tables via raw SQL.
    Each statement is wrapped in try/except so it is safe to run repeatedly
    (the ALTER TABLE will fail harmlessly if the column already exists).
    """
    alter_statements = [
        "ALTER TABLE games ADD COLUMN description TEXT",
        "ALTER TABLE games ADD COLUMN header_image VARCHAR(500)",
        "ALTER TABLE games ADD COLUMN genres VARCHAR(500)",
        "ALTER TABLE games ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    for stmt in alter_statements:
        try:
            db.session.execute(text(stmt))
            db.session.commit()
        except Exception:
            db.session.rollback()
