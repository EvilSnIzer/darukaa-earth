#!/usr/bin/env bash
# One-shot local setup: create the database, install dependencies, migrate,
# seed demo data, and print the URLs.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Checking prerequisites..."
for tool in python3 npm psql; do
  command -v "$tool" >/dev/null || { echo "$tool is required but not installed." >&2; exit 1; }
done

DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://darukaa:darukaa@localhost:5432/darukaa}"
DB_NAME="$(echo "$DATABASE_URL" | sed -E 's#.*/([^/?]+).*#\1#')"

echo "==> Ensuring database '$DB_NAME' exists with PostGIS..."
if ! psql -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  createdb "$DB_NAME" && echo "    created $DB_NAME"
fi
psql -d "$DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS postgis;" >/dev/null

echo "==> Writing backend/.env from the example (if missing)..."
[ -f backend/.env ] || cp backend/.env.example backend/.env

echo "==> Setting up the Python virtualenv..."
python3 -m venv backend/.venv
backend/.venv/bin/pip install --quiet --upgrade pip
backend/.venv/bin/pip install --quiet -r backend/requirements-dev.txt

echo "==> Applying migrations..."
(cd backend && .venv/bin/alembic upgrade head)

echo "==> Seeding demo data..."
(cd backend && .venv/bin/python -m app.services.seed)

echo "==> Installing frontend dependencies..."
npm --prefix frontend install --no-audit --no-fund

cat <<'TEXT'

Done. Start the two processes:

  (cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000)
  npm --prefix frontend run dev

Then open http://localhost:5173 and sign in with:

  admin@darukaa.earth / Admin@12345

TEXT
