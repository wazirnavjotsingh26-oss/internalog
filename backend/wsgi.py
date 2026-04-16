"""
WSGI entrypoint for production servers (e.g., gunicorn).
"""

from backend.app import create_app

app = create_app()

