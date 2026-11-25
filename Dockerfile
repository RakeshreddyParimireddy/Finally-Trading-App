# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build the Next.js static export (frontend/out)
# ---------------------------------------------------------------------------
FROM node:20-slim AS frontend

WORKDIR /frontend
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first (cached unless the lockfile changes)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build the static export
COPY frontend/ ./
RUN npm run build && test -f out/index.html

# ---------------------------------------------------------------------------
# Stage 2: Python runtime (FastAPI + uvicorn), managed by uv
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

# Install third-party dependencies first (cached unless pyproject/uv.lock change)
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy the application and install the project itself
COPY backend/ ./
RUN uv sync --frozen --no-dev

# Static frontend served by FastAPI
COPY --from=frontend /frontend/out /app/static

# Runtime configuration (see planning/API_CONTRACT.md §3)
ENV PATH="/app/.venv/bin:$PATH" \
    FINALLY_DB_PATH=/app/db/finally.db \
    FINALLY_STATIC_DIR=/app/static

RUN mkdir -p /app/db
VOLUME ["/app/db"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
