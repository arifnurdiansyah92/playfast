#!/usr/bin/env python3
"""Entry point for the SDA backend API server."""

import os
import sys

# Ensure both the backend directory AND the project root are on the Python path.
# - backend_dir: so that `steam_guard` and `steam_client` can be imported directly
# - project_root: so that `from backend.steam_guard import ...` inside steam_client.py resolves
backend_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(backend_dir)
for p in [backend_dir, project_root]:
    if p not in sys.path:
        sys.path.insert(0, p)

from dotenv import load_dotenv

load_dotenv(os.path.join(backend_dir, ".env"))

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=app.config.get("DEBUG", True))
