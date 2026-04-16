FROM python:3.11-slim

WORKDIR /app

# Install Node (for building frontend)
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/frontend
RUN npm ci && npm run build

WORKDIR /app

EXPOSE 5000

# Production: run with gunicorn (4 workers)
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "120", "backend.wsgi:app"]
