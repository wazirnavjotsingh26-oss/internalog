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
from werkzeug.exceptions import HTTPException

try:
    from backend.db import init_db
    from backend.routes import register_routes
except ImportError:  # pragma: no cover
    # Allow running as a script: `python backend/app.py`
    from db import init_db
    from routes import register_routes


def _parse_allowed_origins(raw_value):
    return [origin.strip() for origin in (raw_value or "").split(",") if origin.strip()]


def create_app():
    # Serve React build from frontend/dist
    dist_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')

    # Keep Flask static routing disabled so React client routes
    # (e.g. `/admin`, `/admin/login`) always fall through to SPA catch-all.
    app = Flask(__name__)
    app.secret_key = os.environ.get('SECRET_KEY', 'cemetery-dev-secret-change-in-prod')
    app.config["IS_PRODUCTION"] = os.environ.get("APP_ENV", "").lower() == "production"

    # Cookie settings required when frontend and backend are on different domains (Vercel ↔ Render).
    # In production (HTTPS), cookies must be Secure + SameSite=None to be sent cross-site.
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    default_samesite = "Lax" if debug_mode else "None"
    default_secure = False if debug_mode else True
    app.config["SESSION_COOKIE_SAMESITE"] = os.environ.get("SESSION_COOKIE_SAMESITE", default_samesite)
    app.config["SESSION_COOKIE_SECURE"] = (
        os.environ.get("SESSION_COOKIE_SECURE", str(default_secure)).lower() == "true"
    )
    app.config["SESSION_COOKIE_HTTPONLY"] = True

    if app.config["IS_PRODUCTION"]:
        if app.secret_key in {"", "cemetery-dev-secret-change-in-prod"}:
            raise RuntimeError("SECRET_KEY must be set to a strong value in production.")
        if app.config["SESSION_COOKIE_SAMESITE"] != "None":
            app.logger.warning("SESSION_COOKIE_SAMESITE should be 'None' in production for cross-site admin login.")
        if not app.config["SESSION_COOKIE_SECURE"]:
            app.logger.warning("SESSION_COOKIE_SECURE should be true in production.")

    allowed_origins = _parse_allowed_origins(
        os.environ.get("FRONTEND_ORIGIN") or os.environ.get("CORS_ALLOWED_ORIGINS")
    )
    allow_all_origins = not app.config["IS_PRODUCTION"] and not allowed_origins
    cors_origins = "*" if allow_all_origins else allowed_origins

    if app.config["IS_PRODUCTION"] and not allowed_origins:
        app.logger.warning(
            "FRONTEND_ORIGIN or CORS_ALLOWED_ORIGINS is unset. "
            "Browsers calling this API from another domain (e.g. direct Render URL) will fail CORS."
        )

    CORS(
        app,
        # Production uses explicit allowlist; local dev stays permissive.
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization"],
        resources={
            r"/api/*": {"origins": cors_origins},
            r"/admin/*": {"origins": cors_origins},
        },
    )

    @app.after_request
    def _force_cors_headers(response):
        # Hard fallback so browser never blocks API/admin requests due to missing CORS headers.
        if request.path.startswith("/api/") or request.path.startswith("/admin/"):
            origin = request.headers.get("Origin")
            if allow_all_origins:
                if origin:
                    response.headers["Access-Control-Allow-Origin"] = origin
                    response.headers["Access-Control-Allow-Credentials"] = "true"
                else:
                    response.headers["Access-Control-Allow-Origin"] = "*"
            elif origin and origin in allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
            response.headers["Vary"] = "Origin"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    @app.before_request
    def _handle_preflight():
        # Ensure CORS preflight never 404s on API/admin endpoints.
        if request.method == "OPTIONS" and (
            request.path.startswith("/api/") or request.path.startswith("/admin/")
        ):
            return ("", 204)
        # `/admin/login` is a React route; serve SPA index for direct browser hits.
        if request.method == "GET" and request.path == "/admin/login":
            return send_from_directory(dist_path, "index.html")

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

    @app.errorhandler(Exception)
    def _api_json_error(err):
        path = (getattr(request, "path", "") or "")

        # Preserve HTTP status codes (404/405/etc.) instead of converting to 500.
        if isinstance(err, HTTPException):
            if path.startswith("/api/") or path.startswith("/admin/"):
                return {"error": err.description or err.name}, err.code
            return err

        # Never return HTML for API/admin failures; frontend expects JSON.
        if path.startswith("/api/") or path.startswith("/admin/"):
            app.logger.exception("Unhandled API/admin error")
            return {"error": str(err) or "Internal server error"}, 500
        raise err

    # Catch-all: serve React index.html for any non-API route
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path):

        # Skip API route namespace from SPA fallback.
        if path == "api" or path.startswith("api/"):
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
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    print(f"\n[CemeteryBase] Running at http://localhost:{port}")
    print(f"   Admin dashboard: http://localhost:{port}/admin")
    print(f"   API:             http://localhost:{port}/api/cemeteries\n")
    app.run(debug=debug, port=port)