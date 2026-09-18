# Multi-stage build: the builder resolves wheels (including psycopg's binary),
# and the runtime image ships only the installed site-packages.
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt

FROM python:3.12-slim AS runtime

# libgeos/libproj are runtime dependencies of Shapely's C extension.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgeos-c1v5 libproj25 curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/install/bin:$PATH" \
    PYTHONPATH="/app"

WORKDIR /app
COPY --from=builder /install /install
COPY alembic.ini pyproject.toml ./
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

# Migrations run on every boot: a fresh Railway/Neon database is therefore
# self-initialising, and a redeploy never leaves the schema behind the code.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
