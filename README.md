# Darukaa.Earth — Geospatial Analytics for Carbon & Biodiversity Projects

A full-stack platform for managing nature-based climate projects. Administrators create
projects, **draw site boundaries as polygons on a map**, and drill into per-site and
per-project performance over time.

Built for the Darukaa.Earth Full-Stack Developer Hackathon.

| Layer    | Technology                                                                |
| -------- | ------------------------------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, Mapbox GL JS + mapbox-gl-draw, Chart.js       |
| Backend  | Python 3.12, FastAPI, SQLAlchemy 2.0, GeoAlchemy2, Alembic, PyJWT, bcrypt |
| Database | PostgreSQL 17 + **PostGIS 3.5**                                           |
| Auth     | JWT access + refresh tokens, role-based authorisation                     |
| CI/CD    | GitHub Actions → Vercel (frontend), Railway (API), Neon (PostGIS)         |
| DX       | Husky + lint-staged + Prettier + ESLint + Ruff + mypy                     |

---

## Table of contents

1. [Quick start](#quick-start)
2. [High-level architecture](#high-level-architecture)
3. [Database schema](#database-schema)
4. [API surface](#api-surface)
5. [Datasets and why they were chosen](#datasets-and-why-they-were-chosen)
6. [CI/CD pipeline](#cicd-pipeline)
7. [Code quality enforcement](#code-quality-enforcement)
8. [Deployment](#deployment)
9. [Trade-offs](#trade-offs)
10. [Project layout](#project-layout)
11. [Testing](#testing)

---

## Quick start

### Option A — one command

Requires `python3`, `npm` and a local PostgreSQL with PostGIS (`psql` on PATH).

```bash
./scripts/bootstrap.sh
```

This creates the database, installs dependencies, applies migrations, seeds demo data
and installs the frontend packages.

### Option B — Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

| Service      | URL                                 |
| ------------ | ----------------------------------- |
| Dashboard    | http://localhost:5173               |
| API docs     | http://localhost:8000/docs          |
| Health check | http://localhost:8000/api/v1/health |

### Option C — manual

```bash
# 1. Database
createdb darukaa
psql -d darukaa -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 2. Backend
cd backend
cp .env.example .env          # then set a real SECRET_KEY
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
python -m app.services.seed   # demo data
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local    # optional: add VITE_MAPBOX_TOKEN
npm install
npm run dev
```

### Demo credentials

```
admin@darukaa.earth / Admin@12345
```

The seeder creates this administrator, 3 projects, 8 sites in the Gangetic plain and
288 monthly observations spanning 36 months.

> **Mapbox token.** Set `VITE_MAPBOX_TOKEN` in `frontend/.env.local` for the satellite
> basemap. Without a token the app falls back to a built-in SVG projection, so the
> drawing workflow and every dashboard still work — see
> [Trade-offs](#trade-offs).

---

## High-level architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                             │
│  React 18 + TypeScript (Vite)                                        │
│  ├─ TanStack Query — server state, caching, invalidation             │
│  ├─ Mapbox GL JS + mapbox-gl-draw — basemap, polygon drawing         │
│  │    └─ SVG fallback renderer when no token is configured           │
│  ├─ Chart.js (line / bar / doughnut) — analytics                     │
│  └─ React Router — /, /projects, /projects/:id, /sites/:id, /map     │
└───────────────┬──────────────────────────────────────────────────────┘
                │  HTTPS, JSON.  Only relative URLs (/api/v1/...) so the
                │  same bundle runs behind any proxy without CORS changes.
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FastAPI (async framework, sync SQLAlchemy handlers in a threadpool) │
│  ├─ core/      settings, JWT + bcrypt security, dependencies, orjson │
│  ├─ api/v1/    auth · projects · sites · observations · analytics    │
│  ├─ services/  geo (validation, geodesic area) · analytics · seed    │
│  ├─ schemas/   Pydantic v2 request/response contracts                │
│  └─ models/    SQLAlchemy 2.0 ORM + GeoAlchemy2 geometry column      │
└───────────────┬──────────────────────────────────────────────────────┘
                │  psycopg 3
                ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PostgreSQL 17 + PostGIS 3.5                                         │
│  users → projects → sites (MULTIPOLYGON 4326, GiST index)            │
│                        └─→ observations (site_id, measured_on unique)│
└──────────────────────────────────────────────────────────────────────┘
```

### Design decisions that shape the code

**Geometry validation happens twice, deliberately.** Shapely validates and repairs
incoming GeoJSON in Python (so a hand-drawn self-intersecting polygon becomes a valid
`MultiPolygon` instead of a 500), and PostGIS enforces the column type on write. The
Python layer produces actionable error messages; the database is the source of truth.

**Area and centroid are computed by PostGIS at write time** and stored as columns:

```sql
ROUND((ST_Area(geog) / 10000.0)::numeric, 4)  AS area_ha,
ST_Y(ST_Centroid(geom)::geometry(Point, 4326)) AS lat
```

Using the `geography` type makes the area a true geodesic measurement. On a real drawn
parcel this returned **2,133.52 ha** where a naive planar degree-squared conversion gave
2,143.90 ha — a 0.5 % error that compounds across a portfolio. Storing the result means
map and list views never re-run geodesic maths, and the number a user sees always matches
the number SQL aggregates over.

**Heavy aggregation lives in SQL.** Project and portfolio rollups use `GROUP BY`,
`date_trunc`, `COALESCE` and `DISTINCT ON`, so the Python layer only reshapes rows into
chart-ready arrays. Response size stays flat as observation volume grows.

**The browser only ever uses relative URLs.** In development Vite proxies `/api` to the
backend; in production the frontend and API share an origin (or `VITE_API_BASE_URL` is
set). No hardcoded hosts in client code, so the same bundle works behind preview proxies,
Vercel, and local dev.

---

## Database schema

```
users
  id              UUID PK
  email           VARCHAR(320)  UNIQUE, indexed
  full_name       VARCHAR(255)
  hashed_password VARCHAR(255)            -- bcrypt, never plaintext
  role            ENUM user_role          -- admin | viewer
  is_active       BOOLEAN
  created_at / updated_at  TIMESTAMPTZ

projects
  id              UUID PK
  name            VARCHAR(255)  UNIQUE, indexed
  description     TEXT
  project_type    ENUM project_type       -- reforestation, agroforestry, mangrove_restoration, …
  status          ENUM project_status     -- planning | active | paused | completed
  country         VARCHAR(120)
  methodology     VARCHAR(120)            -- e.g. "VCS VM0047 (ARR)"
  baseline_year   INTEGER
  owner_id        UUID FK → users.id      ON DELETE CASCADE
  created_at / updated_at  TIMESTAMPTZ

sites
  id              UUID PK
  name            VARCHAR(255)
  description     TEXT
  geometry        geometry(MULTIPOLYGON, 4326)   -- GiST index idx_sites_geometry
  area_hectares   NUMERIC(14,4)           -- denormalised, computed by PostGIS on write
  centroid_lat    DOUBLE PRECISION        -- denormalised, for map labels
  centroid_lng    DOUBLE PRECISION
  land_cover      VARCHAR(120)
  planting_year   INTEGER
  project_id      UUID FK → projects.id   ON DELETE CASCADE
  created_at / updated_at  TIMESTAMPTZ
  UNIQUE (project_id, name)

observations
  id                      UUID PK
  measured_on             DATE, indexed
  carbon_sequestered_tco2e  DOUBLE PRECISION
  biomass_tonnes            DOUBLE PRECISION
  ndvi                      DOUBLE PRECISION
  canopy_cover_pct          DOUBLE PRECISION
  tree_count                INTEGER
  biodiversity_index        DOUBLE PRECISION
  species_observed          INTEGER
  data_source             ENUM data_source  -- satellite | field_survey | modelled
  notes                   TEXT
  site_id                 UUID FK → sites.id  ON DELETE CASCADE
  created_at / updated_at TIMESTAMPTZ
  UNIQUE (site_id, measured_on)
```

### Why the schema looks like this

**Wide-but-shallow `observations`.** One row per site per date holding every metric,
rather than an entity-attribute-value table. A site's 36-month history is then a single
indexed range scan instead of a pivot join over thousands of narrow rows.

**`MULTIPOLYGON`, not `POLYGON`.** Mapbox GL Draw emits `Polygon`. Promoting on write means
a site can later hold disjoint parcels (a common real-world case for fragmented
smallholdings) with no migration.

**Denormalised `area_hectares` / centroid.** These are pure functions of the geometry, but
recomputing them per request would mean geodesic maths on every map render. They are
recomputed on every geometry update, so they cannot drift.

**`UNIQUE (site_id, measured_on)`** makes duplicate measurements impossible at the database
level, not just in application code.

**Cascade deletes** on both foreign keys: removing a project removes its sites and their
observations, so no orphaned geometry or time series can survive.

Migrations are version-controlled with Alembic. `alembic check` runs in CI and fails if the
models and migrations have drifted — this catches a forgotten `alembic revision` after a
model change.

---

## API surface

24 operations across 18 paths. Interactive docs at `/docs` (development only).

### Auth

| Method | Path             | Description                                        |
| ------ | ---------------- | -------------------------------------------------- |
| POST   | `/auth/register` | Create an account. The first user becomes `admin`. |
| POST   | `/auth/login`    | Exchange credentials for an access + refresh pair. |
| POST   | `/auth/refresh`  | Rotate an access token using a refresh token.      |
| GET    | `/auth/me`       | Current user profile.                              |
| POST   | `/auth/logout`   | Explicit logout endpoint (JWTs are stateless).     |

### Projects (write operations require `admin`)

| Method | Path                           | Description                                   |
| ------ | ------------------------------ | --------------------------------------------- |
| GET    | `/projects`                    | List with rollups, `?search=` and pagination. |
| POST   | `/projects`                    | Create a project.                             |
| GET    | `/projects/{id}`               | One project with computed rollups.            |
| PATCH  | `/projects/{id}`               | Partial update.                               |
| DELETE | `/projects/{id}`               | Delete, cascading sites and observations.     |
| GET    | `/projects/{id}/sites/geojson` | Sites as a Mapbox-ready FeatureCollection.    |

### Sites

| Method | Path                 | Description                                              |
| ------ | -------------------- | -------------------------------------------------------- |
| GET    | `/sites`             | List, optionally `?project_id=`.                         |
| POST   | `/sites`             | **Create from a drawn polygon.** Area/centroid computed. |
| GET    | `/sites/map/geojson` | Every site as one FeatureCollection for the global map.  |
| GET    | `/sites/{id}`        | Site detail including GeoJSON geometry.                  |
| PATCH  | `/sites/{id}`        | Update, optionally redrawing the boundary.               |
| DELETE | `/sites/{id}`        | Delete, cascading observations.                          |

### Observations & analytics

| Method | Path                       | Description                                      |
| ------ | -------------------------- | ------------------------------------------------ |
| GET    | `/observations/site/{id}`  | Full measurement history, newest first.          |
| POST   | `/observations`            | Record a measurement.                            |
| DELETE | `/observations/{id}`       | Remove a measurement.                            |
| GET    | `/analytics/dashboard`     | Portfolio KPIs, area by type, carbon by month.   |
| GET    | `/analytics/projects/{id}` | Aggregated project analytics + per-site rollups. |
| GET    | `/analytics/sites/{id}`    | Per-metric summaries + chart-ready time series.  |
| GET    | `/health`                  | Liveness plus database and PostGIS reachability. |

### Security notes

- Passwords are bcrypt-hashed (cost 12). Input longer than bcrypt's 72-byte limit is
  rejected rather than silently truncated.
- Login returns an identical error for unknown email and wrong password, so accounts cannot
  be enumerated.
- Access and refresh tokens carry a `type` claim; an access token presented to `/auth/refresh`
  is rejected.
- Inactive users are blocked with 403, not 401, so the reason is distinguishable.
- Swagger UI and ReDoc are disabled when `ENVIRONMENT=production`.

---

## Datasets and why they were chosen

The brief allows any datasets or mocks provided the choice is documented.

**Site geometries** are hand-drawn polygons around real locations in the Gangetic plain —
the Yamuna floodplain near Delhi, agroforestry clusters in Ghaziabad district, and oxbow
wetlands on the upper Ganga. The map therefore opens on a recognisable region rather than
null island, and the parcels are a realistic size for the project types they represent.

**Observations are synthetic but deterministic.** A fixed `random.Random(seed)` stream
generates 36 monthly records per site with:

- a **seasonal NDVI and canopy cycle** peaking in July–August (the northern-hemisphere
  monsoon growing season),
- a **saturating carbon accumulation curve** — sequestration accelerates as canopy closes,
  then plateaus, which is what actual growth curves do,
- **`field_survey` provenance every sixth month** rather than a single uniform source,
  because MRV distinguishes ground-truthed from satellite-derived values.

**Why not real satellite data.** Sentinel-2, Landsat and Planet all require API keys and
rate-limited accounts that a reviewer cannot be assumed to have. Deterministic mocks make
the reviewer's experience identical to the author's, and they keep CI hermetic — no
network, no credentials, no flakiness. The seeder prints what it created so the data is
never a mystery.

The synthetic values are calibrated to plausible published ranges (NDVI 0.3–0.95 for
vegetated land, canopy cover 18–98 %, 3–8 tCO2e/ha/yr for Indian tropical plantations) so
the charts are visually meaningful rather than random noise.

---

## CI/CD pipeline

Three GitHub Actions workflows in `.github/workflows/`:

### `ci.yml` — runs on every push and PR to `main`

```
push / pull_request → main
        │
        ├─► backend job
        │     services: postgis/postgis:17-3.5 (health-checked)
        │     1. pip install -r requirements-dev.txt
        │     2. ruff check app tests
        │     3. ruff format --check app tests
        │     4. mypy app
        │     5. alembic upgrade head && alembic check   ← catches model/migration drift
        │     6. pytest --cov=app --cov-report=xml
        │
        ├─► frontend job
        │     1. npm ci
        │     2. eslint . --max-warnings=0
        │     3. tsc -b --noEmit
        │     4. vitest run
        │     5. vite build  → dist artifact
        │
        └─► formatting job
              prettier --check .   (whole repository)
```

**PostGIS runs as a service container, not a mock.** The tests exercise real geometry
types, GiST indexes, `ST_Area(geography)` and Postgres `DISTINCT ON`. A SQLite stand-in
would pass while the production queries failed.

Concurrency groups cancel superseded runs, so a force-push does not queue three pipelines.

### `deploy-frontend.yml` → Vercel

Triggers on `main` when `frontend/**` changes. Re-runs lint, typecheck and tests **before**
deploying, so a commit pushed with `--no-verify` still cannot reach production broken.
Builds with the Vercel CLI and promotes a prebuilt artifact; the deployment URL is written
to the GitHub environment.

### `deploy-backend.yml` → Railway

Triggers on `main` when `backend/**` changes. Spins up the same PostGIS service, verifies
`alembic upgrade head` and `alembic check` against it, runs the test suite, deploys via the
Railway CLI, then **smoke-tests the live `/api/v1/health` endpoint** with retries so a
failed rollout is reported by the pipeline rather than discovered by a user.

### Required repository secrets

| Secret                 | Used by  | Purpose                                  |
| ---------------------- | -------- | ---------------------------------------- |
| `VERCEL_TOKEN`         | frontend | Vercel CLI authentication                |
| `VERCEL_ORG_ID`        | frontend | Vercel organisation                      |
| `VERCEL_PROJECT_ID`    | frontend | Vercel project                           |
| `RAILWAY_TOKEN`        | backend  | Railway CLI authentication               |
| `RAILWAY_SERVICE_NAME` | backend  | Target Railway service                   |
| `PUBLIC_API_URL`       | backend  | Deployed API base URL for the smoke test |

Environment variables (set in the Vercel / Railway dashboards):

| Variable                 | Where   | Purpose                        |
| ------------------------ | ------- | ------------------------------ |
| `VITE_MAPBOX_TOKEN`      | Vercel  | Mapbox basemap token           |
| `VITE_API_BASE_URL`      | Vercel  | API origin if not same-origin  |
| `DATABASE_URL`           | Railway | Neon PostGIS connection string |
| `SECRET_KEY`             | Railway | JWT signing key                |
| `BACKEND_CORS_ORIGINS`   | Railway | Deployed frontend origin       |
| `ENVIRONMENT=production` | Railway | Disables `/docs` and `/redoc`  |

---

## Code quality enforcement

### Pre-commit hooks (Husky + lint-staged)

`npm install` at the repository root installs the hook. On every commit:

1. **lint-staged** runs on staged files only:
   - `frontend/**/*.{ts,tsx,js,jsx}` → `eslint --fix --max-warnings=0`, then Prettier
   - `backend/**/*.py` → `ruff format`, `ruff check --fix`, `ruff format`
   - `*.{md,json,yml,yaml,css}` → Prettier
2. **Repository-wide static analysis**, because isort and mypy need the full import graph
   to be meaningful:
   - `ruff check` + `ruff format --check`
   - `mypy --config-file backend/pyproject.toml backend/app`

The hook resolves `ruff`/`mypy` from `backend/.venv` when present, so local results match
CI exactly. A `.pre-commit-config.yaml` is also provided for teams that prefer `pre-commit`.

### Tool configuration

| Tool     | Config                   | Notable settings                                                    |
| -------- | ------------------------ | ------------------------------------------------------------------- |
| Ruff     | `backend/pyproject.toml` | `E W F I N UP B C4 SIM RUF`, line length 100                        |
| mypy     | `backend/pyproject.toml` | `check_untyped_defs`, `warn_unused_ignores`, pydantic plugin        |
| ESLint   | `frontend/.eslintrc.cjs` | `@typescript-eslint/recommended`, `react-hooks`, `--max-warnings=0` |
| Prettier | `.prettierrc.json`       | single quotes, trailing commas, 100 columns                         |
| Editor   | `.editorconfig`          | LF, UTF-8, final newline, trim trailing whitespace                  |

### Current status

```
ruff check          All checks passed!
ruff format         45 files already formatted
mypy                Success: no issues found in 38 source files
eslint              clean, 0 warnings
tsc -b --noEmit     clean
pytest              69 passed
vitest              42 passed
prettier --check    all matched files conform
```

---

## Deployment

### Frontend — Vercel

`frontend/vercel.json` sets the build command, output directory and SPA rewrite
(`/(.*)` → `/index.html`, required for client-side routing).

```bash
cd frontend
npx vercel link
npx vercel env add VITE_MAPBOX_TOKEN production
npx vercel --prod
```

Or let `deploy-frontend.yml` do it on every push to `main`.

### Backend — Railway + Neon

Railway runs the service; **Neon provides PostGIS**. Neon was chosen over Railway's own
Postgres plugin because its serverless Postgres images ship PostGIS as an installable
extension and the pooled connection string works directly with psycopg.

```bash
# Neon
psql "$NEON_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Railway
railway init
railway add --plugin postgresql   # or point DATABASE_URL at Neon
railway up --service darukaa-api
```

The container's start command runs `alembic upgrade head` before launching uvicorn, so a
fresh database self-initialises and a redeploy never leaves the schema behind the code.
`railway.json` sets `/api/v1/health` as the health-check path.

### Bundle size

The production build is code-split so the dashboard never downloads the map library:

| Chunk    | Size     | Gzip   | Loaded by                |
| -------- | -------- | ------ | ------------------------ |
| `index`  | 38 kB    | 11 kB  | every page               |
| `react`  | 157 kB   | 51 kB  | every page               |
| `charts` | 184 kB   | 64 kB  | dashboard + detail pages |
| `query`  | 49 kB    | 15 kB  | every page               |
| `mapbox` | 1,949 kB | 548 kB | `/map` only (lazy)       |

`mapbox-gl` is the library the brief specifies and is inherently large; lazy-loading it
keeps it off the critical path for every other route.

---

## Trade-offs

**Sync SQLAlchemy handlers on an async framework.** FastAPI runs `def` endpoints in a
threadpool. SQLAlchemy's async support with GeoAlchemy2 is materially less mature, and the
threadpool model is simpler to reason about at this scale. The API is I/O-bound against a
connection pool, so async ORM would add complexity without a measurable win. Revisit if
concurrency targets rise sharply.

**Denormalised area and centroid columns.** They duplicate information derivable from the
geometry. Accepted because they are recomputed on every geometry write (so they cannot
drift), they remove geodesic maths from every read path, and the map endpoint needs them
for every feature on every render.

**SVG fallback renderer when no Mapbox token is present.** Mapbox is used whenever
`VITE_MAPBOX_TOKEN` is set, and it is the intended production path. The fallback exists so a
reviewer without Mapbox credentials can still see site boundaries and exercise the
draw-to-create flow. Both renderers accept identical props and emit identical GeoJSON, so
the create-site path is unaffected by which one is active. Cost: a small amount of
projection code that production will never run.

**JWT rather than server sessions.** The brief specifies JWT. Access tokens are short-lived
(60 min) and refresh tokens rotate. Logout is stateless — the client discards the token. A
denylist would be needed for true server-side revocation; the `/auth/logout` endpoint exists
as the single place to add it later without changing the client.

**One row per site per date, not one row per metric.** This makes adding a metric a schema
migration rather than a free insert. Accepted because the metric set for MRV is stable and
known, and the read path — which is what the dashboard hammers — is dramatically cheaper.

**Tests hit a real PostGIS database.** Slower than mocking (~17 s for 69 tests) but the only
way to actually verify the geometry behaviour this project exists for. The suite runs
against a dedicated `<dbname>_test` database so it can never destroy a developer's seeded
data.

**First-vs-last change percentages on seasonal data.** `change_pct` compares the first and
last measurement in a window. For seasonal metrics like NDVI this can read as a large change
driven by where in the growing season the window happens to start. The per-year
least-squares `trend_per_year` is the more robust indicator, and both are shown so the
seasonal artefact is visible rather than hidden.

---

## Project layout

```
darukaa-earth/
├── .github/workflows/
│   ├── ci.yml                  # lint + typecheck + test (backend & frontend)
│   ├── deploy-frontend.yml     # Vercel
│   └── deploy-backend.yml      # Railway + live smoke test
├── .husky/pre-commit           # lint-staged + ruff + mypy
├── backend/
│   ├── app/
│   │   ├── api/v1/             # auth, projects, sites, observations, analytics, health
│   │   ├── core/               # config, security, deps, responses
│   │   ├── db/                 # engine, session, declarative base
│   │   ├── models/             # user, project, site, observation
│   │   ├── schemas/            # Pydantic v2 contracts
│   │   ├── services/           # geo, analytics, seed
│   │   └── main.py             # FastAPI app, CORS, exception handlers
│   ├── alembic/                # migrations (0001 = initial PostGIS schema)
│   ├── tests/                  # 69 tests, real PostGIS
│   ├── Dockerfile
│   ├── railway.json
│   └── pyproject.toml          # ruff + mypy + pytest config
├── frontend/
│   ├── src/
│   │   ├── api/                # typed fetch client + endpoint modules
│   │   ├── auth/               # AuthContext, ProtectedRoute
│   │   ├── charts/             # Chart.js wrappers, registration
│   │   ├── components/         # Layout, MapView, MapboxMap, SvgMap, panels
│   │   ├── lib/                # format, analytics transforms, projection
│   │   ├── pages/              # Login, Dashboard, Projects, Project/Site detail, Map
│   │   ├── types/              # API contracts mirroring the Pydantic models
│   │   └── __tests__/          # 42 tests
│   ├── vercel.json
│   └── vite.config.ts          # dev proxy, manual chunks, vitest config
├── scripts/bootstrap.sh        # one-command local setup
├── docker-compose.yml
└── package.json                # root tooling: husky, lint-staged, prettier
```

---

## Testing

### Backend — 69 tests

Run against a real PostgreSQL + PostGIS instance in a dedicated `<dbname>_test` database.
Each test executes inside a transaction that is rolled back at teardown, so tests are
isolated and nothing persists.

| Area                | Coverage                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Auth                | register, login, refresh, token rotation, tampered tokens, inactive users, enumeration safety  |
| Authorisation       | viewer can read but not write; admin-gated mutations return 403                                |
| Projects            | CRUD, duplicate names, invalid enums, out-of-range years, search, cascade delete, rollups      |
| Sites & geometry    | drawn polygons, `Polygon`→`MULTIPOLYGON` promotion, SRID, geodesic area range, stored centroid |
| Geometry edge cases | self-intersecting (repaired via `ST_MakeValid`), degenerate slivers, points rejected, garbage  |
| Analytics           | series construction, summary stats, totals, trends, empty sites, project aggregation           |
| Observations        | create, duplicate-date conflict, range validation, ordering, delete                            |
| Migrations          | `alembic upgrade head` then `alembic check` proves models and migrations agree                 |

### Frontend — 42 tests

Vitest + Testing Library. The pure logic layers carry the coverage, because that is where
the product decisions live:

- **`lib/projection.ts`** — bbox computation, merge, padding, project/unproject round-trips,
  ring serialisation, polygon closure.
- **`lib/analytics.ts`** — series selection, null preservation (gaps must not become zeros),
  cumulative totals, coverage percentage, chart-data construction, headline metric choice.
- **`lib/format.ts`** — number/area/percent/date formatting, missing-value handling,
  key humanisation, project-type colour mapping.

### Running the checks

```bash
# Backend
cd backend && source .venv/bin/activate
pytest                          # full suite
ruff check app tests && ruff format --check app tests
mypy app
alembic upgrade head && alembic check

# Frontend
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build

# Everything, as the pre-commit hook runs it
npx lint-staged
```
