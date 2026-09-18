# Multi-stage build: the builder installs every dependency into a virtualenv
# and the runtime image ships only that venv plus the application code.
# A venv (not `pip install --prefix=/install`) is essential: console scripts
# created inside a venv carry the shebang `#!/opt/venv/bin/python`, so in the
# runtime stage `alembic` and `uvicorn` resolve their own site-packages.
# With the old --prefix approach the scripts ran under the system interpreter,
# which never saw the prefixed site-packages and crashed with
# `ModuleNotFoundError: No module named 'alembic.config'`.
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build
COPY requirements.txt .
RUN pip install -r requirements.txt

FROM python:3.12-slim AS runtime

# curl is for the container HEALTHCHECK. GEOS and PROJ are NOT installed here:
# Shapely's manylinux wheel bundles its own libgeos/libgeos_c, and the old
# libgeos-c1v5 package name no longer exists on current Debian base images, which
# made this line a hard build failure.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    PYTHONPATH="/app"

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY alembic.ini pyproject.toml ./
COPY alembic ./alembic
COPY app ./app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

# Migrations run on every boot: a fresh Railway/Neon database is therefore
# self-initialising, and a redeploy never leaves the schema behind the code.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
