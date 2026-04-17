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
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    default_samesite = "Lax" if debug_mode else "None"
    default_secure = False if debug_mode else True
    app.config["SESSION_COOKIE_SAMESITE"] = os.environ.get("SESSION_COOKIE_SAMESITE", default_samesite)
    app.config["SESSION_COOKIE_SECURE"] = (
        os.environ.get("SESSION_COOKIE_SECURE", str(default_secure)).lower() == "true"
    )

    CORS(
        app,
        # Use bearer-token auth from frontend; keep CORS permissive to avoid preview-domain failures.
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization"],
        resources={
            r"/api/*": {"origins": "*"},
            r"/admin/*": {"origins": "*"},
        },
    )

    @app.after_request
    def _force_cors_headers(response):
        # Hard fallback so browser never blocks API/admin requests due to missing CORS headers.
        if request.path.startswith("/api/") or request.path.startswith("/admin/"):
            origin = request.headers.get("Origin") or "*"
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Vary"] = "Origin"
        return response

    @app.before_request
    def _handle_preflight():
        # Ensure CORS preflight never 404s on API/admin endpoints.
        if request.method == "OPTIONS" and (
            request.path.startswith("/api/") or request.path.startswith("/admin/")
        ):
            return ("", 204)

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


#hello ius
#he
#bhai kya bhua
#hr