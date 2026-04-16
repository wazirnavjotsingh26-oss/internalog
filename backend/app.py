"""
app.py - Flask application factory.
Serves React SPA (dist/) for all non-API routes.
"""

from dotenv import load_dotenv
import os

load_dotenv()

from flask import Flask, send_from_directory
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
    CORS(app, supports_credentials=True)

    try:
        init_db(app)
    except Exception as e:
        print(f"[WARN] DB init failed: {e}")

    register_routes(app)

    # Catch-all: serve React index.html for any non-API route
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_react(path):
        # Check if the file exists in dist (JS, CSS, assets)
        full = os.path.join(dist_path, path)
        if path and os.path.exists(full):
            return send_from_directory(dist_path, path)
        # Otherwise serve index.html (React Router handles it)
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
