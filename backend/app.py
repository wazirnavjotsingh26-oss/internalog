"""
app.py - Flask application factory.
Serves React SPA (dist/) for all non-API routes.
"""

from dotenv import load_dotenv, find_dotenv
import os

_root_env = find_dotenv(usecwd=True)
if _root_env:
    load_dotenv(_root_env, override=False)

# Also load `backend/.env` when running from repo root or elsewhere.
_backend_env = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_backend_env):
    load_dotenv(_backend_env, override=False)

from flask import Flask, send_from_directory, request
from flask_cors import CORS

try:
    from backend.db import init_db
    from backend.routes import register_routes
except ImportError:  # pragma: no cover
    # Allow running as a script: `python backend/app.py`
    from db import init_db
    from routes import register_routes


def create_app():
    # Serve React build from frontend/dist
    dist_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

    app = Flask(
        __name__,
        static_folder=dist_path,
        static_url_path=''
    )
    app.secret_key = os.environ.get('SECRET_KEY', 'cemetery-dev-secret-change-in-prod')

    # Cookie settings required when frontend and backend are on different domains (Vercel ↔ Render).
    # In production (HTTPS), cookies must be Secure + SameSite=None to be sent cross-site.
    app.config.setdefault("SESSION_COOKIE_SAMESITE", os.environ.get("SESSION_COOKIE_SAMESITE", "Lax"))
    app.config.setdefault("SESSION_COOKIE_SECURE", os.environ.get("SESSION_COOKIE_SECURE", "").lower() == "true")

    configured_origins = [origin.strip() for origin in os.environ.get("FRONTEND_ORIGIN", "").split(",") if origin.strip()]
    if not configured_origins:
        # Safe defaults: local dev + any Vercel deployment domain.
        configured_origins = [
            "http://localhost:5173",
            "http://localhost:3000",
            r"https://.*\.vercel\.app",
        ]

    CORS(
        app,
        supports_credentials=True,
        resources={
            r"/api/*": {"origins": configured_origins},
            r"/admin/*": {"origins": configured_origins},
        },
    )

    try:
        init_db(app)
    except Exception as e:
        print(f"[WARN] DB init failed: {e}")

    register_routes(app)

    try:
        from backend.db import DatabaseNotReadyError

        @app.errorhandler(DatabaseNotReadyError)
        def _db_not_ready(err):
            # Keep API behavior predictable when Mongo isn't configured/available.
            if (getattr(request, "path", "") or "").startswith("/api/"):
                return {"error": str(err)}, 503
            return str(err), 503

    except Exception:
        # If db module import fails, don't block app startup.
        pass

    # Catch-all: serve React index.html for any non-API route
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path):

    # 🔥 VERY IMPORTANT: skip API routes
        if path.startswith("api"):
            return {"error": "API route not found"}, 404

    # serve static files if exist
        full = os.path.join(dist_path, path)
        if path and os.path.exists(full):
            return send_from_directory(dist_path, path)

    # otherwise serve React app
        return send_from_directory(dist_path, 'index.html')

    return app


if __name__ == '__main__':
    app = create_app()
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    print(f"\n[CemeteryBase] Running at http://localhost:{port}")
    print(f"   Admin dashboard: http://localhost:{port}/admin")
    print(f"   API:             http://localhost:{port}/api/cemeteries\n")
    app.run(debug=debug, port=port)
